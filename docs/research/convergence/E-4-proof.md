# E-4 proof — the release line, rehearsed against the 2026-09-13 production dump

**Verdict: PARTIAL.** The pipeline was built, phased and exercised as far as the *content* of the
release allows. It stopped where it was designed to stop: on a real defect in two migrations that
cannot run on production's shape. Steps E4-0, E4-1, E4-2 and E4-7 are complete with evidence.
Steps E4-3, E4-4, E4-5 and E4-6 are **BLOCKED** on a fix this role is not permitted to write.

This file is both the deliverable and the report. `release/config/known-ledger-lies.txt` cited it
before it existed; it exists now.

---

## Restore identity — printed before anything else

```
$ md5sum /d/AfraKalaTest/dumps/prod-20260913.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0 */d/AfraKalaTest/dumps/prod-20260913.dump

$ docker exec afrakala-lan-db sh -c 'ls -l /tmp/prod13.dump; md5sum /tmp/prod13.dump'
-rw-r--r-- 1 root root 35424962 Sep 12 14:11 /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump
```

Host and container agree, and both equal the value the mission settled. The rehearsal engine
re-delivered it over stdin (never `docker cp`) and re-verified:

```
delivered D:/AfraKalaTest/dumps/prod-20260913.dump -> afrakala-lan-db:/tmp/rehearsal_e4b.dump
  (md5 6ccd2dbb07a9a4d9bbae4421eb3265e0, identical both sides)
```

Database restored from it: **`prod_rehearsal_e4b`**, 351 MB.

```
ledger_rows|ledger_min|ledger_max = 681|20260424144837|20260912150000
```

681 rows, top `20260912150000` — exactly what a fresh restore of this dump is settled to read.

---

## E4-0 — merge `origin/staging`, then re-prove the inherited checkpoint

`origin/staging` and `origin/main` were both at `a5cdc580`.

```
$ git rev-list --left-right --count HEAD...origin/staging
3	2
$ git merge origin/staging --no-edit      # exit 0, no conflicts
$ git rev-parse HEAD
6ff4b48c68c6a61255a2ee64c135dacb4d650f8f
$ git status --porcelain                  # empty
```

Thirteen migrations arrived — 526, 527, 528, 530-539 — taking the tree to **703** migration files
and the ceiling to `20260913111000`.

**Checkpoint 1's own evidence commands were re-run, not trusted.** All reproduced:

```
bash -n release/lib/rehearse-engine.sh        exit=0
bash -n release/lib/shape-tolerance.sh        exit=0
bash -n release/lib/mig-apply.sh              exit=0
bash -n release/lib/apply-release-engine.sh   exit=0

is_tolerated_shape_mismatch, four cases:
  A declared + matching substring   rc=0   tolerate
  B declared + non-matching         rc=1   do not tolerate
  C undeclared version              rc=1   do not tolerate
  D no file at all                  rc=1   safe default

grep -v '^#' release/config/known-ledger-lies.txt | grep -c '^[0-9]'   ->  36

[Parser]::ParseFile on all five release/*.ps1   ->  0 parse errors each
```

One inherited claim became **obsolete** as a direct result of the merge, and is corrected below:
Checkpoint 1 shipped `known-shape-tolerant-migrations.txt` empty, honestly explaining that
migration 531 was not in this branch. After the merge it is.

Databases present before E-4 touched anything — `prod_rehearsal_e4b` was **not** among them, and
none of the forbidden databases was written to at any point:

```
afrakala|367 MB   postgres|138 MB   prod_rehearsal_20260908|295 MB
prod_rehearsal_base|352 MB   prod_rehearsal_da|352 MB   prod_rehearsal_fix|352 MB
prod_rehearsal_gate|352 MB   prod_rehearsal_v1|352 MB   prod_rehearsal_v2|352 MB
```

---

## E4-1 — `-RestoreOnly`

### Why this is not cosmetic

The switch did not exist, and neither did any way to stop between steps. The engine was **one
invocation**: restore, classify, replay ~690 migrations, run three Playwright gates — with
`trap cleanup EXIT` dropping the database on the way out. That is why two attempts stalled: when
the run died there was nothing to resume from, so the next attempt restarted at `pg_restore` and
never got further than the last one.

`release/lib/rehearse-engine.sh` now takes `--phase all|restore|replay|gates` (default `all`, so
every prior caller is unaffected), plus `--state-dir`, `--from`, `--to`, `--batch-size` and
`--drop-when-done`. A phased run keeps its database and writes real state under
`release/runs/<date>/`. `release/rehearse.ps1` exposes `-RestoreOnly`, `-Replay`, `-GatesOnly`,
`-From`, `-To`, `-BatchSize`, `-StateDir`, `-DropWhenDone`; `-Dump` is no longer `Mandatory`
because the replay and gates phases never read it.

