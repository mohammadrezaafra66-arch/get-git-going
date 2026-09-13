# release/emit-blocks.ps1
# Generates release/out/RELEASE-<date>.md in BLOCKS.md's own format: one block per unit of work,
# each with a literal "Expect:" line, so release/validate-blocks.ps1 can check it mechanically and
# release/apply-release.ps1 can execute it mechanically. ASCII-only, PowerShell 5.1 compatible.
#
# WHY GENERATED, NOT HAND-WRITTEN
#   docs/research/convergence/R-4-transfer-line.md Task 1.2 found that the 09-12 run's claim of
#   "validated mechanically" was never backed by a real script, and that the underlying BLOCKS.md
#   document is hand-authored prose every time. Generating it from a PASSED rehearsal report closes
#   both gaps at once: the document cannot exist without a rehearsal behind it, and its migration
#   list cannot drift from what was actually classified and replayed.
#
# THIS SCRIPT REFUSES TO RUN if the rehearsal it is given did not PASS, or is missing entirely --
# a release document generated without a rehearsal behind it is exactly the risk this pipeline
# exists to remove.
#
# USAGE
#   .\release\emit-blocks.ps1 -RehearsalReport release\out\rehearsal-20260912.md -Date 20260912
#       [-BuildManifest release\out\build-<sha>.json] [-Tarball release\out\afrakala-app-<sha>.tar.gz]

param(
    [Parameter(Mandatory = $true)][string]$RehearsalReport,
    [Parameter(Mandatory = $true)][string]$Date,
    [string]$BuildManifest = "",
    [string]$Tarball = "",
    # The same decision file the rehearsal was run with (release/config/decided-migrations.txt).
    # It carries the DECISION_ID, the guard and the reason behind every decided version, so an
    # emitted block can CITE the decision instead of asserting it. Optional, but the script warns
    # if the report contains decided versions and this is not supplied.
    [string]$Decided = "",
    [string]$D6TargetHost = "192.168.170.10"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RehearsalReport)) {
    Write-Host "FATAL: rehearsal report not found: $RehearsalReport" -ForegroundColor Red
    Write-Host "A RELEASE document is never generated without a rehearsal behind it." -ForegroundColor Yellow
    exit 1
}

$report = Get-Content -Path $RehearsalReport -Encoding UTF8 -Raw
$reportLines = Get-Content -Path $RehearsalReport -Encoding UTF8

# D8 -- the LAST verdict decides, not any occurrence anywhere in the document.
# The old test was `$report -notmatch "## VERDICT: PASS"`, a substring match over the whole
# file. A rehearsal that FAILED and was then narrated ("...if it had passed, VERDICT: PASS...")
# would satisfy it. Measured on a real report: rehearsal-e4b.md carries
#   :878  ## VERDICT: FAIL (replay stopped early)
#   :2047 ## VERDICT: PASS
# For that document the final verdict genuinely is PASS, so it is still accepted -- but only
# because the LAST one is checked now. A check that can pass without being true is the exact
# defect class this pipeline exists to stop.
#
# B2, 2026-09-14. The previous pattern `^\s*#*\s*VERDICT:` made the `#` optional, so a column-0
# PROSE line ("VERDICT: PASS is the outcome we were hoping for, but it did not happen.") written
# after a real `## VERDICT: FAIL` counted as the last verdict and a release document was written.
# A verdict is now only a line the rehearsal engine itself writes -- release/lib/rehearse-engine.sh
# echoes exactly "## VERDICT: PASS" or "## VERDICT: FAIL" with an optional " (reason)" -- and only
# outside a fenced code block. Anything that looks like a verdict heading but is not in that form
# is refused rather than guessed at.
#
# C5, 2026-09-14. Every ``` or ~~~ line used to TOGGLE the fence state, so REVIEW-2 hid a real final
# `## VERDICT: FAIL` two ways and a release document was written: (1) a fence left open, which
# silently swallowed everything after it; (2) a `~~~` line inside a ``` fence, which flipped the
# state so the FAIL after the real closing fence counted as "inside". A fence now closes only on a
# line of the SAME character, at least as long as the opener, with nothing else on it (CommonMark),
# and a fence still open at end of file is refused: what follows it cannot be read as verdicts.
$verdictLines = @()
$malformedVerdicts = @()
$fenceChar = ''          # '' = not inside a fence; otherwise the character that opened it
$fenceLen = 0
$fenceOpenedAt = 0
for ($i = 0; $i -lt $reportLines.Count; $i++) {
    $l = $reportLines[$i]
    if ($fenceChar -eq '') {
        if ($l -match '^\s{0,3}(`{3,}|~{3,})') {
            $fenceChar = $Matches[1].Substring(0, 1); $fenceLen = $Matches[1].Length; $fenceOpenedAt = $i + 1
            continue
        }
    } else {
        if ($l -match '^\s{0,3}(`{3,}|~{3,})\s*$' -and $Matches[1].Substring(0, 1) -ceq $fenceChar -and $Matches[1].Length -ge $fenceLen) {
            $fenceChar = ''
        }
        continue
    }
    if ($l -cmatch '^## VERDICT: (PASS|FAIL)( \(.*\))?\s*$') { $verdictLines += ":$($i + 1)  $l" }
    elseif ($l -match '^\s{0,3}#{1,6}\s*VERDICT') { $malformedVerdicts += ":$($i + 1)  $l" }
}
if ($fenceChar -ne '') {
    Write-Host "FATAL: rehearsal report ends inside a code fence opened at :$fenceOpenedAt ('$($fenceChar * $fenceLen)') that is never closed." -ForegroundColor Red
    Write-Host "  Everything after that line is unreadable as a verdict, so the final verdict cannot be established." -ForegroundColor Yellow
    exit 1
}
if ($malformedVerdicts.Count -gt 0) {
    Write-Host "FATAL: rehearsal report has verdict-like heading(s) the rehearsal engine never writes:" -ForegroundColor Red
    $malformedVerdicts | ForEach-Object { Write-Host "    $_" }
    exit 1
}
if ($verdictLines.Count -eq 0) {
    Write-Host "FATAL: rehearsal report contains no '## VERDICT:' heading at all." -ForegroundColor Red
    exit 1
}
$finalVerdict = $verdictLines[-1]
if ($finalVerdict -cnotmatch '## VERDICT: PASS\s*$') {
    Write-Host "FATAL: the FINAL verdict in the rehearsal report is not PASS." -ForegroundColor Red
    Write-Host "  final  : $finalVerdict" -ForegroundColor Yellow
    Write-Host "  all verdict lines, in order:" -ForegroundColor Yellow
    $verdictLines | ForEach-Object { Write-Host "    $_" }
    exit 1
}

function Get-ValueAfter {
    param([string[]]$Lines, [string]$Marker)
    $m = $Lines | Where-Object { $_ -match [regex]::Escape($Marker) } | Select-Object -First 1
    if (-not $m) { return $null }
    return ($m -split '=', 2)[1].Trim()
}

$dumpFile = ($reportLines | Where-Object { $_ -match '^dump file\s*:' } | Select-Object -First 1) -replace '^dump file\s*:\s*', ''
$dumpMd5 = ($reportLines | Where-Object { $_ -match '^md5 \(host\)\s*:' } | Select-Object -First 1) -replace '^md5 \(host\)\s*:\s*', ''
$ledgerBefore = Get-ValueAfter -Lines $reportLines -Marker "ledger_rows|ledger_min|ledger_max"
$preflight = Get-ValueAfter -Lines $reportLines -Marker "is_replica|db_size|anon_default_acl_count"

