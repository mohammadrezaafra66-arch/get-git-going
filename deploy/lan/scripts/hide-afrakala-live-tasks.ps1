# hide-afrakala-live-tasks.ps1
# Run ONCE as Administrator. Makes AfraKala live workers truly windowless
# via wscript + run-ps-hidden.vbs (style 0). WindowStyle Hidden alone still flashes.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $scriptDir "run-ps-hidden.vbs"
if (-not (Test-Path $vbs)) { throw "Missing $vbs" }

$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
if (-not (Test-Path $wscript)) { throw "Missing $wscript" }

function Set-WindowlessAction {
  param(
    [Parameter(Mandatory = $true)][string]$TaskName,
    [Parameter(Mandatory = $true)][string]$Ps1Path,
    [Parameter(Mandatory = $true)][string]$WaitArg
  )
  if (-not (Test-Path $Ps1Path)) { throw "Missing $Ps1Path" }
  if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    throw "Task not found: $TaskName"
  }

  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}

  $arg = '//B //Nologo "{0}" "{1}" {2}' -f $vbs, $Ps1Path, $WaitArg
  $action = New-ScheduledTaskAction -Execute $wscript -Argument $arg
  Set-ScheduledTask -TaskName $TaskName -Action $action -ErrorAction Stop | Out-Null

  # Mark Hidden via COM (optional; does not affect console flashing)
  try {
    $svc = New-Object -ComObject Schedule.Service
    $svc.Connect()
    $folder = $svc.GetFolder("\")
    $t = $folder.GetTask($TaskName)
    $def = $t.Definition
    $def.Settings.Hidden = $true
    $folder.RegisterTaskDefinition($TaskName, $def, 4, $null, $null, 3) | Out-Null
  } catch {}
}

function Recreate-CelRingWindowless {
  $taskName = "AfraKala-IssabelCelRing"
  $ps1 = Join-Path $scriptDir "issabel-cel-ring-poller-run.ps1"
  if (-not (Test-Path $ps1)) { throw "Missing $ps1" }

  try { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue } catch {}
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  # Force remove if still present
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    schtasks /Delete /TN $taskName /F | Out-Null
    Start-Sleep -Seconds 1
  }

  $arg = '//B //Nologo "{0}" "{1}" 0' -f $vbs, $ps1
  $action = New-ScheduledTaskAction -Execute $wscript -Argument $arg
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -Hidden

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "AfraKala CEL poller (windowless via wscript)" `
    -User $env:USERNAME `
    -ErrorAction Stop | Out-Null

  try {
    $svc = New-Object -ComObject Schedule.Service
    $svc.Connect()
    $folder = $svc.GetFolder("\")
    $t = $folder.GetTask($taskName)
    $def = $t.Definition
    $def.Settings.Hidden = $true
    $folder.RegisterTaskDefinition($taskName, $def, 4, $null, $null, 3) | Out-Null
  } catch {}

  Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

$ok = 0
$fail = 0

# Kill orphan CEL node consoles before rebind
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match 'issabel-cel-ring-poller\.mjs'
} | ForEach-Object {
  try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

foreach ($t in @(
  @{ Name = "AfraKala-IssabelImport-Live"; File = (Join-Path $scriptDir "issabel-import-live.ps1"); Wait = "1" },
  @{ Name = "AfraKala-PricingWorker-Live"; File = (Join-Path $scriptDir "pricing-worker-live.ps1"); Wait = "1" },
  @{ Name = "AfraKala-IssabelCelRing"; File = (Join-Path $scriptDir "issabel-cel-ring-poller-run.ps1"); Wait = "0" }
)) {
  if (-not (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue)) {
    if ($t.Name -eq "AfraKala-IssabelCelRing") {
      try {
        Recreate-CelRingWindowless
        Write-Host ("CREATED WINDOWLESS: {0}" -f $t.Name) -ForegroundColor Green
        $ok++
      } catch {
        Write-Host ("FAIL {0}: {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Red
        $fail++
      }
    } else {
      Write-Host ("SKIP missing task: {0}" -f $t.Name) -ForegroundColor Yellow
    }
    continue
  }

  try {
    Set-WindowlessAction -TaskName $t.Name -Ps1Path $t.File -WaitArg $t.Wait
    if ($t.Name -eq "AfraKala-IssabelCelRing") {
      Start-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue
    }
    Write-Host ("WINDOWLESS OK: {0}" -f $t.Name) -ForegroundColor Green
    $ok++
  } catch {
    if ($t.Name -eq "AfraKala-IssabelCelRing") {
      Write-Host ("Set failed for {0}, recreating..." -f $t.Name) -ForegroundColor Yellow
      try {
        Recreate-CelRingWindowless
        Write-Host ("RECREATED WINDOWLESS: {0}" -f $t.Name) -ForegroundColor Green
        $ok++
      } catch {
        Write-Host ("FAIL {0}: {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Red
        $fail++
      }
    } else {
      Write-Host ("FAIL {0}: {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Red
      $fail++
    }
  }
}

Write-Host ""
Write-Host ("Done. ok={0} fail={1}" -f $ok, $fail)
Get-ScheduledTask | Where-Object { $_.TaskName -like "AfraKala-*" } | ForEach-Object {
  $a = $_.Actions | Select-Object -First 1
  $flag = if ($a.Execute -like "*wscript*") { "WINDOWLESS" } else { "STILL_VISIBLE" }
  "{0} [{1}] Hidden={2} | {3} {4}" -f $_.TaskName, $flag, $_.Settings.Hidden, $a.Execute, $a.Arguments
}
