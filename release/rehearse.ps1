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
#                           [-KnownLedgerLies <path>]
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
    [Parameter(Mandatory = $true)][string]$Dump,
    [string]$Container = "afrakala-lan-db",
    [string]$DbUser = "supabase_admin",
    [string]$Prefix = "prod_rehearsal_",
    [string]$Date = (Get-Date -Format "yyyyMMdd"),
    [string]$Ceiling = "",
    [string]$KnownLedgerLies = ""
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

$dumpResolved = (Resolve-Path $Dump -ErrorAction SilentlyContinue)
if (-not $dumpResolved) {
    Write-Host "Dump not found: $Dump" -ForegroundColor Red
    exit 2
}

$engine = Join-Path $PSScriptRoot "lib\rehearse-engine.sh"

$bashArgs = @(
    $engine.Replace('\', '/'),
    "--dump", $dumpResolved.Path.Replace('\', '/'),
    "--container", $Container,
    "--db-user", $DbUser,
    "--prefix", $Prefix,
    "--date", $Date,
    "--migdir", "supabase/migrations",
    "--repo-root", $repoRoot.Path.Replace('\', '/'),
    "--out", $outFile.Replace('\', '/')
)
if ($Ceiling -ne "") { $bashArgs += @("--ceiling", $Ceiling) }
if ($KnownLedgerLies -ne "") {
    $klResolved = Resolve-Path $KnownLedgerLies
    $bashArgs += @("--known-ledger-lies", $klResolved.Path.Replace('\', '/'))
}

Write-Host "Running rehearsal engine (bash) ..." -ForegroundColor Cyan
Write-Host "$bashPath $($bashArgs -join ' ')" -ForegroundColor DarkGray

& $bashPath @bashArgs
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
    Write-Host "REHEARSAL PASSED. Report: $outFile" -ForegroundColor Green
} else {
    Write-Host "REHEARSAL FAILED (exit $code). Report: $outFile" -ForegroundColor Red
}

exit $code
