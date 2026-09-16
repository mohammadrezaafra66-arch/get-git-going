# Registers AMI listener task (requires ISSABEL_AMI_USER/SECRET in .env.lan).
# Prefer CEL poller until AMI credentials exist.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = Join-Path $scriptDir "issabel-ami-listener.mjs"
$wrapper = Join-Path $scriptDir "issabel-ami-listener-run.ps1"
if (-not (Test-Path $listener)) { throw "Missing $listener" }

$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
@"
`$ErrorActionPreference = 'Stop'
Set-Location '$repoRoot'
while (`$true) {
  try {
    node '$listener'
  } catch {
    Write-Host `$_.Exception.Message
  }
  Start-Sleep -Seconds 5
}
"@ | Set-Content -Path $wrapper -Encoding ASCII

$taskName = "AfraKala-IssabelAmiListener"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $wrapper
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "AfraKala AMI live ring listener for caller-ID popup" `
  -User $env:USERNAME `
  | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host ("Registered and started: {0}" -f $taskName) -ForegroundColor Green
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State
