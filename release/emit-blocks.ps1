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
    [string]$Tarball = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RehearsalReport)) {
    Write-Host "FATAL: rehearsal report not found: $RehearsalReport" -ForegroundColor Red
    Write-Host "A RELEASE document is never generated without a rehearsal behind it." -ForegroundColor Yellow
    exit 1
}

$report = Get-Content -Path $RehearsalReport -Encoding UTF8 -Raw
$reportLines = Get-Content -Path $RehearsalReport -Encoding UTF8

if ($report -notmatch "## VERDICT: PASS") {
    Write-Host "FATAL: rehearsal report does not say 'VERDICT: PASS'." -ForegroundColor Red
    Write-Host "Found instead:" -ForegroundColor Yellow
    $reportLines | Where-Object { $_ -match "VERDICT" } | ForEach-Object { Write-Host "  $_" }
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

Write-Host "Parsed rehearsal: $($applyList.Count) APPLY, $($ledgerOnlyList.Count) LEDGER_ONLY, $($shapeTolerantList.Count) SHAPE_TOLERATED" -ForegroundColor Cyan

$outDir = Join-Path $PSScriptRoot "out"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "RELEASE-$Date.md"

$sb = New-Object System.Text.StringBuilder
function Add-Line([string]$s) { [void]$sb.AppendLine($s) }

Add-Line "# RELEASE-$Date"
Add-Line ""
Add-Line "Generated by release/emit-blocks.ps1 from a PASSED rehearsal: $RehearsalReport"
Add-Line "Rehearsal restore source: $dumpFile (md5 $dumpMd5)"
Add-Line ""
[void]$sb.AppendLine(@'
Every block below has a literal 'Expect:' line. release/validate-blocks.ps1 checks this
document mechanically before anyone runs it. release/apply-release.ps1 stops at the FIRST
block whose live output disagrees with its Expect: line -- exactly BLOCKS.md's own rule.

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

Add-Line "---"
Add-Line ""
Add-Line "# Phase 5 - image"
Add-Line ""
Add-Line "### Block $blockN - image transfer"
Add-Line ""
if ($BuildManifest -ne "" -and (Test-Path $BuildManifest)) {
    $manifest = Get-Content $BuildManifest -Raw | ConvertFrom-Json
    Add-Line "Built by release/build.ps1 from main @ $($manifest.git_sha)."
    Add-Line ""
    Add-Line "    # deliver the tarball over the proven LAN channel (SMB share \\192.168.170.8\dumps),"
    Add-Line "    # then on the target machine:"
    Add-Line "    gunzip -c afrakala-app-$($manifest.git_sha).tar.gz | docker load"
    Add-Line "    docker tag afrakala-app:$($manifest.git_sha) afrakala-app:lan"
    [void]$sb.AppendLine('    docker images afrakala-app:lan --format "{{.ID}}"')
    Add-Line ""
    Add-Line "Expect: loaded image ID = $($manifest.image_id)"
} else {
    [void]$sb.AppendLine(@'
No build manifest was supplied to emit-blocks.ps1 (-BuildManifest). Run release/build.ps1
first, then re-generate this document, or fill this block in by hand before applying:

    gunzip -c afrakala-app-<sha>.tar.gz | docker load
    docker tag afrakala-app:<sha> afrakala-app:lan
    docker images afrakala-app:lan --format "{{.ID}}"

Expect: loaded image ID = <fill in from release/out/build-<sha>.json>
'@)
}
Add-Line ""
$blockN++

Add-Line "---"
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

    docker tag afrakala-app:lan afrakala-app:lan-rollback
    docker images afrakala-app --format "{{.Repository}}:{{.Tag}}" |
      Where-Object { $_ -match 'rollback' -and $_ -ne 'afrakala-app:lan-rollback' } |
      ForEach-Object { docker rmi $_ }
    docker images afrakala-app --format "{{.Repository}}:{{.Tag}}`t{{.CreatedAt}}"

Expect: afrakala-app:lan-rollback present
Expect: no OTHER tag whose name contains 'rollback' remains (any convention, not just lan-*)
'@)
Add-Line ""
$blockN++

Add-Line "### Block $blockN - deploy"
Add-Line ""
[void]$sb.AppendLine(@'
    $env:GIT_SHA = (git rev-parse --short HEAD)
    $env:BUILD_TIME = (Get-Date -Format o)
    docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
      up -d --no-deps --no-build web
    docker restart afrakala-lan-rest

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
[void]$sb.AppendLine(@'
- [ ] og81  (ledger matches disk)              Expect: PASSED
- [ ] og102 (anon execute grants stay closed)   Expect: PASSED
- [ ] og103 (anon table grants stay closed)     Expect: PASSED
- [ ] smoke: receivables page loads
- [ ] smoke: payables page loads
- [ ] smoke: allocation workbench opens
- [ ] cold gate: viewer cannot reach /admin/automation

Executor: ______________     Date/time: ______________
'@)
Add-Line ""
Add-Line "Overall: PASSED / STOP  (circle one; STOP means Block $($blockN - 1)'s rollback was used)"

$sb.ToString() | Set-Content -Path $outFile -Encoding UTF8
Write-Host "Written: $outFile" -ForegroundColor Green
exit 0
