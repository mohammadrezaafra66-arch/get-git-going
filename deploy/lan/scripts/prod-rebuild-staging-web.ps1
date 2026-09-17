#Requires -Version 5.1
<#
.SYNOPSIS
  Rebuild afrakala-lan-web on PRODUCTION (:3000) from staging tip after Docker recovery.

.DESCRIPTION
  Implements post-Docker-recovery cutover steps:
  - verify C:\afrakala is on staging
  - rebuild web with GIT_SHA / BUILD_TIME (--no-deps --build)
  - verify APP_GIT_SHA matches HEAD and smoke key routes

  Never: docker compose down -v
  PowerShell 5.1 ASCII-safe.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-rebuild-staging-web.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [int]$AppPort = 3000,
  [string]$ExpectedBranch = "staging"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  throw $Msg
}

function Log([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $Msg)
}

Write-Host "===== AFRAKALA_PROD_REBUILD_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  Fail ("Missing " + $RepoRoot)
}
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Compose = Join-Path $RepoRoot "deploy\lan\docker-compose.yml"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }
if (-not (Test-Path -LiteralPath $Compose)) { Fail ("Missing " + $Compose) }

# --- verify git ---
Log "STEP verify git"
git fetch origin 2>&1 | Out-Host
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Log ("BRANCH=" + $branch)
Log ("HEAD=" + $head)
if ($branch -ne $ExpectedBranch) {
  Log ("Checking out " + $ExpectedBranch)
  git checkout $ExpectedBranch 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail ("git checkout " + $ExpectedBranch + " failed") }
  git pull origin $ExpectedBranch 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  $head = (git rev-parse --short HEAD).Trim()
  Log ("BRANCH=" + $branch)
  Log ("HEAD=" + $head)
} else {
  git pull origin $ExpectedBranch 2>&1 | Out-Host
  $head = (git rev-parse --short HEAD).Trim()
  Log ("HEAD_AFTER_PULL=" + $head)
}

if ($branch -ne $ExpectedBranch) { Fail ("Expected branch " + $ExpectedBranch + " got " + $branch) }
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "src\routes\_app.torob-ops.tsx"))) {
  Fail "Missing torob route after pull"
}
Log "GIT_OK"

# --- docker health ---
Log "STEP docker precheck"
$dv = docker version --format "{{.Server.Version}}" 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$dv") -or ("$dv" -match "ERROR|500")) {
  Fail ("Docker Server not healthy: " + $dv)
}
Log ("DOCKER_SERVER=" + $dv)

# --- rebuild ---
Log "STEP rebuild web"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
Log ("BUILDING GIT_SHA=" + $env:GIT_SHA)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$healthy = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Log ("web try " + $i + " : " + $st)
  if ($st -match "healthy") { $healthy = $true; break }
}
if (-not $healthy) { Fail "web not healthy in time" }

# --- verify SHA ---
Log "STEP verify SHA"
$appSha = (docker compose --env-file $EnvFile -f $Compose exec -T web printenv APP_GIT_SHA).Trim()
Log ("APP_GIT_SHA=" + $appSha)
Start-Sleep -Seconds 3
$ver = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $AppPort + "/api/version") -TimeoutSec 30
Log ("VERSION_COMMIT=" + $ver.commit + " ENV=" + $ver.environment)

if ($appSha -ne $head) {
  Fail ("APP_GIT_SHA " + $appSha + " != HEAD " + $head)
}
$verOk = ($ver.commit -eq $head) -or (("$($ver.commit)" ) -like ($head + "*"))
if (-not $verOk) {
  Fail ("api/version commit " + $ver.commit + " != HEAD " + $head)
}
Log "SHA_OK"

# --- smoke ---
Log "STEP smoke"
$paths = @(
  "/torob-ops",
  "/admin/torob-ops-access",
  "/operations/sales-desk",
  "/pricing/sale-price-types"
)
foreach ($p in $paths) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:" + $AppPort + $p) -MaximumRedirection 0
    Log ("SMOKE " + $p + " -> " + $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Log ("SMOKE " + $p + " -> " + [int]$_.Exception.Response.StatusCode)
    } else {
      Fail ("SMOKE " + $p + " FAIL " + $_.Exception.Message)
    }
  }
}

Write-Host "===== AFRAKALA_PROD_REBUILD_END ====="
Write-Host ("CUTOVER_OK HEAD=" + $head + " APP_GIT_SHA=" + $appSha + " VERSION=" + $ver.commit + " WEB=healthy")
