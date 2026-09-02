# Fail-fast guard against a value that has swallowed the next variable's name.
#
# WHY THIS EXISTS. On 2026-09-02 a deploy shipped with
#     VITE_APP_ENV=testVITE_FEATURE_QUOTE_CUSTOMER_PICKER=true
# because the env file's last line had no trailing newline and an append landed on it. One
# variable was corrupted and the other never existed, so a feature flag reported as "on" was off
# for two deploys. A grep for the flag name found the string INSIDE the corrupted value and was
# read as proof the flag was set — a false positive that only a behavioural check would have caught.
#
# The unit test in e2e/security/og93 asserts the same property, but og93 does not run on the
# deploy path, which is where the bug actually happened. This runs there.
param([string]$EnvFile = "$PSScriptRoot\..\.env.lan")

if (-not (Test-Path $EnvFile)) { Write-Error "env file not found: $EnvFile"; exit 1 }

$problems = @()
$lineNo = 0
foreach ($line in Get-Content $EnvFile) {
    $lineNo++
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    # A value may legitimately mention a URL or a key. It may never contain "VITE_", because that
    # only happens when a variable name has been concatenated into the value above it.
    if ($value -match 'VITE_') {
        $problems += "line ${lineNo}: $($name.Trim()) has a value containing 'VITE_' — a variable name has run into it"
    }
}

# The trailing newline is the actual root cause; without it the next append repeats the bug.
$raw = [System.IO.File]::ReadAllText($EnvFile)
if ($raw.Length -gt 0 -and -not $raw.EndsWith("`n")) {
    $problems += "the file does not end with a newline — the next appended variable will fuse onto the last line"
}

if ($problems.Count -gt 0) {
    Write-Host "ENV FILE CHECK FAILED" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "env file check passed: no value contains a variable name, file ends with a newline"
exit 0