# --- parse the machine-readable classification block --------------------------------------------
# Prefer the FINAL (post-replay overrides) block if the rehearsal report has one -- it downgrades
# any version that failed replay under a declared shape tolerance from APPLY to SHAPE_TOLERATED
# (see release/lib/shape-tolerance.sh). Falls back to the original pre-replay block for an older
# report that predates this mechanism.
$finalMatch = $reportLines | Select-String -Pattern '## Machine-readable classification \(FINAL' | Select-Object -Last 1
if ($finalMatch) {
    $startIdx = $finalMatch.LineNumber
} else {
    $startIdx = ($reportLines | Select-String -Pattern '## Machine-readable classification' | Select-Object -First 1).LineNumber
}
if (-not $startIdx) {
    Write-Host "FATAL: rehearsal report has no machine-readable classification section." -ForegroundColor Red
    exit 1
}
$fenceLines = $reportLines[($startIdx)..($reportLines.Count - 1)]
$inFence = $false
$classified = New-Object System.Collections.Generic.List[object]
foreach ($l in $fenceLines) {
    if ($l.Trim() -eq '```') {
        if ($inFence) { break } else { $inFence = $true; continue }
    }
    if ($inFence -and $l.Trim() -ne '') {
        $parts = $l -split '\|'
        if ($parts.Count -ge 2) {
            $fileVal = ""
            if ($parts.Count -ge 3) { $fileVal = $parts[2] }
            $classified.Add([PSCustomObject]@{ Version = $parts[0]; Bucket = $parts[1]; File = $fileVal })
        }
    }
}

# --- sequenced expectations: the NOTICEs each migration actually printed, IN SEQUENCE ---------
# WHY THIS IS PARSED RATHER THAN TYPED
#   A migration's own header records what it does when applied ALONE. The operator runs it in a
#   SEQUENCE, and the sequence changes the numbers. Migration 537's header says it revokes
#   TRUNCATE from `authenticated` on 214 tables; in this release migration 534 creates
#   `cron_run_log` three steps earlier, that new table inherits the schema default that still
#   includes TRUNCATE, and 537 therefore reports one more. An Expect: line carrying a typed 214
#   would turn a CORRECT run into a stop condition.
#
#   That is the same defect class as migration 477's static REVOKE list -- a number generated
#   against one shape and asserted against another -- which is the failure this whole pipeline
#   exists to stop reproducing. So these Expect: lines are lifted verbatim from what the
#   migrations printed during the rehearsal's own replay, in order. Derive it, or do not print it.
$noticesByVersion = @{}
$seqIdx = ($reportLines | Select-String -Pattern '## Sequenced expectations' | Select-Object -Last 1)
if ($seqIdx) {
    $seqLines = $reportLines[($seqIdx.LineNumber)..($reportLines.Count - 1)]
    $inSeq = $false
    foreach ($l in $seqLines) {
        if ($l.Trim() -eq '```') {
            if ($inSeq) { break } else { $inSeq = $true; continue }
        }
        if ($inSeq -and $l.Trim() -ne '') {
            $bits = $l -split '\|', 2
            if ($bits.Count -eq 2) {
                $v = $bits[0].Trim()
                if (-not $noticesByVersion.ContainsKey($v)) {
                    $noticesByVersion[$v] = New-Object System.Collections.Generic.List[string]
                }
                $noticesByVersion[$v].Add($bits[1].Trim())
            }
        }
    }
}
Write-Host "Sequenced expectations parsed for $($noticesByVersion.Keys.Count) migration(s)" -ForegroundColor Cyan

$applyList = $classified | Where-Object { $_.Bucket -eq 'APPLY' } | Sort-Object Version
$ledgerOnlyList = $classified | Where-Object { $_.Bucket -eq 'LEDGER_ONLY' } | Sort-Object Version
$shapeTolerantList = $classified | Where-Object { $_.Bucket -eq 'SHAPE_TOLERATED' } | Sort-Object Version
# THE THIRD CATEGORY. Not shape tolerance, and rendered nothing like it -- see the block emitters
# further down. SHAPE_TOLERATED means "it failed here and a human still has to decide";
# DECISION_SKIPPED means "a human already decided it never runs, and it gets no ledger row".
$decisionSkippedList = $classified | Where-Object { $_.Bucket -eq 'DECISION_SKIPPED' } | Sort-Object Version
$decidedLedgerOnlyList = $classified | Where-Object { $_.Bucket -eq 'DECIDED_LEDGER_ONLY' } | Sort-Object Version

# --- decision file: DECISION_ID, guard and reason per version, so a block can cite its source ----
$decisionById = @{}
if ($Decided -ne "" -and (Test-Path $Decided)) {
    foreach ($dl in (Get-Content -Path $Decided -Encoding UTF8)) {
        if ($dl.Trim() -eq "" -or $dl.TrimStart().StartsWith("#")) { continue }
        $f = $dl -split '\|', 6
        if ($f.Count -ge 6) {
            $decisionById[$f[0]] = [PSCustomObject]@{
                Disposition = $f[1]; DecisionId = $f[2]
                GuardSql = $f[3]; GuardExpect = $f[4]; Reason = $f[5].Trim()
            }
        }
    }
    Write-Host "Decision file parsed: $($decisionById.Keys.Count) declared version(s)" -ForegroundColor Cyan
} elseif ($decisionSkippedList.Count -gt 0 -or $decidedLedgerOnlyList.Count -gt 0) {
    Write-Host "WARNING: the rehearsal report contains decided versions but -Decided was not supplied;" -ForegroundColor Yellow
    Write-Host "         their blocks will render without the decision's own reason text." -ForegroundColor Yellow
}

Write-Host "Parsed rehearsal: $($applyList.Count) APPLY, $($ledgerOnlyList.Count) LEDGER_ONLY, $($shapeTolerantList.Count) SHAPE_TOLERATED, $($decisionSkippedList.Count) DECISION_SKIPPED, $($decidedLedgerOnlyList.Count) DECIDED_LEDGER_ONLY" -ForegroundColor Cyan

$outDir = Join-Path $PSScriptRoot "out"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "RELEASE-$Date.md"

$sb = New-Object System.Text.StringBuilder
function Add-Line([string]$s) { [void]$sb.AppendLine($s) }

# --- D1 inputs: the build sha and the migration set, resolved before the document is written ---
$d1BuildSha = "<sha: supply -BuildManifest>"
if ($BuildManifest -ne "" -and (Test-Path $BuildManifest)) {
    $d1BuildSha = (Get-Content $BuildManifest -Raw | ConvertFrom-Json).git_sha
}
$d1MigCount = $applyList.Count
$d1MigList = ($applyList | ForEach-Object { "'" + $_.File + "'" }) -join ", "
if ($d1MigList -eq "") { $d1MigList = "" }

