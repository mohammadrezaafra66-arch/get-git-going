# release/validate-blocks.ps1
# The mechanical BLOCKS.md validator that docs/research/convergence/R-4-transfer-line.md Task 1.2
# confirmed does not exist anywhere in this repo. ASCII-only, PowerShell 5.1 compatible.
#
# WHY THIS EXISTS
#   production-migration-run-20260912.md:100-102 claimed the migration list was "validated
#   mechanically: 76 mig_apply calls, every file present on disk, every version equal to its
#   filename prefix, no duplicates" -- but that check was ad-hoc shell run once by hand and never
#   preserved. R-4 confirmed by grep: no script in the repo does this. This is that script,
#   generalised to any RELEASE-<date>.md this pipeline produces.
#
# WHAT IT CHECKS (read-only; touches no database, no docker)
#   1. Every `mig_apply <version> <file>` line names a file that exists under supabase/migrations.
#   2. Every such version equals the 14-digit prefix of its own filename.
#   3. No version appears twice across all mig_apply lines.
#   4. Every block (delimited by `### Block N` headers) contains at least one `Expect:` line.
#
# USAGE
#   .\release\validate-blocks.ps1 -Path release\out\RELEASE-20260912.md
#
# EXIT CODE: 0 if every check passes, 1 otherwise. Findings are printed either way.

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$MigDir = "supabase/migrations"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
    Write-Host "File not found: $Path" -ForegroundColor Red
    exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$migDirFull = Join-Path $repoRoot $MigDir
$lines = Get-Content -Path $Path -Encoding UTF8

$problems = New-Object System.Collections.Generic.List[string]
$seenVersions = New-Object System.Collections.Generic.HashSet[string]
$migApplyCount = 0

# --- 1+2+3: every mig_apply line -----------------------------------------------------------------
# Accepted shapes: "mig_apply <version> <file>" or "    mig_apply <version> <file>" (indented,
# as emitted inside a fenced code block by emit-blocks.ps1).
$migApplyPattern = '^\s*mig_apply\s+(?<ver>\d{14})\s+(?<file>\S+\.sql)\s*$'
foreach ($line in $lines) {
    if ($line -match $migApplyPattern) {
        $migApplyCount++
        $ver = $Matches['ver']
        $file = $Matches['file']

        $filePath = Join-Path $migDirFull $file
        if (-not (Test-Path $filePath)) {
            $problems.Add("MISSING FILE: line names '$file' (version $ver) but it does not exist under $MigDir")
            continue
        }

        $prefix = ($file -split '_')[0]
        if ($prefix -ne $ver) {
            $problems.Add("VERSION MISMATCH: line claims version $ver for file '$file' whose own prefix is $prefix")
        }

        if ($seenVersions.Contains($ver)) {
            $problems.Add("DUPLICATE VERSION: $ver appears in more than one mig_apply line")
        } else {
            [void]$seenVersions.Add($ver)
        }
    }
}

# --- 4: every "### Block N" section has at least one "Expect:" line -----------------------------
$blockHeaderPattern = '^###\s+Block\s+\S'
$blockStarts = New-Object System.Collections.Generic.List[int]
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $blockHeaderPattern) { $blockStarts.Add($i) }
}

$blockCount = $blockStarts.Count
$blocksMissingExpect = 0
for ($b = 0; $b -lt $blockStarts.Count; $b++) {
    $start = $blockStarts[$b]
    $end = if ($b + 1 -lt $blockStarts.Count) { $blockStarts[$b + 1] - 1 } else { $lines.Count - 1 }
    $body = $lines[$start..$end]
    $hasExpect = $false
    foreach ($l in $body) {
        if ($l -match '^\s*Expect:') { $hasExpect = $true; break }
    }
    if (-not $hasExpect) {
        $header = $lines[$start]
        $problems.Add("NO Expect: LINE in block: $header")
        $blocksMissingExpect++
    }
}

Write-Host "Validated: $Path" -ForegroundColor Cyan
Write-Host "  mig_apply lines found : $migApplyCount"
Write-Host "  unique versions       : $($seenVersions.Count)"
Write-Host "  blocks found          : $blockCount"
Write-Host "  blocks missing Expect : $blocksMissingExpect"
Write-Host ""

if ($problems.Count -eq 0) {
    Write-Host "PASSED — no problems found." -ForegroundColor Green
    exit 0
}

Write-Host "FAILED — $($problems.Count) problem(s):" -ForegroundColor Red
foreach ($p in $problems) {
    Write-Host "  - $p" -ForegroundColor Red
}
exit 1
