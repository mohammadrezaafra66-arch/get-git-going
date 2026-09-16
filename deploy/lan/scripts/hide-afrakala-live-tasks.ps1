# hide-afrakala-live-tasks.ps1
# Run ONCE as Administrator. Hides AfraKala live worker consoles.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"

function Set-HiddenAction([string]$taskName, [string]$scriptFile) {
  $arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $scriptFile
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
  try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  } catch {}
  Set-ScheduledTask -TaskName $taskName -Action $action -ErrorAction Stop | Out-Null
}

function Recreate-CelRingHidden {
  $taskName = "AfraKala-IssabelCelRing"
  $scriptFile = "D:\AfraKalaTest\app\deploy\lan\scripts\issabel-cel-ring-poller-run.ps1"
  if (-not (Test-Path $scriptFile)) { throw "Missing $scriptFile" }

  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

  $arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $scriptFile
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650)

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "AfraKala CEL poller (hidden, no console)" `
    -User $env:USERNAME `
    -ErrorAction Stop | Out-Null

  Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

$ok = 0
$fail = 0

# 1) Import + Pricing — usually already present; just force Hidden action
foreach ($t in @(
  @{ Name = "AfraKala-IssabelImport-Live"; File = "D:\AfraKalaTest\app\deploy\lan\scripts\issabel-import-live.ps1" },
  @{ Name = "AfraKala-PricingWorker-Live"; File = "D:\AfraKalaTest\app\deploy\lan\scripts\pricing-worker-live.ps1" }
)) {
  if (-not (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue)) {
    Write-Host ("SKIP missing task: {0}" -f $t.Name) -ForegroundColor Yellow
    continue
  }
  try {
    Set-HiddenAction $t.Name $t.File
    Write-Host ("HIDDEN OK: {0}" -f $t.Name) -ForegroundColor Green
    $ok++
  } catch {
    Write-Host ("FAIL {0}: {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Red
    $fail++
  }
}

# 2) CelRing — often locked; recreate clean if Set fails
$cel = "AfraKala-IssabelCelRing"
$celFile = "D:\AfraKalaTest\app\deploy\lan\scripts\issabel-cel-ring-poller-run.ps1"
try {
  if (Get-ScheduledTask -TaskName $cel -ErrorAction SilentlyContinue) {
    Set-HiddenAction $cel $celFile
    Write-Host ("HIDDEN OK: {0}" -f $cel) -ForegroundColor Green
  } else {
    Recreate-CelRingHidden
    Write-Host ("CREATED HIDDEN: {0}" -f $cel) -ForegroundColor Green
  }
  $ok++
} catch {
  Write-Host ("Set failed for {0}, recreating..." -f $cel) -ForegroundColor Yellow
  try {
    Recreate-CelRingHidden
    Write-Host ("RECREATED HIDDEN: {0}" -f $cel) -ForegroundColor Green
    $ok++
  } catch {
    Write-Host ("FAIL {0}: {1}" -f $cel, $_.Exception.Message) -ForegroundColor Red
    $fail++
  }
}

Write-Host ""
Write-Host ("Done. ok={0} fail={1}" -f $ok, $fail)
Get-ScheduledTask | Where-Object { $_.TaskName -like "AfraKala-*" } | ForEach-Object {
  $a = $_.Actions | Select-Object -First 1
  $flag = if ($a.Arguments -like "*WindowStyle Hidden*") { "HIDDEN" } else { "VISIBLE" }
  "{0} [{1}] {2}" -f $_.TaskName, $flag, $a.Arguments
}
