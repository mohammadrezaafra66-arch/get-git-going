# =============================================================================
# AfraKala PRODUCTION FULL CUTOVER (C:\afrakala, port 3000)
# PowerShell 5.1 safe, ASCII-only comments.
# Run ONE STEP at a time in an elevated PowerShell on the PRODUCTION laptop.
# Do NOT run on the test PC (192.168.170.8).
# Signature: PROD-CUTOVER-FULL v1
# =============================================================================

$ErrorActionPreference = "Stop"
$Root = "C:\afrakala"
$Lan = Join-Path $Root "deploy\lan"
$EnvFile = Join-Path $Lan ".env.lan"
$Compose = Join-Path $Lan "docker-compose.yml"
$DbContainer = "afrakala-lan-db"
$DbName = "postgres"
$WebPort = 3000
$Branch = "staging"

function Section([string]$t) {
  Write-Host ""
  Write-Host "========================================================================"
  Write-Host $t
  Write-Host "========================================================================"
}
function Fail([string]$m) { throw $m }

Section "PRECHECK"
if (-not (Test-Path -LiteralPath $Root)) { Fail "Missing $Root" }
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail "Missing $EnvFile" }
if (-not (Test-Path -LiteralPath $Compose)) { Fail "Missing $Compose" }
$cwd = docker inspect afrakala-lan-web --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>$null
Write-Host ("live_compose_working_dir=" + $cwd)
if ($cwd -and ($cwd -notlike "*\afrakala\deploy\lan*")) {
  Write-Host "WARNING: live web may not be C:\afrakala - abort if unexpected." -ForegroundColor Yellow
}
Write-Host "PRECHECK OK. Next: run steps in order (see PROD-CUTOVER-FULL.md)."
