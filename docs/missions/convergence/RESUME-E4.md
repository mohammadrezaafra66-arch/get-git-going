# RESUME-E4 — checkpoint log

Replacement E-4. Predecessor stopped mid-run at commit `74907829` on
`feature/conv-release-line`, message "WIP: agent stopped mid-run, unverified, do not merge".
This file is updated after every proven step. Do not trust anything below a checkpoint whose
evidence command you have not re-run yourself.

## Checkpoint 0 — inheritance assessment (2026-09-13, replacement E-4 start)

Commands run to produce this assessment:
```
git -C D:\AfraKalaTest\wt-conv-release rev-parse HEAD
git -C D:\AfraKalaTest\wt-conv-release status --porcelain
git -C D:\AfraKalaTest\wt-conv-release show 74907829 --stat
md5sum /d/AfraKalaTest/dumps/prod-20260913.dump
docker exec afrakala-lan-db psql -U supabase_admin -d postgres --no-psqlrc -A -t \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'prod_rehearsal%';"
```

### (a) Finished (E3: PowerShell parser exit clean / bash -n exit clean, both re-run by E-4)
- `release/rehearse.ps1`, `build.ps1`, `emit-blocks.ps1`, `apply-release.ps1`, `validate-blocks.ps1`
  all exist and parse with zero errors under
  `[System.Management.Automation.Language.Parser]::ParseFile(...)`.
- `release/lib/rehearse-engine.sh`, `mig-apply.sh`, `apply-release-engine.sh` all pass `bash -n`.
- `release/rehearse.ps1` header (lines 11-17) and `release/lib/rehearse-engine.sh` header
  (lines 14-40) both carry the CATALOGUE-not-ledger rationale in the script's own header comment,
  as the brief requires.
- `release/config/known-ledger-lies.txt` has exactly 36 uncommented 14-digit version lines
  (`grep -v '^#' ... | grep -c '^[0-9]'` = 36), and those 36 versions are IDENTICAL to the 36
  versions printed under "FATAL — undeclared ledger/catalogue disagreement" in
  `release/out/rehearsal-e4.md` (visual diff, both lists start `20260424144837 20260424162922
  20260427133517 ...` and end `20260906160000 20260906201000`). This is real, consistent evidence
  a dry run happened and its findings were used to build the file — not a fabricated list.
- `release/out/rehearsal-e4.md` records one real dry run, dated `2026-09-12T15:03:48Z`, against
  `/d/AfraKalaTest/dumps/prod-20260913.dump`, md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0` — **this md5 was
  independently re-verified by E-4** (see command above) and matches. Ledger before replay:
  `681|20260424144837|20260912150000`, matching the mission brief's settled fact exactly.
- `apply-release.ps1` is 97 lines (`<= 120` requirement met), no Node, no Python.

### (b) NOT finished — genuine gaps, not claims
- **The rehearsal never reached PASS.** `rehearsal-e4.md`'s own last line is `## VERDICT: FAIL`
  (undeclared ledger-lies, before `known-ledger-lies.txt` existed to fix that). No PASS report
  exists anywhere in `release/out/`.
- **No `RELEASE-<date>.md` was ever generated.** `emit-blocks.ps1` was never run (it requires a
  PASS report as input and none exists). `release/out/` contains only `rehearsal-e4.md`.
- **`validate-blocks.ps1` was never run against anything real** (nothing to validate yet).
- **`apply-release.ps1` was never run**, against a rehearsal database or otherwise.
- **The scratch database was dropped.** `SELECT datname ... LIKE 'prod_rehearsal%'` returns only
  `prod_rehearsal_20260908` and `prod_rehearsal_gate` (both FORBIDDEN, untouched) — no
  `prod_rehearsal_e4`. The engine's own `trap cleanup EXIT` fires on FAIL too, so this is expected,
  not suspicious — but it means `rehearsal-e4.md` is currently **not reproducible** without a fresh
  run, exactly as the launch brief warned.
- **The "tolerate a missing object" mechanism (NEW SCOPE) does not exist anywhere in the inherited
  code.** `mig_apply` in `release/lib/mig-apply.sh` has no branch for it; `rehearse-engine.sh`'s
  replay loop treats every non-zero `mig_apply` exit as fatal (`STOPPING at first failure`). This
  is a real gap E-4 must build, not a misunderstanding — grep confirms no match for
  "tolerat|shape.mismatch|531" anywhere under `release/`.
