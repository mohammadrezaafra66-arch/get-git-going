# register-issabel-import-live-task.ps1
# Registers a Windows Scheduled Task that runs issabel-import-live.ps1 every 2 minutes.
# Safe to re-run (unregisters previous task with the same name first).

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$importScript = Join-Path $scriptDir "issabel-import-live.ps1"
if (-not (Test-Path $importScript)) {
  throw "Missing $importScript"
}

$taskName = "AfraKala-IssabelImport-Live"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $importScript
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) `
  -RepetitionDuration ([TimeSpan]::FromDays(3650))
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -Hidden

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "AfraKala live Issabel CDR import every 2 minutes (sales-desk caller popup)" `
  -User $env:USERNAME `
  | Out-Null

# Kick once immediately so the user does not wait for the first trigger.
Start-ScheduledTask -TaskName $taskName

Write-Host ("Registered and started task: {0}" -f $taskName) -ForegroundColor Green
Write-Host ("Script: {0}" -f $importScript)
Write-Host "Interval: every 2 minutes"
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State