### The run (E3)

```
$ .\release\rehearse.ps1 -Dump D:\AfraKalaTest\dumps\prod-20260913.dump -Date e4b `
    -RestoreOnly -KnownLedgerLies release\config\known-ledger-lies.txt
exit code = 0
```

```
pg_restore exit code = 1
restore errors: tolerated=21 untolerated=0
tables|views|functions|policies|persons|audit_logs = 251|24|859|645|4857|112696
ledger_rows|ledger_min|ledger_max = 681|20260424144837|20260912150000
is_replica|db_size|anon_default_acl_count = false|351 MB|0
## Candidates: 703 files at or below ceiling 20260913111000
```

`pg_restore` exit 1 with `tolerated=21 untolerated=0` is the documented-normal shape (cron/pg_cron
and vault objects), not a failure.

The database exists and was deliberately **retained** — the whole point of the phase:

```
$ psql -d postgres -tAc "SELECT datname||' | '||pg_size_pretty(pg_database_size(datname))
                           FROM pg_database WHERE datname='prod_rehearsal_e4b';"
prod_rehearsal_e4b | 351 MB
$ psql -d prod_rehearsal_e4b -tAc "SELECT 'ledger_rows='||count(*)||' top='||max(version)
                                     FROM supabase_migrations.schema_migrations;"
ledger_rows=681 top=20260912150000
```

---

## E4-2 — batched replay

`-From` / `-To` / `-BatchSize` did not exist either. They do now, and the replay phase **refuses a
non-contiguous `--from`**: migrations are ordered and many are not idempotent (CLAUDE.md rule 2b
names 402 dropping a column, 404 dropping and recreating a function, 409 dropping a signature), so
skipping or repeating a range is exactly how one of those runs twice. That refusal is the safety
property, not an inconvenience.

Plan: **22 entries** (21 `APPLY` + 1 `LEDGER_ONLY`). Run as `-BatchSize 8`, never as one call.

### Finding 1 — the shape-tolerance mechanism fired on a real occurrence (E4)

First attempt at batch 1 stopped at plan index 1
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

Migrations **336** and **343** each open with, verbatim:

```sql
DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;
```

**Production's database is named `postgres`**, not `afrakala`. So these two abort on production
as well — they always did, and migrations 527 and 528 exist precisely because they did. Their
work is re-issued without the guard by **527 (for 336)** and **528 (for 343)**, both present in
this same apply plan, so tolerating them loses no work.

Declared in `release/config/known-shape-tolerant-migrations.txt` **after** the run raised the
error, with the substring lifted from that run's own output rather than predicted:

```
20260818150000|(expected afrakala)
20260818157000|(expected afrakala)
```

The substring is `(expected afrakala)` rather than the whole line because the full text embeds the
scratch database's name, which differs on every run and on production.

Re-running batch 1 gave the before/after on the same probe and the same database:

| | before the declaration | after |
|---|---|---|
| stopped at | plan index 1 | plan index 7 |
| ledger delta | 0 | **4** |
| shape-tolerated | 0 | **2** |
| progress | 0 of 22 | **6 of 22** |

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

### Finding 2 — BLOCKER: migrations 449 and 450 hardcode the test computer's row counts

Batch 1 then stopped at plan index 7:

```
psql:/tmp/mig_20260905171000.sql:39: ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
CONTEXT:  PL/pgSQL function inline_code_block line 12 at RAISE
STOPPING at first failure: 20260905171000 (APPLY) at plan index 7
```

Migration 449 asserts literals:

```sql
IF n <> 10 THEN RAISE EXCEPTION '449: daily_capital_snapshots expected 10 rows, found %', n;
IF n <>  2 THEN RAISE EXCEPTION '449: daily_capital_inputs expected 2 rows, found %', n;
```

Measured directly on both shapes:

```
prod_rehearsal_e4b (restored PRODUCTION)  daily_capital_snapshots=0   daily_capital_inputs=0
afrakala           (the TEST database)    daily_capital_snapshots=10  daily_capital_inputs=2
the three functions 449 drops             PRESENT on the production shape (count = 3)
```

**The hardcoded 10 and 2 are the test computer's numbers.** Following it to root rather than
stopping at the first message, migration **450** carries the identical defect:

```sql
IF n <> 18 THEN RAISE EXCEPTION '450: backup_142 expected 18 rows, found %', n;
IF n <> 18 THEN RAISE EXCEPTION '450: backup_20260722 expected 18 rows, found %', n;
IF n <>  1 THEN RAISE EXCEPTION '450: knowledge_documents expected 1 row, found %', n;
```

```
prod_rehearsal_e4b  dpw_backup_142=16  dpw_backup_20260722=16  knowledge_documents=0
450 asserts         18                 18                      1
```

**This is the same defect class as migration 477's static REVOKE list, and the same class as the
hardcoded 214 the mission brief warned about for 537: a number generated against one shape and
asserted against another.** The rehearsal exists to catch exactly this, and it did. Counting the
units properly: this is 2 migration files, asserting 5 literal row-counts, against 5 catalogue
facts that differ on the target — not "two errors".

### Why E-4 did not make this go away

- **Not fixed.** The correct fix is a new forward migration doing 449's and 450's work with
  catalogue-driven guards — the 527/528 pattern, or the 523/524/537 pattern for grants. Writing a
  migration is a product/database change, outside this role's permissions, which cover
  configuration files only. Changing product code to green a build is explicitly forbidden.
- **Not tolerated.** Declaring them shape-tolerant would be defensible only if their work landed
  some other way, as 527/528 do for 336/343. Nothing in this release re-issues 449 or 450, and the
  three RPCs that 449 retires are still PRESENT on the production shape. Tolerating would silently
  drop real work and would be E-4 asserting a product decision it has neither the authority nor
  the evidence to make. Greening a run by disabling a step is the one thing this role must never
  do.

**Consequence: the rehearsal cannot reach `## VERDICT: PASS`.** Plan progress stands at 6 of 22.