- **The four autostart-tree blocks (a)-(d) are completely absent from `emit-blocks.ps1`.** It
  generates Preflight, migrations, image, deploy, rollback, sign-off — nothing about
  `C:\AfraKalaServer\get-git-going01lan`, the scheduled task, the five operational scripts, or
  ISSABEL_*/OLLAMA_* keys. Confirmed by reading the full file (289 lines) — no such section.
- `docs/runbooks/release-line/README.md` does not exist.
- `docs/research/convergence/E-4-proof.md` does not exist, **even though
  `release/config/known-ledger-lies.txt`'s own header (lines 19-20) cites it as already written**
  ("see docs/research/convergence/E-4-proof.md"). This is exactly the [A-1] trap: a citation is not
  evidence the cited file exists. It does not. E-4 must write it for real.
- `docs/missions/convergence/RESUME-E4.md` did not exist before this checkpoint (this file).

### (c) Cannot confirm without re-running
- Whether the 690 candidates, 9 APPLY, 36 pre-declared LEDGER_ONLY-lies, and 403 UNVERIFIABLE
  counts would reproduce identically on a fresh restore — plausible (same dump, same migrations
  dir at this commit) but unproven until re-run.
- Whether `og81`/`og102`/`og103` + the anon view/matview census pass against a replayed rehearsal
  database — never run in this lineage; `rehearsal-e4.md` FAILed before reaching the replay step's
  gates (it aborted at the LEDGER-LIES gate, before any `mig_apply` call).
- Whether `release/build.ps1`'s guard logic and delegation to `deploy/lan/build.ps1` work — never
  invoked in this lineage.

## WHAT IS UNFINISHED (as of Checkpoint 0)
1. Build the shape-tolerance mechanism (NEW SCOPE).
2. Build the four autostart-tree blocks in `emit-blocks.ps1`.
3. Re-run `rehearse.ps1 -KnownLedgerLies release\config\known-ledger-lies.txt` to reach a real PASS.
4. Run `emit-blocks.ps1` -> `validate-blocks.ps1` -> `apply-release.ps1` against `prod_rehearsal_e4`.
5. Write `docs/runbooks/release-line/README.md` (Persian) and `docs/research/convergence/E-4-proof.md`.
6. Commit, push once, open PR to `staging` (do not merge).

## EXACT NEXT COMMAND
Implement the shape-tolerance mechanism: add `release/config/known-shape-tolerant-migrations.txt`
and a sourceable function in a new `release/lib/shape-tolerance.sh`, then wire it into
`release/lib/rehearse-engine.sh`'s replay loop.

## WHAT WOULD PROVE THAT STEP DONE
A standalone bash invocation that sources `release/lib/shape-tolerance.sh` and shows the function
returns 0 (tolerate) for a declared version+substring pair and 1 (do not tolerate) for an
undeclared one — pasted output, both cases.

## Checkpoint 1 — shape-tolerance mechanism + autostart-tree blocks built (2026-09-13)

### Shape-tolerance mechanism (E3/E4 evidence, re-runnable)
`release/lib/shape-tolerance.sh` created (`is_tolerated_shape_mismatch VERSION OUTPUT SHAPE_FILE`).
Unit-tested directly (no docker needed) with:
```
printf '# test file\n20260913095000|constraint "audit_logs_actor_id_fkey" of relation "audit_logs" does not exist\n' > /tmp/shape-test.txt
bash -c 'source release/lib/shape-tolerance.sh
is_tolerated_shape_mismatch "20260913095000" "...does not exist..." /tmp/shape-test.txt   # case A
is_tolerated_shape_mismatch "20260913095000" "ERROR: totally different problem" /tmp/shape-test.txt  # case B
is_tolerated_shape_mismatch "99999999999999" "ERROR: constraint does not exist" /tmp/shape-test.txt  # case C
is_tolerated_shape_mismatch "20260913095000" "ERROR: anything" ""   # case D, no file'
```
Result: Case A (declared+matching) -> tolerated (rc 0). Case B (declared+non-matching) -> not
tolerated (rc 1). Case C (undeclared version) -> not tolerated (rc 1). Case D (no file, safe
default) -> not tolerated (rc 1). All four as designed.

