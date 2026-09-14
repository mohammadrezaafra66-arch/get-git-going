<#
.SYNOPSIS
  AfraKala production database backup: dump, verify, copy to a second physical
  destination, prune by a stated retention rule. Fails loudly.

.DESCRIPTION
  Replaces the 2026-06-14 AfraKala-AutoBackup.ps1 (see git history for the old file).
  What was kept, because it is proven on the production laptop:
    docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/<file>
    docker cp afrakala-lan-db:/tmp/<file> <host path>
  What changed, and why (measured 2026-09-13/14):
    - D:\ does not exist on this machine. The old C:->D: mirror was wrapped in
      Test-Path, so it silently did nothing and the task still returned 0.
      Every dump lived on C:, the same disk as the database.
      Here a missing destination is a non-zero exit, never a skipped block.
    - C: and F: are two partitions of ONE NVMe disk (Disk 0). F: is not a second
      physical destination. The only second physical destination measured is the
      SMB share on the test computer, so that is the default -SecondRoot.
    - pg_dump's exit code was never checked. 2026-08-12 and 2026-08-13 have a
      project zip but no dump, and nothing reported it.
      Here every native call is checked, and the dump is verified with
      pg_restore --list before it counts as a backup.
    - Old files were pruned BEFORE the new dump was taken, by age (90 days).
      If dumps keep failing, age-based pruning eventually deletes the last good
      one. Here pruning runs only after a verified dump, and it is count/calendar
      based, so it can never delete the newest backups.
    - The old script zipped src + deploy of C:\AfraKalaServer\get-git-going01lan
      (1.3 MB, unchanged since May): the code lives in git, so that is dropped.
    - The old script started Start_Bot_FullBackup.bat, which runs
      /app/server/start-bot.js (measured ABSENT in afrakala-lan-web) and ends with
      `pause`, i.e. it waits forever in a hidden window. Dropped.
    - It showed a WinForms MessageBox from a scheduled task. Dropped; the exit
      code and LAST-RUN-STATUS.txt are the signal.
    - Two tasks ran this script at the same minute. A lock file now makes a
      second concurrent run exit 30 instead of racing on the same temp file.

  Not covered (measured 2026-09-14, recorded so nobody assumes otherwise):
    - Storage volume afrakala-lan_lan-storage-data: 0 files, storage.objects 0 rows.
      Nothing to back up today. If uploads start, this script does not cover them.
    - Role globals (pg_dumpall --globals-only): roles are recreated by the
      deploy/supabase init scripts and db-role-fix; not dumped here.

  ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less file as ANSI.

.PARAMETER LocalRoot
  First destination. Must be on a drive that exists. Default F:\AfraKalaBackups\db
  (separate partition from C:, same physical disk - see above).
.PARAMETER SecondRoot
  Second physical destination. A failure to copy AND hash-verify here exits 20.
.PARAMETER KeepDaily / KeepWeekly / KeepMonthly
  Retention (see Get-RetentionPlan). Defaults 30 / 12 / 13.
.PARAMETER PlanOnly
  Preflight + print the retention plan for files already present. Takes no dump,
  copies nothing, deletes nothing, writes no log.

.NOTES
  Install as (see docs/runbooks/backup-and-autostart-20260914.md):
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<this file>"

  Exit codes:
     0  dump verified on BOTH destinations, retention applied
    10  preflight failed (drive missing, container not running, low disk space)
    11  pg_dump failed
    12  pg_restore --list verification failed (unreadable dump or missing tables)
    13  local copy failed or its SHA256 differs from the file inside the container
    20  local backup is GOOD, but the second destination copy did not happen or
        did not verify. Treat as a failed backup: the data is on one disk only.
    30  another backup run holds the lock
    99  unexpected error