---

## E4-3 — gates + verdict — **BLOCKED**

`emit-blocks.ps1` refuses any report that does not say `## VERDICT: PASS`, and that refusal is
correct. No PASS report exists, so there is no verdict to report and no candidate ledger to sign
off.

What the rehearsal *did* produce, and what the verdict section would have carried, is the
classification — and **it sums to the candidate count**, which is the arithmetic the step
demanded:

```
$ for f in ok to_apply to_ledger_only ledger_lies unverifiable; do wc -l release/runs/e4b/$f.txt; done
considered (candidates)                                      703
  OK         (ledger + catalogue agree: already applied)     242
  APPLY      (not applied; queued for mig_apply)              21
  LEDGER_ONLY(applied but unrecorded; ledger row only)         1
  LEDGER_LIES(ledger claims applied, catalogue disagrees)     36   all pre-declared
  UNVERIFIABLE(ledger row exists, no catalogue signal)       403
                                                            ----
  242 + 21 + 1 + 36 + 403 =                                   703
```

Equal to the candidate count, exactly. Of the 22-entry plan that follows from it, **4 applied, 2
tolerated, 1 refused, 15 never attempted.**

The gates themselves (`og81`, `og102`, `og103`) were **not run**. The gates phase refuses to run
against a half-migrated shape, because a verdict about a database that will never exist is worse
than no verdict.

---

## E4-4 — `emit-blocks.ps1` — **PARTIALLY BLOCKED**

The brief's correction was right: `emit-blocks.ps1` already derived `Expect:` values from
`$preflight` and `$ledgerBefore`. The job was to **extend that derivation to cover 537's sequenced
count**, and the extension is built and half-proven.

### What was built

The engine now captures every `RAISE NOTICE` a migration prints **during the real replay, in the
real sequence**, tagged with its version, and the gates phase emits them as a
`## Sequenced expectations` section. `emit-blocks.ps1` parses that section and attaches those
lines verbatim as per-migration `Expect:` lines.

The reasoning is recorded in both files, because the number is the point:

> Migration 537 revokes TRUNCATE from `authenticated` on **214** tables when applied alone — its
> own header says so — but on more than that in this sequence, because migration **534** creates
> `cron_run_log` three steps earlier and the new table inherits the schema default that still
> includes TRUNCATE. An operator reading a hardcoded 214 would see the larger number, conclude the
> run had gone wrong, and stop a **correct** release. A hardcoded count is the same defect class as
> migration 477's static REVOKE list. Derive it, or do not print it.

### What is proven, and what is not

**Proven (E3):** the capture half works on real migrations in real sequence.

```
$ cat release/runs/e4b/notices.txt
20260828000000|NOTICE:  411: 7 ranges set; all customer score rows recomputed on the new scale
20260828010000|NOTICE:  412: cooperation hint now matches the widened range
20260829000000|NOTICE:  413: 4 ranges set; all salesperson score rows recomputed on the new scale
```

