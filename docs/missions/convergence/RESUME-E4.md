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