#>
[CmdletBinding()]
param(
    [string]$LocalRoot = 'F:\AfraKalaBackups\db',
    [string]$SecondRoot = '\\192.168.170.8\dumps\afrakala-prod-db',
    [string]$DbContainer = 'afrakala-lan-db',
    [string]$DbUser = 'postgres',
    [string]$DbName = 'postgres',
    [int]$KeepDaily = 30,
    [int]$KeepWeekly = 12,
    [int]$KeepMonthly = 13,
    [int]$MinFreeGB = 5,
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$DumpName = "afrakala-db-$Stamp.dump"
$DumpPattern = '^afrakala-db-(\d{8})-(\d{6})\.dump$'
$ContainerDump = "/tmp/afrakala-backup-$Stamp.dump"
$ContainerToc = "/tmp/afrakala-backup-$Stamp.toc"
$LogFile = Join-Path $LocalRoot 'backup-log.txt'
$StatusFile = Join-Path $LocalRoot 'LAST-RUN-STATUS.txt'
$script:Lines = New-Object System.Collections.Generic.List[string]

function Write-Log {
    param([string]$Text)
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text
    $script:Lines.Add($line)
    Write-Host $line
}

# Runs a native command without letting PowerShell 5.1 turn its stderr into a
# terminating error. Returns exit code and merged output as strings.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ Code = $code; Output = @($out) }
}

function Save-Status {
    param([int]$Code, [string]$Summary)
    if ($PlanOnly) { return }
    try {
        if (Test-Path -LiteralPath $LocalRoot) {
            $header = @(
                "result      : $Summary",
                "exit code   : $Code",
                "finished    : $(Get-Date -Format o)",
                "computer    : $env:COMPUTERNAME",
                "script      : $PSCommandPath",
                "local root  : $LocalRoot",
                "second root : $SecondRoot",
                ''
            )
            Set-Content -LiteralPath $StatusFile -Value ($header + $script:Lines) -Encoding ASCII
            Add-Content -LiteralPath $LogFile -Value ($script:Lines + "EXIT $Code $Summary", '') -Encoding ASCII
        }
    } catch {
        Write-Host "could not write status file: $($_.Exception.Message)"
    }
}

function Stop-Backup {
    param([int]$Code, [string]$Summary)
    Write-Log "EXIT $Code - $Summary"
    Save-Status -Code $Code -Summary $Summary
    exit $Code
}

# Retention rule. Given dump file names, returns which to keep and which to delete.
#   keep the newest dump of each of the newest $Daily calendar days,
#   plus the newest dump of each of the newest $Weekly weeks (Monday-based),
#   plus the newest dump of each of the newest $Monthly calendar months.
# Only names matching afrakala-db-yyyyMMdd-HHmmss.dump are ever candidates; any
# other file (hand-made dumps such as *-post-release-696.dump) is never touched.
# The newest dump is always kept, so pruning can never empty a destination.
function Get-RetentionPlan {
    param([string[]]$Names, [int]$Daily, [int]$Weekly, [int]$Monthly)
    $items = @()
    foreach ($n in $Names) {
        if ($n -match '^afrakala-db-(\d{8})-(\d{6})\.dump$') {
            $when = [datetime]::ParseExact($Matches[1] + $Matches[2], 'yyyyMMddHHmmss', [System.Globalization.CultureInfo]::InvariantCulture)
            $monday = $when.Date.AddDays(-(([int]$when.DayOfWeek + 6) % 7))
            $items += [pscustomobject]@{
                Name  = $n
                When  = $when
                Day   = $when.ToString('yyyyMMdd')
                Week  = $monday.ToString('yyyyMMdd')
                Month = $when.ToString('yyyyMM')
            }
        }
    }
    $items = @($items | Sort-Object When -Descending)
    $keep = @{}
    foreach ($rule in @(@('Day', $Daily), @('Week', $Weekly), @('Month', $Monthly))) {
        $field = $rule[0]; $limit = [int]$rule[1]
        $seen = @{}
        foreach ($it in $items) {
            $key = $it.$field
            if ($seen.ContainsKey($key)) { continue }
            if ($seen.Count -ge $limit) { break }
            $seen[$key] = $true
            $keep[$it.Name] = $true
        }
    }
    if ($items.Count -gt 0) { $keep[$items[0].Name] = $true }
    return [pscustomobject]@{
        Keep   = @($items | Where-Object { $keep.ContainsKey($_.Name) } | ForEach-Object { $_.Name })
        Delete = @($items | Where-Object { -not $keep.ContainsKey($_.Name) } | ForEach-Object { $_.Name })
    }
}

