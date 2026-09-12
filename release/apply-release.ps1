# release/apply-release.ps1
# Thin production-side executor (<=120 lines by design). ASCII-only, PowerShell 5.1 compatible.
# Verifies the tarball's sha256 (if given), then hands off to release/lib/apply-release-engine.sh,
# which executes the Preflight + Phase 4 (migration) blocks of a RELEASE-<date>.md mechanically and
# STOPS before Phase 5 (image/deploy) -- deploy is always a human step, never this script's.
#
# USAGE
#   .\release\apply-release.ps1 -ReleaseMd release\out\RELEASE-20260912.md -TargetDb <db> `
#       [-Container afrakala-lan-db] [-DbUser supabase_admin] [-Tarball <path> -TarballSha256 <hex>]
#
# -TargetDb has NO default. This is deliberate: the same script must be usable against a rehearsal
# database (proof runs) or a real production database (an actual release), and guessing wrong in
# either direction is exactly the kind of mistake this pipeline exists to prevent.

param(
    [Parameter(Mandatory = $true)][string]$ReleaseMd,
    [Parameter(Mandatory = $true)][string]$TargetDb,
    [string]$Container = "afrakala-lan-db",
    [string]$DbUser = "supabase_admin",
    [string]$Tarball = "",
    [string]$TarballSha256 = "",
    # The same release/config/decided-migrations.txt the rehearsal ran with. Defence in depth: the
    # engine refuses a mig_apply block for a version declared SKIP, and re-checks a decided
    # LEDGER_ONLY version's guard against the REAL target before writing its ledger row.
    [string]$Decided = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runsDir = Join-Path $PSScriptRoot "runs"
if (-not (Test-Path $runsDir)) { New-Item -ItemType Directory -Path $runsDir | Out-Null }

$releaseMdResolved = Resolve-Path $ReleaseMd -ErrorAction SilentlyContinue
if (-not $releaseMdResolved) {
    Write-Host "RELEASE document not found: $ReleaseMd" -ForegroundColor Red
    exit 2
}

if ($Tarball -ne "") {
    $tb = Resolve-Path $Tarball -ErrorAction SilentlyContinue
    if (-not $tb) {
        Write-Host "Tarball not found: $Tarball" -ForegroundColor Red
        exit 2
    }
    if ($TarballSha256 -eq "") {
        Write-Host "REFUSED: -Tarball given without -TarballSha256. A tarball this script cannot" -ForegroundColor Red
        Write-Host "verify is a tarball it must not use." -ForegroundColor Red
        exit 2
    }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $tb).Hash.ToLower()
    $expected = $TarballSha256.ToLower()
    if ($actual -ne $expected) {
        Write-Host "REFUSED: tarball sha256 mismatch." -ForegroundColor Red
        Write-Host "  expected: $expected" -ForegroundColor Red
        Write-Host "  actual  : $actual" -ForegroundColor Red
        exit 1
    }
    Write-Host "Tarball sha256 verified: $actual" -ForegroundColor Green
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $runsDir "$stamp.log"

# See release/rehearse.ps1 for why Git Bash must be located explicitly rather than via plain
# PATH search (WSL's bash.exe otherwise wins and cannot see Windows drive-letter paths).
$gitBashCandidates = @("C:\Program Files\Git\bin\bash.exe", "C:\Program Files\Git\usr\bin\bash.exe")
$bashPath = $gitBashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bashPath) {
    $cmd = Get-Command "bash.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $bashPath = $cmd.Source }
}
if (-not $bashPath) {
    Write-Host "Git Bash not found." -ForegroundColor Red
    exit 2
}

$engine = Join-Path $PSScriptRoot "lib\apply-release-engine.sh"
$bashArgs = @(
    $engine.Replace('\', '/'),
    "--release-md", $releaseMdResolved.Path.Replace('\', '/'),
    "--container", $Container,
    "--db-user", $DbUser,
    "--target-db", $TargetDb,
    "--migdir", "supabase/migrations",
    "--repo-root", $repoRoot.Path.Replace('\', '/'),
    "--log", $logPath.Replace('\', '/')
)
if ($Decided -ne "") {
    $decidedResolved = Resolve-Path $Decided -ErrorAction SilentlyContinue
    if (-not $decidedResolved) {
        Write-Host "Decision file not found: $Decided" -ForegroundColor Red
        exit 2
    }
    $bashArgs += @("--decided", $decidedResolved.Path.Replace('\', '/'))
}

Write-Host "Running apply-release engine (bash) against $TargetDb@$Container ..." -ForegroundColor Cyan
& $bashPath @bashArgs
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
    Write-Host "PASSED. Log: $logPath" -ForegroundColor Green
} else {
    Write-Host "STOP (exit $code). Log: $logPath" -ForegroundColor Red
}

exit $code
