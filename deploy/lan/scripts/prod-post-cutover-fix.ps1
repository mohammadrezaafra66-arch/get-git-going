# AfraKala prod post-cutover fix (ASCII, PS 5.1)
# Run as Administrator on production:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\prod-post-cutover-fix.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = "C:\afrakala"
$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Scripts = Join-Path $RepoRoot "deploy\lan\scripts"
$Logs = Join-Path $RepoRoot "deploy\lan\logs"

function Get-EnvLineValue([string]$path, [string]$key) {
  $line = Select-String -Path $path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
}

Write-Host "=== POST_CUTOVER_FIX ==="
Set-Location -LiteralPath $RepoRoot
Write-Host ("HEAD=" + (git rev-parse --short HEAD).Trim())
Write-Host ("WEB=" + (docker inspect afrakala-lan-web --format "{{.State.Health.Status}}"))

Write-Host "`n[1/3] re-register windowless tasks..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "register-issabel-import-live-task.ps1")
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "register-issabel-cel-ring-task.ps1")
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "register-pricing-worker-live-task.ps1")

Get-ScheduledTask -TaskName "AfraKala-IssabelImport-Live","AfraKala-IssabelCelRing","AfraKala-PricingWorker-Live" |
  Select-Object TaskName, State | Format-Table -AutoSize

Write-Host "`n[2/3] token presence (no values)..."
$keys = @(
  "APP_PORT",
  "ISSABEL_IMPORT_WORKER_TOKEN",
  "PRICING_WORKER_TOKEN",
  "ISSABEL_CDR_HOST",
  "ISSABEL_CDR_USER"
)
foreach ($k in $keys) {
  $fv = Get-EnvLineValue $EnvFile $k
  $fileHas = -not [string]::IsNullOrWhiteSpace($fv)
  $ctr = ""
  try { $ctr = (docker exec afrakala-lan-web printenv $k 2>$null) } catch { $ctr = "" }
  $ctrHas = -not [string]::IsNullOrWhiteSpace($ctr)
  if ($k -match "TOKEN|PASSWORD") {
    $sameLen = $false
    if ($fileHas -and $ctrHas) { $sameLen = ($fv.Length -eq $ctr.Length) }
    Write-Host ("{0}: file={1} container={2} sameLen={3}" -f $k, $fileHas, $ctrHas, $sameLen)
  } else {
    Write-Host ("{0}: file={1} container_set={2} container_val={3}" -f $k, $fileHas, $ctrHas, $ctr)
  }
}

Write-Host "`n[3/3] one-shot workers..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "issabel-import-live.ps1")
Write-Host ("IMPORT_EXIT=" + $LASTEXITCODE)
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "pricing-worker-live.ps1")
Write-Host ("PRICING_EXIT=" + $LASTEXITCODE)

Write-Host "`n--- import tail ---"
if (Test-Path (Join-Path $Logs "issabel-import-live.log")) {
  Get-Content (Join-Path $Logs "issabel-import-live.log") -Tail 3
}
Write-Host "--- pricing tail ---"
if (Test-Path (Join-Path $Logs "pricing-worker-live.log")) {
  Get-Content (Join-Path $Logs "pricing-worker-live.log") -Tail 3
}
Write-Host "--- cel tail ---"
if (Test-Path (Join-Path $Logs "issabel-cel-ring-poller.log")) {
  Get-Content (Join-Path $Logs "issabel-cel-ring-poller.log") -Tail 3
}

Write-Host "`n=== POST_FIX_DONE ==="
