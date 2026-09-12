# release/rehearse.ps1
# Thin PowerShell entry point for the production rehearsal. ASCII-only, PowerShell 5.1 compatible.
#
# WHY THIS SCRIPT DOES NOT TALK TO DOCKER OR PSQL ITSELF
#   Every safe primitive for that already exists in bash in this repo (mig_apply, ledger-reconcile
#   .sh, ledger-evidence.sh), and CLAUDE.md documents, with dated incidents, why a PowerShell pipe
#   into psql or a `docker cp` are both dangerous on this machine. So this script's only job is:
#   find Git Bash, hand it well-formed arguments, relay its output live, and pass its exit code
#   through unchanged. The real work is in release/lib/rehearse-engine.sh.
#
# 🔴 OWNER DIRECTIVE THIS SCRIPT EXISTS TO ENFORCE
#   Pending work is determined by asking the LIVE CATALOGUE whether each migration's effect is
#   present, not by comparing version strings against the ledger. R-1 proved the production ledger
#   lies about five migrations; migration 477 broke on 2026-09-12 because ledger-only detection
#   missed exactly this. See release/lib/rehearse-engine.sh's own header for the full classification
#   table. DO NOT "simplify" this back to a ledger diff -- that is the bug this script was built to
#   stop reproducing.
#
# USAGE
#   .\release\rehearse.ps1 -Dump <path> [-Container afrakala-lan-db] [-DbUser supabase_admin]
#                           [-Prefix prod_rehearsal_] [-Date yyyyMMdd] [-Ceiling <14-digit>]
#                           [-KnownLedgerLies <path>] [-ShapeTolerant <path>]
#                           [-RestoreOnly] [-Replay [-From n] [-To n] [-BatchSize n]]
#                           [-GatesOnly [-DropWhenDone]] [-StateDir <path>]
#
# PHASES -- WHY THEY EXIST (read this before "simplifying" it back to one call)
#   Two earlier attempts at this rehearsal stalled because restore + classify + ~690 migration
#   replays + three Playwright gates were ONE long-running invocation with no checkpoint. When it
#   died, the engine's own `trap cleanup EXIT` had already dropped the database, so there was
#   nothing to resume from and the next attempt started again at pg_restore.
#
#   -RestoreOnly   restore + classify + build the apply plan, then STOP, KEEPING the database.
#   -Replay        apply ONE CONTIGUOUS BATCH of that plan and stop. With no -From it resumes
#                  automatically from the last completed plan index; -BatchSize sets the width.
#                  Repeat until it prints "REPLAY COMPLETE".
#   -GatesOnly     og81/og102/og103 + anon census + the final verdict over the whole report.
#
#   Passing none of the three keeps the original single-shot behaviour (--phase all), database
#   dropped at exit, exactly as before.
#
#   NEVER set -BatchSize wide enough to cover the whole plan in one go. That is the thing that
#   stalled this twice; the batch width IS the checkpoint interval.
#
# -ShapeTolerant <path> ("TOLERATE A MISSING OBJECT", owner directive): pre-declares specific
#   migration versions, with their exact expected error substring, as safe to survive a replay
#   failure caused by the restored shape lacking an object the migration alters (e.g. an old-style
#   `DROP CONSTRAINT` without `IF EXISTS` on a shape that never had the constraint). See
#   release/lib/shape-tolerance.sh and release/config/known-shape-tolerant-migrations.txt for the
#   file format and full rationale. Omitting this flag changes nothing — the pre-existing hard-stop
#   behaviour on any replay failure is unchanged.
#
# -Decided <path> (THE THIRD CATEGORY -- read this before assuming it duplicates -ShapeTolerant):
#   pre-declares versions whose disposition a human already DECIDED, on the record, before any
#   rehearsal ran. -ShapeTolerant is REACTIVE -- run the migration, catch the error, match the text,
#   continue, and leave the version an OPEN question ("HUMAN REVIEW REQUIRED" in the release
#   document). -Decided is DECLARATIVE and PRIOR -- the SQL is never delivered and never runs, so
#   there is no error to tolerate, and the question is CLOSED. Two dispositions: SKIP (no SQL, NO
#   ledger row -- the absence IS the decision, e.g. OG-J for migrations 449/450/452) and
#   LEDGER_ONLY (no SQL, ledger row written only after a declared guard checks out, e.g. OG-C for
#   migration 373). The engine counts and renders the two mechanisms separately and never sums
#   them: "this failed and we continued" and "we decided never to run this" are opposite facts, and
#   conflating them is how a release line starts lying. See release/lib/decided-migrations.sh and
#   release/config/decided-migrations.txt.
#
# OUTPUT
#   release/out/rehearsal-<date>.md — full report: restore source + md5, ledger state BEFORE
#   replay, per-migration classification, replay log, og81/og102/og103 results, anon view/matview
#   census, final PASS/FAIL verdict.
#
# EXIT CODE
#   0 on PASS. Non-zero on ANY of: restore failure with an untolerated pg_restore error, an
#   undeclared ledger/catalogue disagreement, any unexpected migration replay failure, or any of
#   og81/og102/og103 failing. The rehearsal database is ALWAYS dropped before this script returns,
#   pass or fail -- a rehearsal that leaves state behind defeats its own repeatability.

