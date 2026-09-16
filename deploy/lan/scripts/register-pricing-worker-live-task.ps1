# register-pricing-worker-live-task.ps1
# Registers a Windows Scheduled Task that runs pricing-worker-live.ps1 every 1 minute.
# Safe to re-run (unregisters previous task with the same name first).

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerScript = Join-Path $scriptDir "pricing-worker-live.ps1"
if (-not (Test-Path $workerScript)) {
  throw "Missing $workerScript"
}

$taskName = "AfraKala-PricingWorker-Live"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$vbs = Join-Path $scriptDir "run-ps-hidden.vbs"
if (-not (Test-Path $vbs)) { throw "Missing $vbs" }
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$arg = '//B //Nologo "{0}" "{1}" 1' -f $vbs, $workerScript
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arg
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration ([TimeSpan]::FromDays(3650))
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
  -Hidden

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "AfraKala pricing recompute worker every 1 minute (windowless)" `
  -User $env:USERNAME `
  | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host ("Registered and started task: {0}" -f $taskName) -ForegroundColor Green
Write-Host ("Script: {0}" -f $workerScript)
Write-Host "Interval: every 1 minute"
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State
