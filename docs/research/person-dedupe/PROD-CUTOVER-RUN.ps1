# Thin launcher — kept for docs that already point here.
# Real cutover logic: deploy\lan\scripts\prod-cutover-full.ps1
$ErrorActionPreference = "Stop"
Set-Location C:\afrakala
$script = Join-Path $PWD "deploy\lan\scripts\prod-cutover-full.ps1"
if (-not (Test-Path -LiteralPath $script)) {
  throw "Missing $script — run: git pull origin feature/sales-desk"
}
powershell -NoProfile -ExecutionPolicy Bypass -File $script -IApproveProdMigrate