Wired into `release/lib/rehearse-engine.sh`: replay loop now captures `mig_apply` output to
`$TMP/apply_out_<ver>.txt`, and on a non-zero exit for an APPLY-kind candidate, calls
`is_tolerated_shape_mismatch` against `--shape-tolerant <file>` (new CLI flag, plumbed through
`release/rehearse.ps1 -ShapeTolerant <path>`) before deciding to STOP. A tolerated version is
recorded in a new "## Shape-mismatch findings" report section and a "## Machine-readable
classification (FINAL, post-replay overrides)" block that downgrades it from APPLY to
SHAPE_TOLERATED — `release/emit-blocks.ps1` now prefers that FINAL block (falls back to the
original pre-replay block for an older report) and, for any SHAPE_TOLERATED entry, emits a
"HUMAN REVIEW REQUIRED" block instead of an automatic `mig_apply` block.
`release/config/known-shape-tolerant-migrations.txt` shipped EMPTY (no entries) — migration 531
(the worked example) is not in this branch's `supabase/migrations` yet (ceiling 525; 531 lives on
`feature/conv-db-fixes` @ `b77622f6`, unmerged), so there is no real occurrence to declare. This is
recorded honestly in the file's own header, not hidden.

Evidence commands re-run just now:
```
bash -n release/lib/rehearse-engine.sh   # exit 0
bash -n release/lib/shape-tolerance.sh   # exit 0
```
Both exit 0 (E3).

### Autostart-tree blocks (a)-(d)
`release/emit-blocks.ps1` now emits a "# Phase 3 - autostart tree (HANDOFF...)" section with four
blocks, sourced from facts given directly in the launch brief plus `grep -n` evidence from THIS
repo (`deploy/lan/docker-compose.yml:53-84` for the exact ISSABEL_*/OLLAMA_*/OCR_ENABLED key
names — not fabricated names). All four are HANDOFF blocks for a human on the production laptop;
this worktree has no access to `C:\AfraKalaServer\get-git-going01lan` or the scheduled task to
verify them live. Block (b)'s "canonical tree = C:\afrakala" is this agent's recommendation with
its reasoning stated inline, flagged for owner confirmation, not asserted as already decided.

Evidence command re-run just now:
```
[System.Management.Automation.Language.Parser]::ParseFile(...emit-blocks.ps1..., [ref]$tokens, [ref]$errors)
```
0 parse errors (E3).

## WHAT IS UNFINISHED (updated)
1. ~~Shape-tolerance mechanism~~ DONE (Checkpoint 1).
2. ~~Autostart-tree blocks~~ DONE (Checkpoint 1).
3. Re-run `rehearse.ps1 -KnownLedgerLies release\config\known-ledger-lies.txt` to reach a real PASS
   — NOT YET RUN with the updated engine.
4. Run `emit-blocks.ps1` -> `validate-blocks.ps1` -> `apply-release.ps1` against `prod_rehearsal_e4`.
5. Write `docs/runbooks/release-line/README.md` (Persian) and `docs/research/convergence/E-4-proof.md`.
6. Commit, push once, open PR to `staging` (do not merge).

## EXACT NEXT COMMAND (updated)
```
.\release\rehearse.ps1 -Dump D:\AfraKalaTest\dumps\prod-20260913.dump -Date e4b `
  -KnownLedgerLies release\config\known-ledger-lies.txt
