#Requires -Version 5.1
<#
.SYNOPSIS
  Promote persons/merge overview-shape fix from staging tip onto PRODUCTION :3000.

.DESCRIPTION
  Run on the PRODUCTION laptop only (C:\afrakala, APP_PORT=3000).
  Do NOT paste this file into the console. Always use -File.

  Fixes: person_merge_candidates_overview returns {items,total,...} but the UI
  treated it as Candidate[] and crashed with "Something went wrong".

  Never: docker compose down -v
  PowerShell 5.1 ASCII-safe.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-cutover-persons-merge-fix.ps1 -SkipBackupConfirm
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [int]$AppPort = 3000,
  [string]$ExpectedBranch = "staging",
  [string]$MinSha = "5b09a0f6",
  [switch]$SkipBackupConfirm
)

$ErrorActionPreference = "Continue"

function Fail([string]$Msg) {
  Write-Host ("FAIL: " + $Msg) -ForegroundColor Red
  throw $Msg
}

function Log([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $Msg)
}

function Invoke-Native([string]$File, [string[]]$ArgList) {
  & $File @ArgList
  if ($LASTEXITCODE -ne 0) {
    Fail ("Command failed (" + $LASTEXITCODE + "): " + $File + " " + ($ArgList -join " "))
  }
}

Write-Host "===== AFRAKALA_PERSONS_MERGE_FIX_CUTOVER_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)
Log ("AppPort=" + $AppPort)

if (-not (Test-Path -LiteralPath $RepoRoot)) { Fail ("Missing " + $RepoRoot) }
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Compose = Join-Path $RepoRoot "deploy\lan\docker-compose.yml"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }
if (-not (Test-Path -LiteralPath $Compose)) { Fail ("Missing " + $Compose) }

Write-Host ""
Write-Host "REQUIRED BEFORE CONTINUE:"
Write-Host "  1) :3100 /persons/merge verified (empty queue OR list, no Something went wrong)"
Write-Host "  2) Fresh DB backup optional for this UI-only fix (no migration)"
Write-Host "  3) Run with -File (do NOT paste)"
if (-not $SkipBackupConfirm) {
  $ans = Read-Host "Type YES to continue"
  if ($ans -ne "YES") { Fail "Aborted" }
}

Log "STEP git fetch/reset to origin/staging"
Invoke-Native git @("fetch", "origin")
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git merge --abort 2>$null | Out-Null
git rebase --abort 2>$null | Out-Null
$ErrorActionPreference = $prev
Invoke-Native git @("checkout", "-f", $ExpectedBranch)
Invoke-Native git @("reset", "--hard", ("origin/" + $ExpectedBranch))

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Log ("BRANCH=" + $branch)
Log ("HEAD=" + $head)
if ($branch -ne $ExpectedBranch) { Fail ("Expected " + $ExpectedBranch) }

git merge-base --is-ancestor $MinSha HEAD
if ($LASTEXITCODE -ne 0) {
  Fail ("HEAD " + $head + " does not contain MinSha " + $MinSha)
}
Log ("MIN_SHA_OK ancestor=" + $MinSha)

$route = Join-Path $RepoRoot "src\routes\_app.persons_.merge.tsx"
if (-not (Test-Path -LiteralPath $route)) { Fail "Missing persons merge route" }
$routeText = Get-Content -LiteralPath $route -Raw
if ($routeText -notmatch "Array\.isArray\(raw\)") {
  Fail "Merge route is missing overview-shape guard; wrong tip"
}
Log "GIT_TREE_OK"

Log "STEP rebuild web"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web
$buildCode = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($buildCode -ne 0) { Fail ("web build/up failed exit=" + $buildCode) }

$ok = $false
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Log ("web try " + $i + " : " + $st)
  if ($st -match "healthy") { $ok = $true; break }
  if ($st -match "Up" -and $i -ge 6) { $ok = $true }
}
if (-not $ok) { Fail "web not up" }

$sha = (docker compose --env-file $EnvFile -f $Compose exec -T web printenv APP_GIT_SHA).Trim()
Log ("APP_GIT_SHA=" + $sha)
if ($sha -ne $head) { Fail ("SHA mismatch container=" + $sha + " head=" + $head) }

$base = "http://127.0.0.1:" + $AppPort
foreach ($p in @("/persons/merge", "/api/version", "/login")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ($base + $p) -MaximumRedirection 0
    Log ("SMOKE " + $p + " -> " + $r.StatusCode)
    if ([int]$r.StatusCode -ge 500) { Fail ("SMOKE 5xx on " + $p) }
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      Log ("SMOKE " + $p + " -> " + $code)
      if ($code -ge 500) { Fail ("SMOKE " + $p + " -> " + $code) }
    } else {
      Fail ("SMOKE " + $p + " FAIL " + $_.Exception.Message)
    }
  }
}

Write-Host "===== AFRAKALA_PERSONS_MERGE_FIX_CUTOVER_END ====="
Write-Host ("CUTOVER_OK HEAD=" + $head + " APP_PORT=" + $AppPort)
Write-Host "Manual check: open /persons/merge logged in as admin - must NOT show Something went wrong."

