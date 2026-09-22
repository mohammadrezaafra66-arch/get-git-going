#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy collaboration sidebar pin + HelpHint guides to PRODUCTION (:3000).

.DESCRIPTION
  After this feature is merged to `staging` (and you have verified on :3100):
  - on PRODUCTION laptop only (C:\afrakala)
  - pull staging tip
  - rebuild web with --no-deps (never docker compose down -v)
  - smoke /collaboration and /messages

  Does NOT run migrations. UI-only change.

.EXAMPLE
  # On PRODUCTION laptop, as Admin:
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-deploy-collaboration-help-pin.ps1
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

Write-Host "===== AFRAKALA_PROD_COLLAB_HELP_PIN_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  Fail ("Missing " + $RepoRoot)
}
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Compose = Join-Path $RepoRoot "deploy\lan\docker-compose.yml"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }
if (-not (Test-Path -LiteralPath $Compose)) { Fail ("Missing " + $Compose) }

Log "STEP verify git"
git fetch origin 2>&1 | Out-Host
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne $ExpectedBranch) {
  Log ("Checking out " + $ExpectedBranch)
  git checkout $ExpectedBranch 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail ("git checkout " + $ExpectedBranch + " failed") }
}
git pull origin $ExpectedBranch 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Log ("BRANCH=" + $branch)
Log ("HEAD=" + $head)
if ($branch -ne $ExpectedBranch) { Fail ("Expected branch " + $ExpectedBranch + " got " + $branch) }

$marker = Join-Path $RepoRoot "src\lib\messenger\collaboration-help.ts"
if (-not (Test-Path -LiteralPath $marker)) {
  Fail "Missing collaboration-help.ts — feature not on this tip yet. Merge to staging first."
}
Log "FEATURE_FILES_OK"

Log "STEP rebuild web (--no-deps)"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
Log ("BUILDING GIT_SHA=" + $env:GIT_SHA)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$ok = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Log ("web try $i : $st")
  if ($st -match "healthy") { $ok = $true; break }
}
if (-not $ok) { Fail "web not healthy" }

$sha = (docker compose --env-file $EnvFile -f $Compose exec -T web printenv APP_GIT_SHA).Trim()
Log ("APP_GIT_SHA=" + $sha)
if ($sha -ne $head) { Fail ("APP_GIT_SHA " + $sha + " != HEAD " + $head) }

try {
  $ver = Invoke-RestMethod ("http://127.0.0.1:" + $AppPort + "/api/version") -TimeoutSec 30
  Log ("VERSION=" + $ver.commit)
} catch {
  Log ("VERSION_WARN " + $_.Exception.Message)
}

foreach ($p in @("/collaboration", "/messages", "/messages/inquiries", "/operations/sales-desk", "/operations/work")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:" + $AppPort + $p) -MaximumRedirection 0
    Log ("SMOKE $p -> $($r.StatusCode)")
  } catch {
    if ($_.Exception.Response) {
      Log ("SMOKE $p -> $([int]$_.Exception.Response.StatusCode)")
    } else {
      Fail ("SMOKE $p FAIL " + $_.Exception.Message)
    }
  }
}

Write-Host ("CUTOVER_OK HEAD=" + $head + " APP_GIT_SHA=" + $sha + " PORT=" + $AppPort)
Write-Host "===== AFRAKALA_PROD_COLLAB_HELP_PIN_END ====="
