# Thin launcher for docs that already point here.
# Real cutover logic: deploy\lan\scripts\prod-cutover-full.ps1
# PowerShell 5.1 safe: ASCII-only (no em-dash / smart quotes).
$ErrorActionPreference = "Stop"
Set-Location C:\afrakala
$script = Join-Path $PWD "deploy\lan\scripts\prod-cutover-full.ps1"
if (-not (Test-Path -LiteralPath $script)) {
  throw "Missing $script - run: git fetch origin; git checkout staging; git pull origin staging"
}
# Branch/staging tip is the canonical :3100 line; pass through owner approval switch.
powershell -NoProfile -ExecutionPolicy Bypass -File $script -IApproveProdMigrate -Branch staging -TargetShaPrefix any