param(
    # NOT Mandatory any more: -Replay and -GatesOnly never read the dump, and a mandatory
    # parameter would prompt for a path those phases discard. Phase-aware validation below
    # enforces it for exactly the phases that do restore.
    [string]$Dump = "",
    [string]$Container = "afrakala-lan-db",
    [string]$DbUser = "supabase_admin",
    [string]$Prefix = "prod_rehearsal_",
    [string]$Date = (Get-Date -Format "yyyyMMdd"),
    [string]$Ceiling = "",
    [string]$KnownLedgerLies = "",
    [string]$ShapeTolerant = "",
    [string]$Decided = "",
    [switch]$RestoreOnly,
    [switch]$Replay,
    [switch]$GatesOnly,
    [switch]$DropWhenDone,
    [int]$From = 0,
    [int]$To = 0,
    [int]$BatchSize = 0,
    [string]$StateDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $PSScriptRoot "out"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "rehearsal-$Date.md"

# Prefer Git Bash explicitly. On a machine with WSL installed, plain PATH search for "bash.exe"
# resolves to C:\Windows\System32\bash.exe (the WSL launcher) first, which cannot see Windows
# drive-letter paths the way this script passes them (D:/... -> "No such file or directory").
# Git Bash is what every other docker/psql script in this repo already assumes.
$gitBashCandidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files\Git\usr\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe"
)
$bashPath = $gitBashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bashPath) {
    $cmd = Get-Command "bash.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $bashPath = $cmd.Source }
}
if (-not $bashPath) {
    Write-Host "Git Bash not found. This pipeline requires it -- see the script header for why" -ForegroundColor Red
    Write-Host "native PowerShell cannot safely replace it." -ForegroundColor Red
    exit 2
}

# Exactly one phase switch, or none. Two at once is always a mistake about what the run does.
$phaseSwitchCount = @($RestoreOnly, $Replay, $GatesOnly | Where-Object { $_ }).Count
if ($phaseSwitchCount -gt 1) {
    Write-Host "Pass at most ONE of -RestoreOnly / -Replay / -GatesOnly." -ForegroundColor Red
    exit 2
}
$phase = "all"
if ($RestoreOnly)   { $phase = "restore" }
elseif ($Replay)    { $phase = "replay" }
elseif ($GatesOnly) { $phase = "gates" }

$dumpResolved = $null
if ($phase -eq "all" -or $phase -eq "restore") {
    if ($Dump -eq "") {
        Write-Host "-Dump is required for phase '$phase'." -ForegroundColor Red
        exit 2
    }
    $dumpResolved = (Resolve-Path $Dump -ErrorAction SilentlyContinue)
    if (-not $dumpResolved) {
        Write-Host "Dump not found: $Dump" -ForegroundColor Red
        exit 2
    }
}

$engine = Join-Path $PSScriptRoot "lib\rehearse-engine.sh"

$bashArgs = @(
    $engine.Replace('\', '/'),
    "--container", $Container,
    "--db-user", $DbUser,
    "--prefix", $Prefix,
    "--date", $Date,
    "--migdir", "supabase/migrations",
    "--repo-root", $repoRoot.Path.Replace('\', '/'),
    "--out", $outFile.Replace('\', '/')
)
# The dump path is appended only when a dump was actually resolved, i.e. only for the phases
# that restore one.
if ($dumpResolved) { $bashArgs += @("--dump", $dumpResolved.Path.Replace('\', '/')) }
$bashArgs += @("--phase", $phase)
if ($StateDir -ne "") {
    if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
    $bashArgs += @("--state-dir", (Resolve-Path $StateDir).Path.Replace('\', '/'))
}
if ($From -gt 0)      { $bashArgs += @("--from", "$From") }
if ($To -gt 0)        { $bashArgs += @("--to", "$To") }
if ($BatchSize -gt 0) { $bashArgs += @("--batch-size", "$BatchSize") }
if ($DropWhenDone)    { $bashArgs += @("--drop-when-done") }
if ($Ceiling -ne "") { $bashArgs += @("--ceiling", $Ceiling) }
if ($KnownLedgerLies -ne "") {
    $klResolved = Resolve-Path $KnownLedgerLies
    $bashArgs += @("--known-ledger-lies", $klResolved.Path.Replace('\', '/'))
}
if ($ShapeTolerant -ne "") {
    $stResolved = Resolve-Path $ShapeTolerant
    $bashArgs += @("--shape-tolerant", $stResolved.Path.Replace('\', '/'))
}
if ($Decided -ne "") {
    $dcResolved = Resolve-Path $Decided
    $bashArgs += @("--decided", $dcResolved.Path.Replace('\', '/'))
}

Write-Host "Running rehearsal engine (bash) ..." -ForegroundColor Cyan
Write-Host "$bashPath $($bashArgs -join ' ')" -ForegroundColor DarkGray

& $bashPath @bashArgs
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
    if ($phase -eq "all" -or $phase -eq "gates") {
        Write-Host "REHEARSAL PASSED. Report: $outFile" -ForegroundColor Green
    } else {
        Write-Host "PHASE '$phase' COMPLETE (this is not a verdict). Report so far: $outFile" -ForegroundColor Green
    }
} else {
    Write-Host "REHEARSAL FAILED (exit $code). Report: $outFile" -ForegroundColor Red
}

exit $code