function Invoke-Prune {
    param([string]$Root, [string]$Label)
    $names = @(Get-ChildItem -LiteralPath $Root -File | Where-Object { $_.Name -match $DumpPattern } | ForEach-Object { $_.Name })
    $plan = Get-RetentionPlan -Names $names -Daily $KeepDaily -Weekly $KeepWeekly -Monthly $KeepMonthly
    Write-Log "retention $Label : $($names.Count) dumps, keep $($plan.Keep.Count), delete $($plan.Delete.Count)"
    foreach ($n in $plan.Delete) {
        if ($PlanOnly) {
            Write-Log "  would delete $Label\$n"
            continue
        }
        Remove-Item -LiteralPath (Join-Path $Root $n) -Force
        $side = Join-Path $Root ($n + '.sha256')
        if (Test-Path -LiteralPath $side) { Remove-Item -LiteralPath $side -Force }
        Write-Log "  deleted $Label\$n"
    }
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$lock = $null
try {
    Write-Log "AfraKala DB backup start. PlanOnly=$PlanOnly"

    # ---- 1. preflight ----------------------------------------------------------
    $qualifier = Split-Path -Path $LocalRoot -Qualifier
    if (-not (Test-Path -LiteralPath ($qualifier + '\'))) {
        Write-Log "FAIL: drive $qualifier does not exist on $env:COMPUTERNAME. Pass -LocalRoot on a drive that exists."
        $LocalRoot = Join-Path $env:TEMP 'afrakala-backup-status'
        if (-not $PlanOnly) { New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null }
        $StatusFile = Join-Path $LocalRoot 'LAST-RUN-STATUS.txt'
        $LogFile = Join-Path $LocalRoot 'backup-log.txt'
        Stop-Backup 10 "local drive $qualifier missing"
    }
    if (-not $PlanOnly) { New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null }

    if (-not $PlanOnly) {
        try {
            $lock = New-Object System.IO.FileStream((Join-Path $LocalRoot '.backup.lock'), [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        } catch {
            Write-Log 'another backup run holds .backup.lock'
            exit 30
        }
    }

    $running = Invoke-Native 'docker' @('inspect', '-f', '{{.State.Running}}', $DbContainer)
    if ($running.Code -ne 0 -or ($running.Output -join '') -notmatch 'true') {
        Stop-Backup 10 "container $DbContainer is not running (docker inspect exit $($running.Code))"
    }
    Write-Log "container $DbContainer running"

    if (Test-Path -LiteralPath ($qualifier + '\')) {
        $freeGB = [math]::Round((Get-PSDrive -Name $qualifier.TrimEnd(':')).Free / 1GB, 1)
        Write-Log "local free space on $qualifier : $freeGB GB (minimum $MinFreeGB)"
        if ($freeGB -lt $MinFreeGB) { Stop-Backup 10 "only $freeGB GB free on $qualifier" }
    }

    $secondReachable = Test-Path -LiteralPath (Split-Path -Path $SecondRoot -Parent)
    Write-Log "second destination parent reachable: $secondReachable ($SecondRoot)"

    if ($PlanOnly) {
        if (Test-Path -LiteralPath $LocalRoot) { Invoke-Prune -Root $LocalRoot -Label 'local' } else { Write-Log "local root does not exist yet: $LocalRoot" }
        if ($secondReachable -and (Test-Path -LiteralPath $SecondRoot)) { Invoke-Prune -Root $SecondRoot -Label 'second' } else { Write-Log "second root not present yet: $SecondRoot" }
        if (-not $secondReachable) {
            Write-Log 'PLAN: a real run would exit 20 (second destination unreachable)'
            exit 20
        }
        Write-Log 'PLAN OK: preflight passed; no dump taken, nothing copied or deleted'
        exit 0
    }

    # ---- 2. dump inside the container (proven form) ---------------------------
    Write-Log "pg_dump -U $DbUser -d $DbName -Fc -> $ContainerDump"
    $dump = Invoke-Native 'docker' @('exec', $DbContainer, 'pg_dump', '-U', $DbUser, '-d', $DbName, '-Fc', '-f', $ContainerDump)
    foreach ($l in $dump.Output) { Write-Log "  pg_dump: $l" }
    if ($dump.Code -ne 0) { Stop-Backup 11 "pg_dump exit $($dump.Code)" }

    # ---- 3. verify with pg_restore --list, inside the container ----------------
    $toc = Invoke-Native 'docker' @('exec', $DbContainer, 'sh', '-c', "pg_restore --list $ContainerDump > $ContainerToc && grep -c ' TABLE DATA public ' $ContainerToc && wc -l < $ContainerToc")
    if ($toc.Code -ne 0 -or $toc.Output.Count -lt 2) {
        foreach ($l in $toc.Output) { Write-Log "  pg_restore: $l" }
        Stop-Backup 12 "pg_restore --list failed (exit $($toc.Code)) - the dump is not readable"
    }
    $dumpTables = [int]($toc.Output[0].Trim())
    $tocLines = [int]($toc.Output[1].Trim())
    $liveQ = "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname = 'public' and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')"
    $live = Invoke-Native 'docker' @('exec', $DbContainer, 'psql', '-U', $DbUser, '-d', $DbName, '-Atc', $liveQ)
    if ($live.Code -ne 0) { Stop-Backup 12 "could not count live tables (psql exit $($live.Code))" }
    $liveTables = [int](($live.Output -join '').Trim())
    Write-Log "pg_restore --list OK: $tocLines TOC entries; public TABLE DATA $dumpTables; live public tables $liveTables"
    if ($dumpTables -lt $liveTables) {
        Stop-Backup 12 "dump has data for $dumpTables public tables but the database has $liveTables"
    }

    $inner = Invoke-Native 'docker' @('exec', $DbContainer, 'sha256sum', $ContainerDump)
    if ($inner.Code -ne 0) { Stop-Backup 13 "sha256sum inside container failed (exit $($inner.Code))" }
    $innerHash = (($inner.Output -join ' ').Trim() -split '\s+')[0].ToLowerInvariant()

    # ---- 4. copy out, prove byte-identical, then publish the name ---------------
    $localPartial = Join-Path $LocalRoot ($DumpName + '.partial')
    $localFinal = Join-Path $LocalRoot $DumpName
    $cp = Invoke-Native 'docker' @('cp', "${DbContainer}:$ContainerDump", $localPartial)
    foreach ($l in $cp.Output) { if ($l) { Write-Log "  docker cp: $l" } }
    if ($cp.Code -ne 0 -or -not (Test-Path -LiteralPath $localPartial)) { Stop-Backup 13 "docker cp exit $($cp.Code)" }
    $localHash = Get-Sha256 $localPartial
    if ($localHash -ne $innerHash) { Stop-Backup 13 "local SHA256 $localHash differs from container $innerHash" }
    Move-Item -LiteralPath $localPartial -Destination $localFinal
    Set-Content -LiteralPath ($localFinal + '.sha256') -Value "$localHash  $DumpName" -Encoding ASCII
    $sizeMB = [math]::Round((Get-Item -LiteralPath $localFinal).Length / 1MB, 2)
    Write-Log "LOCAL OK: $localFinal ($sizeMB MB, sha256 $localHash)"

    Invoke-Prune -Root $LocalRoot -Label 'local'

    # ---- 5. second physical destination ----------------------------------------
    $secondOk = $false
    $secondWhy = ''
    try {
        if (-not (Test-Path -LiteralPath $SecondRoot)) { New-Item -ItemType Directory -Force -Path $SecondRoot | Out-Null }
        $remotePartial = Join-Path $SecondRoot ($DumpName + '.partial')
        $remoteFinal = Join-Path $SecondRoot $DumpName
        Copy-Item -LiteralPath $localFinal -Destination $remotePartial -Force
        $remoteHash = Get-Sha256 $remotePartial
        if ($remoteHash -ne $localHash) {
            Remove-Item -LiteralPath $remotePartial -Force
            $secondWhy = "SHA256 on second destination $remoteHash differs from $localHash"
        } else {
            Move-Item -LiteralPath $remotePartial -Destination $remoteFinal -Force
            Copy-Item -LiteralPath ($localFinal + '.sha256') -Destination ($remoteFinal + '.sha256') -Force
            $secondOk = $true
            Write-Log "SECOND OK: $remoteFinal (sha256 verified)"
        }
    } catch {
        $secondWhy = $_.Exception.Message
    }
    if (-not $secondOk) {
        Stop-Backup 20 "local dump verified, but the second destination FAILED: $secondWhy. The backup exists on one physical disk only."
    }

    Invoke-Prune -Root $SecondRoot -Label 'second'

    Stop-Backup 0 "OK $DumpName $sizeMB MB verified on both destinations"
} catch {
    Write-Log "UNEXPECTED: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    Save-Status -Code 99 -Summary 'unexpected error'
    exit 99
} finally {
    if (-not $PlanOnly) {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & docker exec $DbContainer rm -f $ContainerDump $ContainerToc 2>&1 | Out-Null
        $ErrorActionPreference = $prev
    }
    if ($lock) { $lock.Dispose() }
}
