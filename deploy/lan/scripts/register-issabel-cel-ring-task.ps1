# Registers a HIDDEN Windows Scheduled Task for the CEL call poller.
# No visible console window. Safe to re-run. ASCII-only.
# Run elevated (Administrator) once.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$poller = Join-Path $scriptDir "issabel-cel-ring-poller.mjs"
if (-not (Test-Path $poller)) { throw "Missing $poller" }

$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$nodeCmd = (Get-Command node -ErrorAction Stop).Source

$taskName = "AfraKala-IssabelCelRing"

# Stop/remove previous (including any visible-window version).
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $wrapper
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -Hidden

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "AfraKala hidden CEL poller (inbound+outbound caller popup)" `
  -User $env:USERNAME `
  | Out-Null

# Mark task hidden at COM level as well (belt and suspenders).
try {
  $svc = New-Object -ComObject Schedule.Service
  $svc.Connect()
  $folder = $svc.GetFolder("\")
  $task = $folder.GetTask($taskName)
  $def = $task.Definition
  $def.Settings.Hidden = $true
  $folder.RegisterTaskDefinition($taskName, $def, 4, $null, $null, 3) | Out-Null
} catch {
  Write-Host "Note: COM Hidden flag skipped ($($_.Exception.Message))"
}

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
Write-Host ("Registered HIDDEN task: {0}" -f $taskName) -ForegroundColor Green
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State
Write-Host "No console window. Logs: deploy\lan\logs\issabel-cel-ring.log"