Those three numbers were measured, not typed.

**Not proven:** the emit half was never exercised, because the replay never reached 537 and no
PASS report exists to feed `emit-blocks.ps1`. The parser parses (`ParseFile` -> 0 errors) but has
not run against a real `## Sequenced expectations` block. **No `RELEASE-<date>.md` was produced.**
I am not claiming 537's sequenced count is 215; I am claiming the mechanism that would measure it
is in place and has been shown to work on other migrations.

### Also corrected here: the rollback-tag prune (the standardisation)

One convention, always: **`afrakala-app:lan-rollback`**. The block already said so, but its prune
matched the literal `lan-rollback-`, which assumes every stale tag carries the `lan-` prefix.
Measured on this machine:

```
$ docker images afrakala-app --format "{{.Repository}}:{{.Tag}}"
afrakala-app:lan
afrakala-app:local
afrakala-app:rollback-9c113aac      <-- a rollback tag; 'lan-rollback-' does NOT match it
```

So the old line left that tag in place while its `Expect:` claimed exactly one rollback tag
remained — a check that passes without being true. The prune now matches any tag containing
`rollback` that is not exactly the agreed name, covering every convention observed. Documented in
`docs/runbooks/release-line/README.md` §5.

---

## E4-5 — `validate-blocks.ps1` — **BLOCKED**

Nothing to validate. It requires a `RELEASE-<date>.md`, and none was produced. The script parses
(0 parse errors) and is otherwise unexercised in this lineage, exactly as it was before.

---

## E4-6 — `apply-release.ps1` — **BLOCKED**

Requires a validated release document. None exists. No run log, no `PASSED`. Not attempted, and
not simulated — a run log for a document that does not exist would be a fabrication.

---

## E4-7 — the autostart-tree items, the runbook, and this file

### `docs/runbooks/release-line/README.md` — **DONE**

Written in Persian, RTL, covering: catalogue-over-ledger with the 477 reason stated; why the
rehearsal is phased and why the batch width is the checkpoint interval; shape tolerance; the full
pipeline; why no `Expect:` number is typed (the 537/534 worked example); the single rollback-tag
convention; the SMB transfer channel and the stdin/md5 delivery rule; and the list of things that
are never done.

### The four autostart-tree items — **HANDOFF, and item 1 is out of reach from here**

All four blocks exist in `release/emit-blocks.ps1` (`# Phase 3 - autostart tree`), each with its
own `Expect:` line. Their status honestly:

1. **Commit the five operational scripts into `deploy/lan/scripts/`** — **CANNOT BE DONE FROM
   THIS MACHINE.** They live in the production laptop's separate checkout. Verified absent here:
   ```
   $ ls -d "/c/AfraKalaServer/get-git-going01lan"
   ls: cannot access '/c/AfraKalaServer/get-git-going01lan': No such file or directory
   $ find /c/afrakala /d/AfraKalaTest -iname "start-afrakala-lan.ps1" -o -iname "*AutoBackup*"
   (no matches)
   ```
   (`C:\afrakala` exists on this machine but is an unrelated scratch directory, not a checkout.)
   Reaching the production laptop is forbidden — not one packet. So the deliverable is block (a),
   written for a human to run there. **The scripts still exist in no repository. This item is not
   closed, and I am not recording it as closed.**
2. **Repoint the scheduled task at one canonical tree** — block (b). Recommends `C:\afrakala`,
   with the reasoning inline and flagged for owner confirmation rather than asserted as decided.
   Unverifiable from here: no access to the task or the host tree.
3. **`--no-deps` on the autostart compose line** — block (c). The rationale is measured and
   already in `CLAUDE.md` (OG-68): `web` depends on `kong`, and four services depend on a
   `db-role-fix` container that cannot start on this machine, so a plain `up -d` takes the app
   down — on **every boot**, not just a manual deploy.
4. **The missing `ISSABEL_*`/`OLLAMA_*` keys, `OCR_ENABLED` unified** — block (d). The key names
   are real, not invented — verified in this repo:
   ```
   deploy/lan/docker-compose.yml:53  OCR_ENABLED: ${OCR_ENABLED:-false}
   deploy/lan/docker-compose.yml:56-60  OLLAMA_API_URL / OLLAMA_API_KEY / OLLAMA_MODEL /
                                        OLLAMA_EMBED_MODEL / OLLAMA_VISION_MODEL
   deploy/lan/docker-compose.yml:76-84  ISSABEL_CDR_HOST / _PORT / _USER / _PASSWORD / _DB /
                                        ISSABEL_IMPORT_WORKER_TOKEN
   ```
   The block names keys only. **No value of any kind was read, printed, logged or committed** —
   `deploy/lan/.env.lan` was never opened. The Issabel token appears nowhere in this branch.