```

## WHAT WOULD PROVE THAT STEP DONE
`release/out/rehearsal-e4b.md` ending in `## VERDICT: PASS`, with a `prod_rehearsal_e4b` database
that no longer exists afterward (dropped by the engine's own cleanup trap either way).

---

## Checkpoint 2 — E4-0: merged `origin/staging`, re-proved Checkpoint 1 (2026-09-13)

### Merge
```
$ git fetch origin
$ git rev-parse origin/staging origin/main
a5cdc58054728dd07d8cb1106701f6121793f2fa
a5cdc58054728dd07d8cb1106701f6121793f2fa
$ git rev-list --left-right --count HEAD...origin/staging
3	2
$ git merge origin/staging --no-edit
EXIT=0            # no conflicts
$ git rev-parse HEAD
6ff4b48c68c6a61255a2ee64c135dacb4d650f8f
$ git status --porcelain
                  # empty
```
13 migrations arrived (`git diff --name-only HEAD origin/staging -- supabase/migrations`):
526, 527, 528, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539. Migration count on disk went
to **703** files (`ls supabase/migrations/*.sql | wc -l`), ceiling now `20260913111000`.

**Consequence for Checkpoint 1's honest caveat:** Checkpoint 1 shipped
`release/config/known-shape-tolerant-migrations.txt` EMPTY because migration 531 was not in this
branch. After this merge **531 is present** (`supabase/migrations/20260913095000_531_audit_logs_actor_fk_set_null_on_delete.sql`).
That caveat is now obsolete and the file must be reconsidered against real replay output.

### Re-proof of Checkpoint 1's OWN evidence commands (not trusted — re-run)
```
$ bash -n release/lib/rehearse-engine.sh        exit=0
$ bash -n release/lib/shape-tolerance.sh        exit=0
$ bash -n release/lib/mig-apply.sh              exit=0
$ bash -n release/lib/apply-release-engine.sh   exit=0

$ printf '# test file\n20260913095000|constraint "audit_logs_actor_id_fkey" of relation "audit_logs" does not exist\n' > /tmp/shape-test.txt
$ source release/lib/shape-tolerance.sh; is_tolerated_shape_mismatch ...
A(declared+match)   rc=0     # tolerate
B(declared+nomatch) rc=1     # do not tolerate
C(undeclared)       rc=1     # do not tolerate
D(no file)          rc=1     # safe default

$ grep -v '^#' release/config/known-ledger-lies.txt | grep -c '^[0-9]'
36

$ [Parser]::ParseFile(...) on all five release/*.ps1
release\rehearse.ps1             parse-errors=0
release\build.ps1                parse-errors=0
release\emit-blocks.ps1          parse-errors=0
release\apply-release.ps1        parse-errors=0
release\validate-blocks.ps1      parse-errors=0
```
All Checkpoint 1 claims reproduce. Nothing in it was found false.

### Restore identity re-proved on BOTH sides (the md5-or-nothing rule)
```
$ md5sum /d/AfraKalaTest/dumps/prod-20260913.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0 */d/AfraKalaTest/dumps/prod-20260913.dump
$ docker exec afrakala-lan-db sh -c 'ls -l /tmp/prod13.dump; md5sum /tmp/prod13.dump'
-rw-r--r-- 1 root root 35424962 Sep 12 14:11 /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump
```
Host and container md5 identical, and both equal the value the launch brief settled.

### Database inventory before any work by E-4
```
$ psql -d postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) ... LIKE 'prod_rehearsal%' ..."
afrakala|367 MB                  <- read-only to E-4
postgres|138 MB                  <- FORBIDDEN
prod_rehearsal_20260908|295 MB   <- FORBIDDEN (not mine)
prod_rehearsal_base|352 MB       <- FORBIDDEN
prod_rehearsal_da|352 MB         <- FORBIDDEN
prod_rehearsal_fix|352 MB        <- FORBIDDEN
prod_rehearsal_gate|352 MB       <- FORBIDDEN
prod_rehearsal_v1|352 MB         <- FORBIDDEN
prod_rehearsal_v2|352 MB         <- FORBIDDEN
```
`prod_rehearsal_e4b` does **not** exist. E-4 will create it and touch nothing else.

## EXACT NEXT COMMAND (E4-1)
Add `-RestoreOnly` to `release/rehearse.ps1` (it does not exist today — `param()` block at
`release/rehearse.ps1:43-52` has no such switch), phase the engine, and run restore only.


---

## Checkpoint 3 — E4-1: `-RestoreOnly` built, restore phase PROVEN (2026-09-13)

### What was built, and why it is not a style change
`-RestoreOnly` did not exist. Neither did any way to stop between steps: the engine was ONE
invocation (restore + classify + replay ~690 migrations + three Playwright gates) whose
`trap cleanup EXIT` dropped the database on the way out. That is why two attempts stalled — there
was never anything to resume from, so each retry restarted at `pg_restore`.

`release/lib/rehearse-engine.sh` now takes `--phase all|restore|replay|gates` (default `all`, so
every prior caller is unaffected), `--state-dir`, `--from/--to/--batch-size`, `--drop-when-done`.
A phased run keeps its database and writes real state under `release/runs/<date>/`.
`release/rehearse.ps1` exposes `-RestoreOnly`, `-Replay`, `-GatesOnly`, `-From`, `-To`,
`-BatchSize`, `-StateDir`, `-DropWhenDone`, and `-Dump` is no longer `Mandatory` (the replay and
gates phases never read it).

### E3 — the command and its output
```
$ .eleaseehearse.ps1 -Dump D:\AfraKalaTest\dumps\prod-20260913.dump -Date e4b `
    -RestoreOnly -KnownLedgerLies release\config\known-ledger-lies.txt
exit code = 0
```
Report fragment `release/runs/e4b/01-restore.md`:
```
dump file : D:/AfraKalaTest/dumps/prod-20260913.dump
size bytes: 35424962
md5 (host): 6ccd2dbb07a9a4d9bbae4421eb3265e0
delivered ... -> afrakala-lan-db:/tmp/rehearsal_e4b.dump (md5 6ccd2dbb07a9a4d9bbae4421eb3265e0,
                                                         identical both sides)
pg_restore exit code = 1
restore errors: tolerated=21 untolerated=0
tables|views|functions|policies|persons|audit_logs = 251|24|859|645|4857|112696
ledger_rows|ledger_min|ledger_max = 681|20260424144837|20260912150000
is_replica|db_size|anon_default_acl_count = false|351 MB|0
## Candidates: 703 files at or below ceiling 20260913111000
```
**`681 | top 20260912150000` is exactly the value the launch brief settled for a fresh restore.**
The restore is the right dump, restored correctly. `pg_restore` exit 1 with `tolerated=21
untolerated=0` is the documented-normal shape (cron/pg_cron/vault objects), not a failure.

### The scratch database exists and is RETAINED (the whole point of the phase)
```
$ psql -d postgres -tAc "SELECT datname||' | '||pg_size_pretty(pg_database_size(datname))
                           FROM pg_database WHERE datname='prod_rehearsal_e4b';"
prod_rehearsal_e4b | 351 MB
$ psql -d prod_rehearsal_e4b -tAc "SELECT 'ledger_rows='||count(*)||' top='||max(version)
                                     FROM supabase_migrations.schema_migrations;"
ledger_rows=681 top=20260912150000
```

### Classification — and it SUMS to the candidate count
```
$ for f in ok to_apply to_ledger_only ledger_lies unverifiable; do wc -l release/runs/e4b/$f.txt; done
ok               242
to_apply          21
to_ledger_only     1
ledger_lies       36
unverifiable     403
TOTAL            703
CANDIDATES       703
```
242 + 21 + 1 + 36 + 403 = **703**, equal to the candidate count. All 36 LEDGER-LIES were
pre-declared in `release/config/known-ledger-lies.txt`, so the gate reported each one and
continued instead of aborting.

Apply plan: **22 entries** (21 APPLY + 1 LEDGER_ONLY), `release/runs/e4b/apply_plan.txt`. It
contains all thirteen migrations the staging merge brought in; note `20260913090000` (526)
classified LEDGER_ONLY — its effect is already PRESENT in the restored catalogue, so the SQL is
NOT re-run and only the ledger row is written.

### Also applied in this commit (needed before replay runs, not after)
The engine now captures every `RAISE NOTICE` a migration prints during replay, tagged with its
version, and the gates phase emits them as a "Sequenced expectations" section. This has to be in
place BEFORE the replay phase runs, because it measures during replay. It is the E4-4 derivation
input — see Checkpoint 5.

## EXACT NEXT COMMAND (E4-2)
```
.eleaseehearse.ps1 -Date e4b -Replay -BatchSize 8 -ShapeTolerant release\config\known-shape-tolerant-migrations.txt
```
repeated until it prints `REPLAY COMPLETE`. Never one batch of 22.


---

## Checkpoint 4 - E4-2: batched replay built and run; TWO findings, one of them a BLOCKER

### The batching works, and it is resumable (E3)
`-BatchSize 8` against a 22-entry plan. Batch 1 ran as entries 1-8 and recorded its stopping
point in `release/runs/e4b/progress.txt`; a later `-Replay` with no `-From` resumes from there.
A non-contiguous `--from` is refused by design (migrations are ordered, many are not idempotent).

### Finding 1 - the shape-tolerance mechanism fired on a REAL occurrence (E4)
First attempt at batch 1 stopped dead at plan index 1
(`release/runs/e4b/00-first-attempt-336-guard-failure.md`):
```
=== apply 20260818150000_336_drop_dead_receipt_posting_path.sql (version 20260818150000) ===
SET
psql:/tmp/mig_20260818150000.sql:35: ERROR:  wrong database: prod_rehearsal_e4b (expected afrakala)
CONTEXT:  PL/pgSQL function inline_code_block line 4 at RAISE
*** APPLY FAILED: ... (exit 3) -- transaction rolled back, ledger NOT written ***
STOPPING at first failure: 20260818150000 (APPLY) at plan index 1
ledger DELTA this batch : 0
```
Migrations **336 and 343** each open with a literal
`IF current_database() <> 'afrakala' THEN RAISE EXCEPTION 'wrong database: ...'`.
**Production's database is named `postgres`**, so these two abort on production as well - they
always did, and 527's and 528's own headers record it. Their work is already re-issued without
the guard by forward migrations **527 (for 336)** and **528 (for 343)**, both in this same plan,
so tolerating them loses no work.

Declared in `release/config/known-shape-tolerant-migrations.txt` - **after** the run raised the
error, with the substring copied from the run's own output, never predicted:
```
20260818150000|(expected afrakala)
20260818157000|(expected afrakala)
```
Re-run of batch 1 then behaved exactly as designed (this is the E4 before/after):
```
2 version(s) failed replay on this shape but matched a pre-declared tolerance and were SKIPPED,
not applied, no ledger row written:
20260818150000|supabase/migrations/20260818150000_336_drop_dead_receipt_posting_path.sql
20260818157000|supabase/migrations/20260818157000_343_posted_entry_immutability.sql

ledger rows BEFORE this batch: 681
ledger rows AFTER  this batch : 685
ledger DELTA       this batch : 4
plan progress                 : 6 of 22
```
Before the declaration the run stopped at index 1 with delta 0; after it, four migrations applied
and the replay continued to index 6. Same probe, same database, opposite outcome.

### Finding 2 - BLOCKER: migrations 449 and 450 hardcode the TEST computer's row counts
Batch 1 then stopped at plan index 7:
```
psql:/tmp/mig_20260905171000.sql:39: ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
STOPPING at first failure: 20260905171000 (APPLY) at plan index 7
```
Migration 449 asserts, as literals:
```
IF n <> 10 THEN RAISE EXCEPTION '449: daily_capital_snapshots expected 10 rows, found %', n;
IF n <>  2 THEN RAISE EXCEPTION '449: daily_capital_inputs expected 2 rows, found %', n;
```
Measured on both shapes:
```
prod_rehearsal_e4b (restored PRODUCTION)  daily_capital_snapshots=0   daily_capital_inputs=0
afrakala           (the TEST database)    daily_capital_snapshots=10  daily_capital_inputs=2
the three functions 449 drops             PRESENT on the production shape (count = 3)
```
The hardcoded 10 and 2 are **the test computer's numbers**. Following it to root rather than
stopping at the first message, migration **450** has the identical defect:
```
IF n <> 18 THEN RAISE EXCEPTION '450: backup_142 expected 18 rows, found %', n;
IF n <> 18 THEN RAISE EXCEPTION '450: backup_20260722 expected 18 rows, found %', n;
IF n <>  1 THEN RAISE EXCEPTION '450: knowledge_documents expected 1 row, found %', n;
```
measured on the production shape:
```
prod_rehearsal_e4b  dpw_backup_142=16  dpw_backup_20260722=16  knowledge_documents=0
450 asserts         18                 18                      1
```
**This is the same defect class as migration 477's static REVOKE list, and as the hardcoded 214
the mission brief warned about for 537: a number generated against one shape and asserted against
another.** The rehearsal exists to catch exactly this, and it did.

### Why E-4 did NOT make this go away
- **Not fixed.** The correct fix is a NEW forward migration doing 449's and 450's work with
  catalogue-driven guards (the 527/528 pattern). Writing migrations is a product/database change,
  outside this role's permissions, which cover configuration files only. "Never green the build by
  disabling a step" applies directly.
- **Not tolerated.** Declaring them shape-tolerant would be defensible only if their work landed
  some other way, as 527/528 do for 336/343. Nothing in this release re-issues 449 or 450, and the
  three RPCs 449 retires are still PRESENT on the production shape. Tolerating would silently drop
  real work, and would be E-4 asserting a product decision it has no authority or evidence for.

**Consequence: the rehearsal cannot reach `## VERDICT: PASS`, so E4-3, E4-4, E4-5 and E4-6 are
BLOCKED on a fix E-4 may not write.** Plan progress stands at 6 of 22.

## EXACT NEXT COMMAND (for whoever holds the database role)
Write forward migrations for 449 and 450 that derive their assertions from the catalogue instead
of asserting literals, exactly as 527/528 did for 336/343 and as 523/524/537 do for grants. Then
re-run the three phases against a fresh `-Date e4c`.