Add-Line "# RELEASE-$Date"
Add-Line ""
Add-Line "Generated by release/emit-blocks.ps1 from a PASSED rehearsal: $RehearsalReport"
Add-Line "Rehearsal restore source: $dumpFile (md5 $dumpMd5)"
Add-Line ""
[void]$sb.AppendLine(@'
Every block below has a literal 'Expect:' line. release/validate-blocks.ps1 checks this
document mechanically before anyone runs it. release/apply-release.ps1 stops at the FIRST
block whose live output disagrees with its Expect: line -- exactly BLOCKS.md's own rule.

HOW TO PASTE A GATE. Every gate, and every region that changes state after a gate, is ONE
`& { ... }` region: copy it from its `& {` line to its closing `}` line and paste it whole.
A failing gate prints `GATE <id> FAIL <reason>` and then stops with a red error. It does NOT
close the window or end the shell, so the reason stays on screen. The failure is also recorded
in this shell, and every later region that changes state (:lan retag, rollback-tag prune, deploy)
refuses to run and prints NOT RUN while any gate has failed and has not since printed PASS. That
record lives only in THIS shell: in a new window, re-run the gates first.

---

### Block 0 - checkout state (run BEFORE anything else in this document)
'@)
Add-Line ""
[void]$sb.AppendLine(@'
D1. On 2026-09-13 a release run reached Block 6 before anyone noticed that eleven of the
fourteen migration files in its set were not on disk, and nothing had asserted that the
checkout was even the commit the image was built from. Both facts are provable in one
second and neither was proved. This block proves them, and it is deliberately placed
before the first Expect: in the document so nothing else can run first.
'@)
Add-Line ""
Add-Line "    & {   # GATE D1a -- paste from this line to the matching closing brace"
Add-Line "    if (`$global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { `$global:AFRAKALA_FAILED_GATES = @{} }"
Add-Line "    # D1(a) -- the checkout must BE the commit this release was built from."
Add-Line "    `$buildSha = '$d1BuildSha'"
[void]$sb.AppendLine(@'
    $headSha  = (git rev-parse --short HEAD)
    $dirty    = (git status --porcelain)
    if ($headSha -ne $buildSha) {
      Write-Host "FAIL D1a: HEAD is $headSha but this release was built from $buildSha"
      $gateWhy = "HEAD $headSha is not the build sha $buildSha"
      Write-Host "GATE D1a FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D1a'] = $gateWhy; throw "STOPPED at gate D1a: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if ($dirty) {
      Write-Host "FAIL D1a: working tree is not clean:"
      $dirty | ForEach-Object { Write-Host "    $_" }
      $gateWhy = "working tree is not clean ($(@($dirty).Count) path(s))"
      Write-Host "GATE D1a FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D1a'] = $gateWhy; throw "STOPPED at gate D1a: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D1a: HEAD = $headSha, tree clean"
    $global:AFRAKALA_FAILED_GATES.Remove('D1a')
    Write-Host "GATE D1a PASS"
    }   # end GATE D1a
'@)
Add-Line ""
Add-Line "Expect: OK D1a, HEAD equal to the build sha $d1BuildSha, working tree clean"
Add-Line "Expect: the last line printed is GATE D1a PASS"
Add-Line ""
Add-Line "    & {   # GATE D1b -- paste from this line to the matching closing brace"
Add-Line "    if (`$global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { `$global:AFRAKALA_FAILED_GATES = @{} }"
Add-Line "    # D1(b) -- every migration file in THIS release set must exist on disk."
Add-Line "    `$expected = @($d1MigList)"
[void]$sb.AppendLine(@'
    $missing = @()
    foreach ($f in $expected) {
      if (-not (Test-Path (Join-Path "supabase/migrations" $f))) { $missing += $f }
    }
    if ($missing.Count -gt 0) {
      Write-Host "FAIL D1b: $($missing.Count) of $($expected.Count) migration file(s) missing:"
      $missing | ForEach-Object { Write-Host "    MISSING $_" }
      $gateWhy = "$($missing.Count) migration file(s) missing: $($missing -join ', ')"
      Write-Host "GATE D1b FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D1b'] = $gateWhy; throw "STOPPED at gate D1b: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D1b: all $($expected.Count) migration files present"
    $global:AFRAKALA_FAILED_GATES.Remove('D1b')
    Write-Host "GATE D1b PASS"
    }   # end GATE D1b
'@)
Add-Line ""
Add-Line "Expect: OK D1b, all $d1MigCount migration files present, zero missing"
Add-Line "Expect: the last line printed is GATE D1b PASS"
Add-Line ""
[void]$sb.AppendLine(@'
---

### Block 1 - Preflight
'@)
Add-Line ""
[void]$sb.AppendLine(@'
    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \
      "SELECT pg_is_in_recovery() || '|' || pg_size_pretty(pg_database_size(current_database())) || '|' ||
       (SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%');"
'@)
Add-Line ""
Add-Line "Expect: is_replica|db_size|anon_default_acl_count = $preflight"
Add-Line "Expect: pg_is_in_recovery() = f (a replica must STOP this run immediately)"
Add-Line ""
[void]$sb.AppendLine(@'
    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \
      "SELECT count(*) || '|' || min(version) || '|' || max(version) FROM supabase_migrations.schema_migrations;"
'@)
Add-Line ""
Add-Line "Expect: ledger_rows|ledger_min|ledger_max = $ledgerBefore"
[void]$sb.AppendLine(@'
(this is the state the rehearsal observed on the restored dump; if production disagrees, STOP
and re-run release/rehearse.ps1 against a fresher dump before proceeding)

---

# Phase 3 - autostart tree (HANDOFF: run on the production laptop, not this test computer)
'@)
Add-Line ""
[void]$sb.AppendLine(@'
Production does NOT deploy from C:\afrakala. A scheduled task named "AfraKala LAN Auto Start"
independently runs C:\AfraKalaServer\get-git-going01lan\deploy\lan\start-afrakala-lan.ps1 on boot,
which as of 2026-09-12 is a SEPARATE checkout on branch fix/auth-user-profile-trigger @ 69d78c68
(2026-05-30) with 38 uncommitted paths, missing migrations 522-525, and its compose line has NO
--no-deps. These four blocks are HANDOFF -- an E-4 tooling agent has no access to the production
laptop or that host tree from this worktree. Each block is written for a human to run there, in
order, and each carries its own Expect: line so release/validate-blocks.ps1 still checks it.
'@)
Add-Line ""

$blockN = 2

Add-Line "### Block $blockN - (a) commit the five operational scripts into this repo"
Add-Line ""
[void]$sb.AppendLine(@'
No repository holds these today -- a fresh clone of main reproduces neither autostart nor
backups. Confirmed by their absence under deploy/lan/scripts/ in this repo as of this release.
On the production laptop, in C:\AfraKalaServer\get-git-going01lan\deploy\lan (NOT C:\afrakala):

    Get-ChildItem 'C:\AfraKalaServer\get-git-going01lan' -Recurse -Include *.ps1 |
      Where-Object { $_.Name -match 'start-afrakala-lan|backup|AutoBackup' } |
      Select-Object FullName

Review the result and copy exactly five files -- start-afrakala-lan.ps1, AfraKala-AutoBackup.ps1,
and the three backup scripts the command above finds alongside them -- into
C:\afrakala\deploy\lan\scripts\, matching this repo's own deploy/lan/scripts/ layout. Do NOT copy
any of the untracked production-secret files or auth-API JSON payloads that command may also list
in that tree -- those are explicitly out of scope (owner cleanup, see HANDOFF item below). Then:

    cd C:\afrakala
    git add deploy/lan/scripts/start-afrakala-lan.ps1 deploy/lan/scripts/AfraKala-AutoBackup.ps1 `
      deploy/lan/scripts/<the three backup scripts found above>
    git commit -m "ops(deploy): commit the five scripts the autostart task actually runs"
    git push origin HEAD

Expect: `git status --porcelain deploy/lan/scripts` empty after the commit (nothing left uncommitted)
Expect: exactly 5 files added, none of them a secret/credential file
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - (b) repoint the scheduled task at one canonical tree"
Add-Line ""
[void]$sb.AppendLine(@'
Two trees currently run production code from two different places on boot; this makes "what is
running" ambiguous by construction. The canonical tree is C:\afrakala (deploy/lan/README.md and
CLAUDE.md both already document it as the tree main deploys from) -- repoint the task at it
instead of C:\AfraKalaServer\get-git-going01lan. This is the release line's recommendation, not a
unilateral change: confirm with the owner before running it if C:\AfraKalaServer\get-git-going01lan
was kept as canonical for a reason this document does not know about.

    Get-ScheduledTask -TaskName "AfraKala LAN Auto Start" | Select-Object TaskName, State
    (Get-ScheduledTask -TaskName "AfraKala LAN Auto Start").Actions

    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1" `
      -WorkingDirectory "C:\afrakala\deploy\lan"
    Set-ScheduledTask -TaskName "AfraKala LAN Auto Start" -Action $action

    (Get-ScheduledTask -TaskName "AfraKala LAN Auto Start").Actions

Expect: Actions[0].Execute contains "C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1"
Expect: Actions[0].WorkingDirectory = C:\afrakala\deploy\lan
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - (c) add --no-deps to the autostart compose line"
Add-Line ""
[void]$sb.AppendLine(@'
Without --no-deps, `docker compose ... up -d` on this host pulls the one-shot db-role-fix
container into the start-up graph; it cannot start here (broken Docker Desktop mount layer, see
CLAUDE.md OG-68), and the whole app goes down -- and this command runs on EVERY boot, not just a
manual deploy. Edit the copy of start-afrakala-lan.ps1 committed in Block (a) above
(C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1), changing:

    docker compose --env-file .env.lan up -d

to:

    docker compose --env-file .env.lan up -d --no-deps

then commit that one-line change and push:

    cd C:\afrakala
    git add deploy/lan/scripts/start-afrakala-lan.ps1
    git commit -m "ops(deploy): --no-deps on the autostart compose line (CLAUDE.md OG-68)"
    git push origin HEAD

    Select-String -Path deploy\lan\scripts\start-afrakala-lan.ps1 -Pattern "docker compose"

Expect: the matched line contains --no-deps
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - (d) add the missing ISSABEL_*/OLLAMA_* keys, unify OCR_ENABLED"
Add-Line ""
[void]$sb.AppendLine(@'
Neither tree's .env.lan defines the ISSABEL_*/OLLAMA_* keys at all today (deploy/lan/docker-
compose.yml:53-84 already reads them with empty defaults -- ${ISSABEL_CDR_HOST:-} etc. -- so the
service starts, but silently: this is documented as why OCR is dark and call_logs /
call_log_extensions sit at 0 rows). OCR_ENABLED itself also disagrees between the two trees (true
vs false). NEVER print or commit a real secret value -- this block only names the keys; the
values are the owner's to supply, on the machine that holds them:

    # on the production laptop, C:\afrakala\deploy\lan\.env.lan (gitignored, never committed):
    #   OCR_ENABLED=true                  <- pick ONE value and make both trees agree
    #   ISSABEL_CDR_HOST=<real host>
    #   ISSABEL_CDR_PORT=3306
    #   ISSABEL_CDR_USER=<real user>
    #   ISSABEL_CDR_PASSWORD=<real password>
    #   ISSABEL_CDR_DB=<real db name>
    #   ISSABEL_IMPORT_WORKER_TOKEN=<real token>
    #   OLLAMA_API_URL=http://192.168.170.8:11434
    #   OLLAMA_API_KEY=<real key, if the endpoint requires one>
    #   OLLAMA_MODEL=<real model name>
    #   OLLAMA_EMBED_MODEL=<real embed model name>
    #   OLLAMA_VISION_MODEL=<real vision model name>

Apply the SAME keys, same values, to whichever tree Block (b) above left as canonical (both, if
Block (b) was skipped and two trees still run). Then restart only the app service to pick them up:

    docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps web
    docker exec afrakala-lan-web printenv | Select-String "OCR_ENABLED|ISSABEL_|OLLAMA_"

Expect: OCR_ENABLED identical on both trees (if both still run)
Expect: every ISSABEL_* and OLLAMA_* key above present with a non-empty value (except
Expect: OLLAMA_API_KEY, which may legitimately be empty if the endpoint needs none)
'@)
Add-Line ""
$blockN++

Add-Line "---"
Add-Line ""
[void]$sb.AppendLine(@'
# Phase 4 - migrations
'@)
Add-Line ""
foreach ($m in $applyList) {
    Add-Line "### Block $blockN - migration $($m.Version) . $($m.File)"
    Add-Line ""
    # If the migration header carries an OWNER DECISION notice, reproduce it HERE, literally.
    # The operator reads the block, not the file: a decision that lives only in the migration's
    # header is a decision the person running the release never sees.
    $migPath = Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) "supabase\migrations") $m.File
    if (Test-Path $migPath) {
        $hdr = Get-Content -LiteralPath $migPath -Encoding UTF8
        $start = -1
        for ($i = 0; $i -lt $hdr.Count; $i++) {
            if ($hdr[$i] -match 'OWNER DECISION') { $start = $i; break }
        }
        if ($start -ge 0) {
            # Walk back to the top of the comment run, then forward to its end.
            $from = $start
            while ($from -gt 0 -and $hdr[$from - 1] -match '^\s*--') { $from-- }
            $to = $start
            while ($to -lt ($hdr.Count - 1) -and $hdr[$to + 1] -match '^\s*--') { $to++ }
            Add-Line "> **OWNER DECISION — read this before running the block.** Reproduced verbatim from"
            Add-Line "> ``supabase/migrations/$($m.File)``; the operator reads the block, not the file."
            Add-Line ""
            for ($i = $from; $i -le $to; $i++) {
                Add-Line ("    " + $hdr[$i])
            }
            Add-Line ""
        }
    }
    Add-Line "    mig_apply $($m.Version) $($m.File)"
    Add-Line ""
    Add-Line "Expect: OK $($m.File)"
    Add-Line "Expect: INSERT 0 1"
    # Any NOTICE this migration printed during the rehearsal's replay, in sequence. Derived, never
    # typed -- see the $noticesByVersion block above for why a hard-coded count is a defect.
    if ($noticesByVersion.ContainsKey($m.Version)) {
        foreach ($n in $noticesByVersion[$m.Version]) {
            Add-Line "Expect: $n"
        }
        Add-Line "         (measured in the release sequence by the rehearsal, not typed by hand)"
    }
    Add-Line ""
    $blockN++
}

foreach ($m in $ledgerOnlyList) {
    Add-Line "### Block $blockN - ledger-row-only $($m.Version) . $($m.File)"
    Add-Line ""
    [void]$sb.AppendLine(@'
Catalogue evidence in the rehearsal showed this migration's effect is already PRESENT but
the ledger has no row for it (applied-but-unrecorded, CLAUDE.md rule 2b). The SQL is NOT
re-run. Only the ledger row is written.
'@)
    Add-Line ""
    Add-Line "    ledger_insert_only $($m.Version)"
    Add-Line ""
    Add-Line "Expect: INSERT 0 1"
    Add-Line "Expect: OK ledger-row-only $($m.Version)"
    Add-Line ""
    $blockN++
}

foreach ($m in $shapeTolerantList) {
    Add-Line "### Block $blockN - SHAPE MISMATCH, HUMAN REVIEW REQUIRED - $($m.Version) . $($m.File)"
    Add-Line ""
    [void]$sb.AppendLine(@'
This migration failed replay during rehearsal because the restored shape lacked an object it
alters, and the failure matched a pre-declared entry in
release/config/known-shape-tolerant-migrations.txt (release/lib/shape-tolerance.sh). It was
NOT applied to the rehearsal database and NO ledger row was written for it. This is not an
automatic block -- do not run mig_apply for this version from this document as written.
'@)
    Add-Line ""
    Add-Line "    # DO NOT RUN AUTOMATICALLY. First confirm on the real target:"
    Add-Line "    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \"
    [void]$sb.AppendLine("      ""SELECT version FROM supabase_migrations.schema_migrations WHERE version = '$($m.Version)';""")
    Add-Line ""
    Add-Line "Expect: HUMAN REVIEW REQUIRED before this version is applied anywhere -- confirm"
    Add-Line "Expect: whether the target already has the object this migration alters, then either"
    Add-Line "Expect: run mig_apply by hand or, if the target genuinely lacks it too, treat this as"
    Add-Line "Expect: a real gap and escalate (CLAUDE.md rule 6: fix forward, never edit the old file)"
    Add-Line ""
    $blockN++
}

# --- ledger-row-only BY RECORDED DECISION (e.g. OG-C / migration 373) ---------------------------
# Distinct from the catalogue-driven LEDGER_ONLY blocks above: those were classified by measuring
# the live catalogue during this rehearsal. These were decided by a human beforehand, and the
# block cites the decision and carries its guard, because the decision rests on the guard being
# true of THIS target -- not of the one the decision was written against.
foreach ($m in $decidedLedgerOnlyList) {
    $d = $decisionById[$m.Version]
    $did = if ($d) { $d.DecisionId } else { "(decision file not supplied)" }
    Add-Line "### Block $blockN - ledger-row-only BY DECISION $did - $($m.Version) . $($m.File)"
    Add-Line ""
    if ($d) { Add-Line "Decision $($d.DecisionId): $($d.Reason)" ; Add-Line "" }
    [void]$sb.AppendLine(@'
The SQL is NOT re-run -- the decision says so, and CLAUDE.md rule 2b says re-running a migration
to "make the ledger right" is how a non-idempotent one does real damage. Only the ledger row is
written, and only after the guard below holds on THIS target. A guard that disagrees is a STOP,
not a warning: it means the premise the decision rested on is not true here.
'@)
    Add-Line ""
    if ($d -and $d.GuardSql -ne "") {
        Add-Line "    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \"
        [void]$sb.AppendLine("      ""$($d.GuardSql);""")
        Add-Line ""
        Add-Line "Expect: $($d.GuardExpect)"
        Add-Line "Expect: any other value = STOP. Do not write the ledger row; escalate."
        Add-Line ""
    }
    Add-Line "    ledger_insert_only $($m.Version)"
    Add-Line ""
    Add-Line "Expect: INSERT 0 1"
    Add-Line "Expect: OK ledger-row-only $($m.Version)"
    Add-Line ""
    $blockN++
}

# --- SKIPPED BY RECORDED DECISION -- the third category, and the one that must not be confused ---
# with shape tolerance above. A shape-tolerated block says "this failed here and a human must
# decide". This one says "a human already decided, and the answer is that it never runs and never
# gets a ledger row". There is deliberately NO executable directive in this block: nothing for
# release/lib/apply-release-engine.sh to match, so nothing can be run from it by accident.
foreach ($m in $decisionSkippedList) {
    $d = $decisionById[$m.Version]
    $did = if ($d) { $d.DecisionId } else { "(decision file not supplied)" }
    Add-Line "### Block $blockN - SKIPPED BY DECISION $did - DO NOT RUN - $($m.Version) . $($m.File)"
    Add-Line ""
    if ($d) { Add-Line "Decision $($d.DecisionId): $($d.Reason)" ; Add-Line "" }
    [void]$sb.AppendLine(@'
This is NOT a tolerated failure and NOT an omission. The migration was never attempted during the
rehearsal -- its SQL was never delivered to the container and nothing raised -- because a human
decided beforehand that it does not run on this target. Nothing performed its work here, so a
ledger row would be a FALSE statement about the schema, which is precisely what
e2e/security/og81-migration-ledger-matches-disk.spec.ts exists to catch. og81 fails in BOTH
directions on purpose, so "insert the row to make og81 green" is the one thing never to do here.

THE ACCEPTED CONSEQUENCE: this version will be absent from the target's ledger FOREVER, and the
repository's file set and the target's schema will never agree about it. That is the decision, not
a gap for a later release to close. The reasoning is recorded in
docs/missions/convergence/INTEGRATION-LOG.md (Decision 4, OG-J) and STATE.md.

    # Nothing to run. Confirm only that the decision still holds -- the row must NOT be there:
'@)
    Add-Line "    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \"
    [void]$sb.AppendLine("      ""SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '$($m.Version)';""")
    Add-Line ""
    Add-Line "Expect: 0 (no ledger row, permanently, by decision $did)"
    Add-Line "Expect: do NOT run mig_apply for this version, and do NOT insert the row"
    Add-Line "Expect: a value of 1 here means someone recorded it anyway -- STOP and escalate"
    Add-Line ""
    $blockN++
}

Add-Line "---"
Add-Line ""
Add-Line "# Phase 5 - image"
Add-Line ""
Add-Line "### Block $blockN - image transfer"
Add-Line ""
# C4, 2026-09-14. A gate used to end with `exit 1`. Measured by REVIEW-2 section 2.2 and again here:
# pasted into a console-host window, `exit 1` closes the window and the GATE ... FAIL line goes with
# it; in Windows Terminal the text stays but the shell is dead and Enter starts a fresh one. The
# owner PASTES these blocks. So every gate is now one `& { ... }` region that ends in `throw`: the
# rest of the region does not run, the shell and the reason stay, and `powershell -File` still
# exits 1. Because the shell now survives, a region pasted AFTER a failed gate would run -- `exit`
# used to prevent that by killing the shell -- so each state-changing region opens with this guard.
$stateGuardOpen = @'
    & {   # <what> -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
      $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
      Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
      throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
    }
'@
# D2, emitted identically whether or not a build manifest was supplied.
$d2Snippet = @'
    & {   # GATE D2 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D2 -- freeze the CURRENTLY RUNNING image under the rollback name FIRST, before
    # :lan is repointed. The previous order tagged :lan to the incoming image and only
    # afterwards ran `docker tag :lan :lan-rollback`, which moved the rollback name onto
    # the NEW image and left the running-good image with no tag at all. That is a
    # rollback that rolls forward.
    # B3, 2026-09-14: the tag is taken from the RUNNING CONTAINER's image id, never from
    # afrakala-app:lan -- :lan is the name being replaced and need not be what is running.
    # Measured on the test box: :lan = 296eb4b4899f while afrakala-lan-web ran 0c3106602cc9,
    # which no tag pointed at. Both ids below are full sha256, so the comparison is exact.
    $rollbackTag = 'afrakala-app:lan-rollback'
    $runningId = [string](docker inspect afrakala-lan-web --format "{{.Image}}")
    if ($LASTEXITCODE -ne 0 -or $runningId -notmatch '^sha256:[0-9a-f]{64}$') {
      Write-Host "FAIL D2: could not read the image afrakala-lan-web is running (got '$runningId')."
      $gateWhy = "cannot read the image afrakala-lan-web is running"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    docker tag $runningId $rollbackTag
    $tagExit = $LASTEXITCODE
    if ($tagExit -ne 0) {
      Write-Host "FAIL D2: cannot tag the running image $runningId (docker tag exit $tagExit)."
      Write-Host "         The image is not in this machine's image store, or the tag name is invalid."
      Write-Host "         Either way NO rollback point was taken. Stop."
      $gateWhy = "docker tag of the running image failed, no rollback point taken"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $rbId = [string](docker image inspect $rollbackTag --format "{{.Id}}")
    if ($tagExit -ne 0 -or $rbId -ne $runningId) {
      Write-Host "FAIL D2: $rollbackTag is '$rbId' but the running image is $runningId (docker tag exit $tagExit)."
      $gateWhy = "rollback tag is '$rbId' but the running image is $runningId"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # C2, 2026-09-14. The comparison above checks the tag against $runningId, the SAME value the
    # tag was made from, so it cannot notice if that one read was wrong: REVIEW-2 mutant M1 reads
    # :lan into $runningId and this gate printed PASS while the tag was not the container's image.
    # So the CONTAINER is asked again, now, after tagging -- nothing held in a variable is trusted.
    $containerNow = [string](docker inspect afrakala-lan-web --format "{{.Image}}")
    $containerExit = $LASTEXITCODE
    if ($containerExit -ne 0 -or $containerNow -notmatch '^sha256:[0-9a-f]{64}$') {
      Write-Host "FAIL D2: could not re-read the image afrakala-lan-web is running after tagging (exit $containerExit, got '$containerNow')."
      $gateWhy = "cannot re-read the image afrakala-lan-web is running after tagging"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if ($rbId -cne $containerNow) {
      Write-Host "FAIL D2: $rollbackTag is '$rbId' but afrakala-lan-web, re-read after tagging, runs $containerNow."
      $gateWhy = "rollback tag is '$rbId' but afrakala-lan-web is running $containerNow"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D2: $rollbackTag = running image $runningId"
    $global:AFRAKALA_FAILED_GATES.Remove('D2')
    Write-Host "GATE D2 PASS"
    }   # end GATE D2

Expect: OK D2, afrakala-app:lan-rollback equal to the running container's full sha256 image id,
Expect: as re-read from the container AFTER the tag was taken
Expect: the last line printed is GATE D2 PASS
'@
if ($BuildManifest -ne "" -and (Test-Path $BuildManifest)) {
    $manifest = Get-Content $BuildManifest -Raw | ConvertFrom-Json
    Add-Line "Built by release/build.ps1 from main @ $($manifest.git_sha)."
    Add-Line ""
    Add-Line "    # deliver the tarball over the proven LAN channel (SMB share \\192.168.170.8\dumps),"
    Add-Line "    # then on the target machine:"
    Add-Line ""
    [void]$sb.AppendLine($d2Snippet)
    Add-Line ""
    [void]$sb.AppendLine($stateGuardOpen.Replace('<what>', ':lan retag'))
    Add-Line "    gunzip -c afrakala-app-$($manifest.git_sha).tar.gz | docker load"
    Add-Line "    docker tag afrakala-app:$($manifest.git_sha) afrakala-app:lan"
    [void]$sb.AppendLine('    docker images afrakala-app:lan --format "{{.ID}}"')
    Add-Line "    }   # end :lan retag"
    Add-Line ""
    Add-Line "Expect: loaded image ID = $($manifest.image_id)"
    Add-Line ""
    [void]$sb.AppendLine(@'
    & {   # GATE D3 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D3 -- the two names MUST now resolve to DIFFERENT images.
    $lanId = (docker images afrakala-app:lan --format "{{.ID}}")
    $rbId  = (docker images afrakala-app:lan-rollback --format "{{.ID}}")
    if ($lanId -eq $rbId) {
      Write-Host "FAIL D3: :lan and :lan-rollback are the same image ($lanId)."
      Write-Host "         Rolling back would change nothing. Stop here."
      $gateWhy = ":lan and :lan-rollback are the same image ($lanId)"
      Write-Host "GATE D3 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D3'] = $gateWhy; throw "STOPPED at gate D3: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D3: lan=$lanId rollback=$rbId"
    $global:AFRAKALA_FAILED_GATES.Remove('D3')
    Write-Host "GATE D3 PASS"
    }   # end GATE D3

Expect: OK D3, printing two DIFFERENT ids. A match is a hard failure.
Expect: the last line printed is GATE D3 PASS
'@)
} else {
    [void]$sb.AppendLine(@'
No build manifest was supplied to emit-blocks.ps1 (-BuildManifest). Run release/build.ps1
first, then re-generate this document, or fill this block in by hand before applying:
'@)
    [void]$sb.AppendLine($d2Snippet)
    [void]$sb.AppendLine($stateGuardOpen.Replace('<what>', ':lan retag'))
    [void]$sb.AppendLine(@'
    gunzip -c afrakala-app-<sha>.tar.gz | docker load
    docker tag afrakala-app:<sha> afrakala-app:lan
    docker images afrakala-app:lan --format "{{.ID}}"
    }   # end :lan retag

    & {   # GATE D3 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D3 -- the two names must resolve to DIFFERENT images.
    $lanId = (docker images afrakala-app:lan --format "{{.ID}}")
    $rbId  = (docker images afrakala-app:lan-rollback --format "{{.ID}}")
    if ($lanId -eq $rbId) { Write-Host "FAIL D3: identical ($lanId)"; $gateWhy = ":lan and :lan-rollback are the same image ($lanId)"; Write-Host "GATE D3 FAIL $gateWhy"; $global:AFRAKALA_FAILED_GATES['D3'] = $gateWhy; throw "STOPPED at gate D3: $gateWhy -- nothing after it in this region ran; this shell is still open" }
    Write-Host "OK D3: lan=$lanId rollback=$rbId"
    $global:AFRAKALA_FAILED_GATES.Remove('D3')
    Write-Host "GATE D3 PASS"
    }   # end GATE D3

Expect: loaded image ID = <fill in from release/out/build-<sha>.json>
Expect: OK D3, two DIFFERENT ids
Expect: the last line printed is GATE D3 PASS
'@)
}
Add-Line ""
$blockN++

Add-Line "---"
Add-Line ""
$blockN++

Add-Line "### Block $blockN - artifact probe (D6)"
Add-Line ""
[void]$sb.AppendLine(@'
D6. On 2026-09-13 the env file on production was CORRECT for the whole incident. The artifact
was not. Every VITE_* value was a build arg, the deploy used --no-build, so the correct env file
never applied and nothing ever looked at what was actually inside the image. This block looks at
the served bundle and nothing else. An env-file check would have passed that day.

Under runtime configuration the client bundle must contain NO host literal: the address arrives
at runtime from the container environment. So the probe is not "does it contain the right host"
-- it is "does it contain ANY host", which is a stronger and simpler property.

B1, 2026-09-14. The first version of (i) matched only http(s)://IPv4:port, so a bundle carrying
http://kong:8000 or https://<ref>.supabase.co passed. (i) is now DEFAULT-DENY: every URL literal
in the client bundle is either on a reviewed list or a failure. A minified bundle cannot tell a
fetch base from help text -- both are string literals -- so the probe does not guess intent:
  - an IP literal, an explicit port, a dotless name (kong, localhost), a private suffix
  (.local/.lan/.internal/...) or a Supabase host ALWAYS fails, whatever list a host is on;
  - illustrative text of that shape is allowed only as that EXACT literal and only up to the
  number of times it was measured in the bundle, so reusing it as a real endpoint fails;
  - any other host must be a reviewed public third party (links, placeholders, schema ids).
A new third-party host fails loudly and by name; the fix is one reviewed line in this emitter.
'@)
Add-Line ""
Add-Line "    & {   # GATE D6 + D9 -- paste from this line to the matching closing brace"
Add-Line "    if (`$global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { `$global:AFRAKALA_FAILED_GATES = @{} }"
Add-Line "    `$img    = 'afrakala-app:$d1BuildSha'"
Add-Line "    `$target = '$D6TargetHost'"
[void]$sb.AppendLine(@'
    # (0) the image must exist, or every check below measures nothing and passes.
    if (-not (docker images -q $img)) {
      Write-Host "FAIL D6(0): image $img does not exist on this machine. Nothing was measured."
      $gateWhy = "image $img does not exist on this machine"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }

    # (i) no host literal in the CLIENT bundle
    $scan = docker run --rm --entrypoint sh $img -c "find /app/.output/public -type f -name '*.js' | wc -l | sed 's/^/SCANNED /'; grep -rhoE '(https?|wss?):(//|\\/\\/)[][:alnum:]._~%:@-]*' /app/.output/public; grep -rhoE '[a-z0-9]{20}\.supabase\.(co|in)' /app/.output/public; true"
    $scanExit = $LASTEXITCODE
    $scanned = 0
    $hits = @()
    foreach ($l in @($scan)) {
      $s = ([string]$l).Trim()
      if ($s -match '^SCANNED\s+(\d+)$') { $scanned = [int]$Matches[1] } elseif ($s) { $hits += ($s -replace '\\/', '/') }
    }
    if ($scanExit -ne 0 -or $scanned -lt 1) {
      Write-Host "FAIL D6(i): the scan measured nothing (docker exit $scanExit, $scanned js file(s) read)."
      $gateWhy = "the client bundle scan measured nothing"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # Backend-SHAPED literals that are not endpoints: exact string -> most occurrences allowed.
    $allowExact = @{
      'http://192.168.170.8:11434' = 1  # src/routes/_app.admin.ai-providers.tsx:95 -- help text shown to an operator
      'http://localhost:9999'      = 1  # @supabase/auth-js GOTRUE_URL -- default used only when no url is given
      'http://localhost'           = 1  # router origin fallback when window.origin is "null"
      'http://macVmlSchemaUri'     = 1  # xlsx XML namespace identifier, never fetched
    }
    # Reviewed public third-party hosts (links, input placeholders, XML/JSON-schema ids).
    $allowHosts = @('www.w3.org', 'schemas.openxmlformats.org', 'sheetjs.openxmlformats.org',
      'schemas.microsoft.com', 'purl.org', 'purl.oclc.org', 'openoffice.org', 'docs.oasis-open.org',
      'json-schema.org', 'schema.org', 'jspdf.default.namespaceuri', 'github.com', 'shahabyazdi.github.io',
      'momentjs.com', 'react.dev', 'fb.me', 'cdnjs.cloudflare.com', 'example.com', 'api.example.com',
      'api.openai.com', 'ai.gateway.lovable.dev', 'get-git-going.lovable.app',
      'pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev', 'myafrakala.ir', 'torob.com', 'app.didar.me',
      'wa.me', 'chat.whatsapp.com', 'eitaa.com', 'rubika.ir', 'ble.ir')
    $bad = @()
    foreach ($g in @($hits | Group-Object)) {
      $lit = $g.Name
      if ($lit -notmatch '://') { $bad += "$lit  (Supabase project host)"; continue }
      $auth = ($lit -split '://', 2)[1] -replace '^[^@]*@', ''
      if ($auth -notmatch '[A-Za-z0-9]') { continue }   # "https://" prefix tests, "https://..." prose
      if ($allowExact.ContainsKey($lit)) {
        if ($g.Count -gt $allowExact[$lit]) { $bad += "$lit  (allowed $($allowExact[$lit])x as illustrative text, found $($g.Count)x)" }
        continue
      }
      $name = $auth; $port = ''
      if ($auth -match '^(\[[^\]]*\]?)(:.*)?$' -or $auth -match '^([^:]*)(:.*)?$') { $name = $Matches[1]; $port = $Matches[2] }
      $why = @()
      if ($port) { $why += 'explicit port' }
      if ($name -match '^\[' -or $name -match '^\d{1,3}(\.\d{1,3}){3}$') { $why += 'IP literal' }
      elseif ($name -notmatch '\.') { $why += 'bare name with no dot' }
      if ($name -match '\.(local|localdomain|lan|internal|intranet|home|corp|test|arpa)$') { $why += 'private suffix' }
      if ($name -match '(^|\.)supabase\.(co|in)$') { $why += 'Supabase host' }
      if ($why.Count -eq 0 -and $allowHosts -contains $name) { continue }
      if ($why.Count -eq 0) { $why += 'host not on the reviewed list' }
      $bad += "$lit  ($($why -join ', '))"
    }
    if ($bad.Count -gt 0) {
      Write-Host "FAIL D6(i): host literal(s) baked into the client bundle ($scanned js files read):"
      $bad | ForEach-Object { Write-Host "    $_" }
      Write-Host "    A host literal here means the image is tied to the machine that built it."
      $gateWhy = "host literal(s) in the client bundle: $(@($bad | ForEach-Object { ($_ -split '  ', 2)[0] }) -join ', ')"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(i): no baked host literal in the client bundle ($scanned js files read, $($hits.Count) URL literal(s) classified)"

    # (ii) the runtime mechanism must actually be present in the bundle
    $hasCfg = docker run --rm --entrypoint sh $img -c "grep -rl __APP_RUNTIME_CONFIG__ /app/.output/public 2>/dev/null | head -1"
    if (-not $hasCfg) {
      Write-Host "FAIL D6(ii): __APP_RUNTIME_CONFIG__ is absent from the client bundle."
      Write-Host "    Without it the client has no address at all. Do not deploy this image."
      $gateWhy = "__APP_RUNTIME_CONFIG__ is absent from the client bundle"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(ii): runtime config mechanism present"

    # (iii) this image, given THIS target's environment, must serve THIS target's address.
    # No double quote inside the sh -c argument: Windows PowerShell 5.1 does not escape an embedded
    # " when calling a native exe, so sh received a cut string, $served came back $null, and
    # `$null -notmatch` is False -- this check printed OK having measured nothing (B1, 2026-09-14).
    $served = docker run --rm --entrypoint sh -e SUPABASE_URL="http://${target}:8000" $img -c 'node .output/server/index.mjs >/dev/null 2>&1 & for i in $(seq 1 45); do wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 && break; sleep 1; done; wget -qO- http://127.0.0.1:3000/login 2>/dev/null | grep -oE ''.supabaseUrl.:.[^,}]*'' | head -1'
    $served = [string]$served
    if (-not $served) {
      Write-Host "FAIL D6(iii): the image served no supabaseUrl at all. Nothing was measured."
      $gateWhy = "the image served no supabaseUrl"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if ($served -notmatch [regex]::Escape($target)) {
      Write-Host "FAIL D6(iii): served config does not name the target $target. Got: $served"
      $gateWhy = "served config does not name the target $target"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(iii): served config = $served"
    $global:AFRAKALA_FAILED_GATES.Remove('D6')
    Write-Host "GATE D6 PASS"

    # D9 -- the served host must be reachable FROM A BROWSER.
    # D6(i)-(iii) all passed on an image whose injected config was
    # {"supabaseUrl":"http://kong:8000"} -- the compose-internal service name. The bundle was
    # clean, the mechanism was present, and one image still served two different values. SSR
    # resolves "kong"; a browser never can. The artifact probe structurally cannot see this,
    # because the value is correct-looking and only arrives at runtime.
    $servedHost = ""
    if ($served -match '"supabaseUrl":"https?://([^/:"]+)') { $servedHost = $Matches[1] }
    if ($servedHost -eq "") {
      Write-Host "FAIL D9: could not parse a host out of the served config: $served"
      $gateWhy = "no host could be parsed from the served config"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $isIPv4     = $servedHost -match '^\d{1,3}(\.\d{1,3}){3}$'
    $isDottedFqdn = $servedHost -match '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
    $isLoopback = $servedHost -in @("localhost", "127.0.0.1", "0.0.0.0", "::1")
    if ($isLoopback) {
      Write-Host "FAIL D9: served host '$servedHost' is loopback. Correct inside the container,"
      Write-Host "         unreachable for every browser except one on the server itself."
      $gateWhy = "served host '$servedHost' is loopback"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if (-not ($isIPv4 -or $isDottedFqdn)) {
      Write-Host "FAIL D9: served host '$servedHost' is a bare name with no dot -- a"
      Write-Host "         compose service name or container alias. SSR resolves it; a browser"
      Write-Host "         cannot. Set APP_SUPABASE_PUBLIC_URL to the address staff type."
      $gateWhy = "served host '$servedHost' is a bare name with no dot"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D9: served host '$servedHost' is browser-reachable"
    $global:AFRAKALA_FAILED_GATES.Remove('D9')
    Write-Host "GATE D9 PASS"
    }   # end GATE D6 + D9
'@)
Add-Line ""
Add-Line "Expect: OK D6(i), no baked host literal in the client bundle"
Add-Line "Expect: OK D6(ii), runtime config mechanism present"
Add-Line "Expect: OK D6(iii), served config naming $D6TargetHost"
Add-Line "Expect: OK D9, served host browser-reachable (not a compose service name, not loopback)"
Add-Line "Expect: GATE D6 PASS, then GATE D9 PASS as the last line printed"
Add-Line ""

Add-Line "# Phase 6 - deploy"
Add-Line ""
Add-Line "### Block $blockN - rollback tag"
Add-Line ""
[void]$sb.AppendLine(@'
ONE convention, always: 'afrakala-app:lan-rollback'. Five differently-named stale tags existed
before this pipeline (lan-rollback-before-pv-remediation, lan-rollback-before-revert,
lan-rollback-settlement-price, lan-rollback-before-quote-autofill, and an unnamed one) and were
deleted by the orchestrator because none of them was the agreed name.

CORRECTED by E-4, 2026-09-13. The prune used to match the literal 'lan-rollback-', which assumes
every stale tag carries the 'lan-' prefix. It does not. Measured on the test computer:

    docker images afrakala-app --format "{{.Repository}}:{{.Tag}}"
    afrakala-app:lan
    afrakala-app:local
    afrakala-app:rollback-9c113aac      <-- a rollback tag; 'lan-rollback-' does NOT match it

So the old line left that tag in place while its Expect: claimed exactly one rollback tag
remained -- a check that passes without being true, which is the defect this pipeline exists to
stop. The prune below matches any tag containing 'rollback' EXCEPT the one agreed name, which
covers every convention observed (lan-rollback-<reason>, rollback-<sha>, and the unnamed one).

'@)
[void]$sb.AppendLine($stateGuardOpen.Replace('<what>', 'rollback-tag prune'))
[void]$sb.AppendLine(@'
    # D2: the `docker tag afrakala-app:lan afrakala-app:lan-rollback` line that used to
    # sit here is DELETED. It ran AFTER :lan had already been repointed at the incoming
    # image, so it pointed the rollback name at the new image. The rollback tag is now
    # taken in the image-transfer block, before :lan moves.
    docker images afrakala-app --format "{{.Repository}}:{{.Tag}}" |
      Where-Object { $_ -match 'rollback' -and $_ -ne 'afrakala-app:lan-rollback' } |
      ForEach-Object { docker rmi $_ }
    docker images afrakala-app --format "{{.Repository}}:{{.Tag}}`t{{.CreatedAt}}"
    }   # end rollback-tag prune

Expect: afrakala-app:lan-rollback present
Expect: no OTHER tag whose name contains 'rollback' remains (any convention, not just lan-*)
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - deploy"
Add-Line ""
[void]$sb.AppendLine($stateGuardOpen.Replace('<what>', 'deploy'))
[void]$sb.AppendLine(@'
    $env:GIT_SHA = (git rev-parse --short HEAD)
    $env:BUILD_TIME = (Get-Date -Format o)
    docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
      up -d --no-deps --no-build web
    docker restart afrakala-lan-rest
    }   # end deploy

Expect: --no-deps present (its absence takes the whole app down, CLAUDE.md OG-68)
Expect: GIT_SHA set on the command line (its absence silently mislabels the running image)
Expect: afrakala-lan-rest   Up X seconds
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - verify"
Add-Line ""
[void]$sb.AppendLine(@'
    docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String APP_GIT_SHA
    git rev-parse --short HEAD
    docker ps --filter name=afrakala-lan --format "{{.Names}}`t{{.Status}}"
    curl.exe -s -o NUL -w "%{http_code} %{time_total}`n" http://192.168.170.10:3000/login
    curl.exe -s -w "`n%{http_code}`n" http://192.168.170.10:3000/api/healthz

Expect: APP_GIT_SHA equals git rev-parse --short HEAD
Expect: afrakala-lan-db-role-fix = Exited (0); every other afrakala-lan-* = Up
Expect: /login = 200 under 1 second
Expect: /api/healthz = 200
'@)
Add-Line ""
$blockN++

Add-Line "---"
Add-Line ""
Add-Line "# Rollback"
Add-Line ""
Add-Line "### Block $blockN - rollback (run this instead of Block $($blockN - 2) if Block $($blockN - 1) fails)"
Add-Line ""
[void]$sb.AppendLine(@'
    docker tag afrakala-app:lan-rollback afrakala-app:lan
    docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps web

Expect: afrakala-lan-web returns to the image tagged afrakala-app:lan-rollback
(schema rollback, if a migration also needs undoing, is a separate manual step -- see
docs/deployment/rollback-plan.md; this pipeline's migrations are additive by CLAUDE.md rule 3
and do not ship an automatic down path)
'@)
Add-Line ""
$blockN++

Add-Line "---"
Add-Line ""
Add-Line "# Sign-off"
Add-Line ""
Add-Line "### Block $blockN - sign-off"
Add-Line ""
# CORRECTED by E-4, 2026-09-13, by release/validate-blocks.ps1's FIRST run against a real
# document. The three gate lines used to read "- [ ] og81 ... Expect: PASSED", with Expect: buried
# mid-line, so the block contained no line the validator's `^\s*Expect:` rule could see and it was
# reported as having no Expect: at all. That was a true finding, not a false positive: the check
# exists so that no block can be signed off without stating what must be seen, and a validator
# loose enough to accept "Expect:" anywhere in a sentence would accept prose that merely mentions
# it. The generator was fixed; the validator was left strict.
#
# The og81 line ALSO could not honestly say PASSED any more. og81 fails on a target carrying the
# OG-J decision, by design and permanently -- see the SKIPPED BY DECISION blocks above. What the
# operator must check is the reconciliation, not the raw exit code.
[void]$sb.AppendLine(@'
- [ ] og81  (ledger matches disk)
- [ ] og102 (anon execute grants stay closed)
- [ ] og103 (anon table grants stay closed)
- [ ] smoke: receivables page loads
- [ ] smoke: payables page loads
- [ ] smoke: allocation workbench opens
- [ ] cold gate: viewer cannot reach /admin/automation

Executor: ______________     Date/time: ______________

Expect: og102 and og103 show NO test that was green before this release and is red after it.
Expect: Any pre-existing red listed in the rehearsal's baseline section stays red and is NOT
Expect: signed off as fixed -- it is a separate, still-open finding about the target.
Expect: og81's raw result is FAIL on a target carrying the OG-J decision, permanently and by
Expect: design. What must hold instead is its reconciliation: the set of migration files with no
Expect: ledger row equals exactly the SKIPPED BY DECISION and SHAPE MISMATCH blocks above, with
Expect: zero unexplained and zero orphaned. A raw og81 PASS here would mean someone inserted a
Expect: ledger row that must not exist -- that is a STOP, not a success.
Expect: every smoke and cold-gate line above ticked by the executor, by hand, on the real target.
'@)
Add-Line ""
Add-Line "Overall: PASSED / STOP  (circle one; STOP means Block $($blockN - 1)'s rollback was used)"

$sb.ToString() | Set-Content -Path $outFile -Encoding UTF8
Write-Host "Written: $outFile" -ForegroundColor Green
exit 0