### `docs/research/convergence/E-4-proof.md` — this file — **DONE**

`release/config/known-ledger-lies.txt` cited it as already written while it did not exist. A
citation is not evidence the cited file exists. It exists now.

---

## E4-8 — push and PR

One push, at the end. PR opened against `staging`, **not merged**.

---

## Verification owed

| check | result |
|---|---|
| `npx tsc --noEmit` | see below — E-4 touched no `.ts`/`.tsx` file at all |
| `npm run build` | **skipped, and saying so.** E-4's own diff (`git diff --name-only 6ff4b48c HEAD`) is entirely under `release/` and `docs/`. No `src/`. |
| e2e suite | not run — not this wave's, per the brief |

```
$ git diff --stat 6ff4b48c HEAD
 docs/missions/convergence/RESUME-E4.md              | 268 +++++
 docs/runbooks/release-line/README.md                | new
 docs/research/convergence/E-4-proof.md              | new
 release/config/known-shape-tolerant-migrations.txt  |  57 +-
 release/emit-blocks.ps1                             |  67 +-
 release/lib/rehearse-engine.sh                      | 283 ++++-
 release/rehearse.ps1                                |  78 +-
 release/out/, release/runs/e4b/                     | evidence artifacts
```

---

## What I did NOT do

- **Did not deploy anything.** No compose command, no image push, no container touched, no browser.
- **Never contacted the production laptop** at `192.168.170.10` — not one packet.
- **Never wrote to** `afrakala` (read-only measurements only), `postgres`, `prod_rehearsal_base`,
  `_gate`, `_v1`, `_v2`, `_da`, `_fix`, or `prod_rehearsal_20260908`. Only `prod_rehearsal_e4b`,
  which E-4 created.
- **Never read or printed a secret.** `deploy/lan/.env.lan` was never opened; the database password
  is taken from the container's own environment (`release/lib/mig-apply.sh:28-29`) and never
  echoed.
- **Did not edit any migration file.** CLAUDE.md rule 6 holds.
- **Did not write migrations 540/541** to unblock 449/450 — out of this role's permissions.
- **Did not declare 449/450 shape-tolerant** to reach a green verdict.
- Did not run the e2e suite.

## What remains unexercisable on this host

- `og81` / `og102` / `og103` against a fully replayed rehearsal database — blocked behind 449/450.
- `emit-blocks.ps1`'s sequenced-`Expect:` emission — needs a PASS report.
- `validate-blocks.ps1` and `apply-release.ps1` — need a release document.
- 537's actual sequenced count — the replay never reached it. The brief's expectation of 215 is
  plausible and the mechanism to measure it exists, but **it has not been measured and I am not
  reporting it as measured.**
- The four autostart-tree items — all require the production laptop.

## Files E-4 produced that are NOT committed

Under `release/runs/e4b/` (left on disk as working evidence, deliberately not committed because
they are large or derived): `candidates.txt`, `ledger.txt`, `evidence.raw`, `evidence.txt`,
`ok.txt`, `to_apply.txt`, `to_ledger_only.txt`, `ledger_lies.txt`, `lies_unresolved.txt`,
`unverifiable.txt`, `shape_tolerated.txt`, `notices.txt`, `restore.log`, `apply_out_*.txt`, and the
console logs `release/runs/e4b-*.log`. None contains a secret. The scratch database
**`prod_rehearsal_e4b` is still on the server**, retained on purpose so the next agent can resume
from plan index 7 without a fresh restore.

## Recommendations, out of scope — recorded, not acted on

1. Forward migrations for **449** and **450** replacing their hardcoded row-count assertions with
   catalogue-derived ones. This is the release blocker.
2. A rehearsal gate that greps new migrations for literal row-count and database-name assertions
   before they merge — 336, 343, 449, 450 and 477 are five instances of one recurring defect.
3. `ledger-evidence.sh` hardcodes `supabase_admin`; it would need a user argument if `--db-user`
   is ever set to anything else.
4. 403 of 703 candidates are `UNVERIFIABLE` — the catalogue has no signal for function-only,
   grant-only and data-only migrations. That is a large blind spot in "catalogue over ledger" and
   deserves its own mission.
