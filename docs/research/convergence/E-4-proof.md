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
| `npx tsc --noEmit` | **70 errors across exactly 6 files — baseline matched, per file** |
| `npm run build` | **skipped, and saying so.** E-4's own diff is entirely under `release/` and `docs/`; no `src/`, no `.ts`, no `.tsx`. |
| e2e suite | not run — not this wave's, per the brief |

```
$ git diff --name-only 6ff4b48c HEAD | grep -E '^src/|\.tsx?$'
(no matches - config, docs and release tooling only)
```

Per-file comparison against the committed baseline
(`docs/verification/convergence/typecheck-integration-70-6.txt`):

```
file                                        baseline  mine
src/lib/accounting/functions.ts                 13    13   MATCH
src/lib/audit/index.ts                           6     6   MATCH
src/lib/invoices/functions.ts                   13    13   MATCH
src/routes/_app.admin.automation.tsx             5     5   MATCH
src/routes/_app.admin.sales-reminders.tsx       15    15   MATCH
src/routes/_app.products.index.tsx              18    18   MATCH
                                            ------  ----
                                                70    70
```

### Getting that number took a repair, and the repair is worth recording

The first run of `npx tsc --noEmit` in this worktree reported **1985 errors across ~300 files** —
28x the baseline, with nonsense like `Property 'variant' does not exist on type 'BadgeProps'`
against a `badge.tsx` that plainly declares it. E-4 had changed no `.ts` file, so the cause had to
be environmental.

It was: this worktree's `node_modules` contained **truncated packages**. Measured directly —

```
$ ls node_modules/class-variance-authority/dist/
index.js
index.js.map                 <-- index.d.ts and index.mjs simply absent
```

Without `index.d.ts`, `VariantProps<typeof badgeVariants>` resolves to nothing and every
`variant=` prop in the codebase becomes an error. Deleting that one package and reinstalling took
the count from **1985 to 505**; a full `npm ci` took it to **70**.

The trap worth carrying forward: **`npm install` reported "up to date in 1s" against this broken
tree.** It verifies the package tree, not the files inside it, so a partially-written package is
invisible to it. If a typecheck in a git worktree reports an implausible number, run `npm ci`
before believing it — and before concluding anything about the code.

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

**`node_modules/` (gitignored) was rebuilt by `npm ci` in this worktree** — 662 packages,
replacing a partially-written tree. No `package.json` or `package-lock.json` change was made or
committed; `git status` shows neither as modified.

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

---
---

# E-4 continuation — steps E4-3 … E4-6 and E4-7a

**Verdict: COMPLETE for the steps in scope.** The rehearsal reaches `## VERDICT: PASS`, the release
document exists and validates, and it was executed mechanically against a pristine production-shaped
database to `PASSED`. Three separate defects were found on the way, two of them in this pipeline's
own code, and each is reported with the before/after that proves it.

Everything above this line is the previous run's report and is **unchanged**. Where this run
contradicts it, it says so explicitly.

## Restore identity, and whether this run restored or resumed

**RESUMED. No restore for the main line.** The previous run's retained database was verified to
still exist before anything relied on it — measured, not assumed:

```
$ docker exec ... psql -U supabase_admin -d postgres -tAc "SELECT datname||' | '||pg_size_pretty(...)
    FROM pg_database WHERE datname LIKE 'prod_rehearsal%' OR datname IN ('afrakala','postgres')"
afrakala | 367 MB          postgres | 138 MB          prod_rehearsal_20260908 | 295 MB
prod_rehearsal_base | 352 MB   prod_rehearsal_da | 352 MB
prod_rehearsal_e4b  | 352 MB     <-- the retained database, still there
prod_rehearsal_fix  | 352 MB   prod_rehearsal_gate | 352 MB
prod_rehearsal_v1   | 352 MB   prod_rehearsal_v2 | 352 MB

$ ... -d prod_rehearsal_e4b -tAc "SELECT 'ledger_rows='||count(*)||' min='||min(version)||' top='||max(version) ..."
ledger_rows=685 min=20260424144837 top=20260912150000

$ cat release/runs/e4b/progress.txt
6
```

685 rows and progress 6 is exactly the state the previous run recorded. Resumed at plan index 7.

**Two further restores were taken**, both of the same dump, both with identity printed first:

```
dump file : D:/AfraKalaTest/dumps/prod-20260913.dump
size bytes: 35424962
md5 (host): 6ccd2dbb07a9a4d9bbae4421eb3265e0
delivered ... -> afrakala-lan-db:/tmp/rehearsal_e4c.dump (md5 6ccd2dbb07a9a4d9bbae4421eb3265e0, identical both sides)
pg_restore exit code = 1 ; restore errors: tolerated=21 untolerated=0
tables|views|functions|policies|persons|audit_logs = 251|24|859|645|4857|112696
ledger_rows|ledger_min|ledger_max = 681|20260424144837|20260912150000
## Candidates: 703 files at or below ceiling 20260913111000
```

`prod_rehearsal_e4c` — the gate baseline. `prod_rehearsal_e4d` — the apply-release target, restored
identically. Both reproduced the previous run's restore numbers exactly (681 / `20260912150000` /
703 candidates / 22-entry plan), which independently confirms the E4-1 restore was what it claimed.

---

## E4-3 — the third category, the batches, and the verdict

### The decision the previous run was missing, built as a real category

`release/lib/decided-migrations.sh` + `release/config/decided-migrations.txt` + `--decided`.
Two dispositions: `SKIP` (no SQL, **no ledger row**) and `LEDGER_ONLY` (no SQL, ledger row only
after a declared guard holds). 449/450/452 are `SKIP` under OG-J; 373 is `LEDGER_ONLY` under OG-C
with the guard `SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%'` = `0`.

**It is mechanically different from shape tolerance, not just labelled differently.** Shape
tolerance is consulted only *after* `mig_apply` returns non-zero — the SQL is delivered, runs, and
raises. A decided version is checked *before* the attempt: the replay loop tests the decision
immediately after resolving the file path and `continue`s, so no file is ever delivered to the
container and no error is ever produced. That is why the two are counted and rendered separately
everywhere downstream, and why `release/emit-blocks.ps1` gives a `DECISION_SKIPPED` block **no
executable directive at all** — there is nothing for `apply-release-engine.sh` to match, so nothing
can be run from it by accident.

Unit evidence, re-runnable without docker (E3):
```
$ bash -n release/lib/decided-migrations.sh                  exit=0
$ source release/lib/decided-migrations.sh; F=release/config/decided-migrations.txt
A declared SKIP        : disp=[SKIP]        id=[OG-J] rc=0
B declared LEDGER_ONLY : disp=[LEDGER_ONLY] guard=[SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%'] expect=[0]
C undeclared version   : rc=1
D no file at all       : rc=1      <- safe default: nothing is decided unless declared
```

### The batches (E3) — never one call

```
$ .\release\rehearse.ps1 -Date e4b -Replay -BatchSize 8 -ShapeTolerant ... -Decided ...
## Replay batch 7-14 of 22
ledger rows BEFORE this batch: 685
SKIPPED BY DECISION OG-J: 20260905171000 (20260905171000_449_retire_daily_capital_functions.sql)
  reason: 449 retire daily capital functions. Nothing performed this work on production; a ledger
          row would be false. ACCEPTED DIVERGENCE, not a gap.
  the SQL was NOT delivered and NOT executed, and NO ledger row is written -- that
  absence is the decision, not an omission.
SKIPPED BY DECISION OG-J: 20260905171500 (...450...)
SKIPPED BY DECISION OG-J: 20260905180000 (...452...)
ledger rows AFTER  this batch : 690
ledger DELTA       this batch : 5
plan progress                 : 14 of 22          exit code 0

$ .\release\rehearse.ps1 -Date e4b -Replay -BatchSize 8 ...
## Replay batch 15-22 of 22
ledger rows AFTER  this batch : 698
ledger DELTA       this batch : 8
plan progress                 : 22 of 22
## REPLAY COMPLETE — all 22 plan entries applied. Next: --phase gates      exit code 0
```

Plan indices 7, 8 and 9 contributed **0** to the ledger delta. The previous run stopped dead at
index 7; the same probe now walks past it without running it. That is the E4 before/after, on the
same database.

### og81 — run unmodified, then reconciled

og81 cannot pass on a target carrying OG-J, and must not be made to. So the engine runs it alone,
records its real failure, and separately measures the disk/ledger difference, requiring it to equal
the declared exception set exactly in both directions:

```
  2 failed
    og81-migration-ledger-matches-disk.spec.ts:44:1 › every migration file on disk has a ledger row
    og81-migration-ledger-matches-disk.spec.ts:69:1 › the comparison is not vacuous
  2 passed
og81 playwright exit code = 1

## og81 reconciliation (measured directly from disk and the live ledger)
migration files on disk           : 703
ledger rows in prod_rehearsal_e4b : 698
files with NO ledger row          : 5
ledger rows with NO file          : 0   (must be 0 -- a deleted migration file)
declared exception set            : 5   (decided SKIP + shape-tolerated)
UNEXPLAINED unrecorded            : 0   (must be 0)
declared but actually recorded    : 0   (must be 0 -- a stale declaration)

20260818150000  shape-tolerated -- not applied on this shape, OPEN question for a human
20260818157000  shape-tolerated -- not applied on this shape, OPEN question for a human
20260905171000  skipped by decision OG-J -- no row on purpose, permanently
20260905171500  skipped by decision OG-J -- no row on purpose, permanently
20260905180000  skipped by decision OG-J -- no row on purpose, permanently
```

This is stricter than og81 alone, not looser: og81 asks "is the difference empty"; this asks "is the
difference precisely the set a human signed for". **No ledger row was added for 449, 450 or 452.**

### og102/og103 — five red tests, and the reason [A-1] exists

The gates went red on five tests. Before deciding anything I looked for a record — and found one.
`docs/missions/convergence/INTEGRATION-LOG.md:464-497` had already measured **all five on
production**, listed them individually, and concluded:

> "None of the four is caused by this branch, and all four are identical in the baseline run. …It
> does **not** say the eight failures are acceptable. …What it says is narrower and is the only
> thing the gate is entitled to conclude: the eleven migrations in this branch are not their cause,
> and applying this branch does not make any of them worse."

Encoding that as an allowlist would turn a measurement into an assertion someone typed — the defect
class this pipeline exists to stop. So E-4 **measures** it instead: a new `--phase baseline`
(`-BaselineGates`) runs og102/og103 against a **pristine restore of the same dump**
(`prod_rehearsal_e4c`, zero migrations replayed), and the phase **refuses** to run on a database
whose `progress.txt` is not 0 — a baseline taken on a partly-migrated database would absorb the very
failures the release caused.

```
## Baseline failures (PRE-EXISTING on the target, not caused by this release)
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:284:1
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:299:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:523:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:589:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:651:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:682:1
baseline failing tests: 6
```

and after the full replay on `prod_rehearsal_e4b`:

```
failing on the pristine target BEFORE the release : 6
failing AFTER the full replay                     : 5
NEW failures caused by this release               : 0   (must be 0)
tests this release FIXED                          : 1

green after the release, red before it:
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:299:1
```

The release fixes one and breaks none. **The five that stay red are listed in the report, by test,
and are explicitly not licensed.** A test that was green before and is red after is `VERDICT: FAIL`.

### A false zero inside a PASS report — found in this pipeline's own code (E4)

The anon view/matview census printed `anon-readable views/matviews: 0`. It was not zero:

```
ERROR:  operator is not unique: text || "char"
LINE 2: SELECT c.relname || '|' || c.relkind
HINT:  Could not choose a best candidate operator...
anon-readable views/matviews: 0
```

`relkind` is `pg_catalog."char"`; the concatenation is ambiguous and **raised**. `psql_scalar`
swallowed it, the empty result was counted as zero, and a measurement that never ran was printed as
a clean result inside a report ending `VERDICT: PASS`. Fixed with `::text`, plus a second
independent `count(*)` that must agree with the list length or the run FAILS.

```
before:  anon-readable views/matviews: 0
after :  anon-readable views/matviews: 7 (independently counted: 7)
         academy_quiz_questions_public|v   effective_currencies_view|v   employee_monthly_hours|v
         v_latest_active_purchase_prices|v  v_league_tiers_public|v
         v_pricing_recompute_queue_summary|v  vw_purchase_float|v
```

Seven, matching exactly the seven views `INTEGRATION-LOG.md:468-471` recorded as anon-readable on
production. The number was always seven; the pipeline had been reporting zero.

### The verdict (E3)

```
$ .\release\rehearse.ps1 -Date e4b -GatesOnly -ShapeTolerant ... -Decided ... `
    -BaselineFailures release\runs\e4c\baseline-gate-failures.txt
REHEARSAL PASSED. Report: release\out\rehearsal-e4b.md            EXITCODE=0

## Candidate accounting — every candidate in exactly one bucket, and they must SUM
considered (candidates at or below the ceiling)     703
  OK                  (ledger + catalogue agree)    242
  APPLIED             (replayed by this rehearsal)     15
  LEDGER_ONLY         (catalogue-driven, row only)      1
  DECIDED_LEDGER_ONLY (decision, row only, guarded)      1
  SHAPE_TOLERATED     (failed, declared, still OPEN)      2
  SKIPPED_BY_DECISION (never run at all, CLOSED)        3
  LEDGER_LIES         (pre-declared, untouched)         36
  UNVERIFIABLE        (row exists, no catalogue signal) 403
  REFUSED             (plan entries never attempted)     0
  ---- sum                                             703

## VERDICT: PASS
```

242 + 15 + 1 + 1 + 2 + 3 + 36 + 403 + 0 = **703**, equal to the candidate count. The engine checks
that arithmetic itself and emits `VERDICT: FAIL` on a mismatch before the gates are even consulted.

---

## THE SECURITY FINDING — two ledger lies hiding inside UNVERIFIABLE

This is the most important thing this run produced and it was not on the task list. og103 found it;
the rehearsal could not have.

`anon` holds **table-level SELECT** on `public.products`, `public.categories` and
`public.academy_quiz_questions` on production. Verified in the dump itself — a second tool, not the
restored database:

```
$ docker exec afrakala-lan-db sh -c "pg_restore --schema-only -f - /tmp/rehearsal_e4b.dump \
    | grep -nE 'TO anon' | grep -E 'products|categories|academy_quiz_questions'"
62137:GRANT SELECT ON TABLE public.products TO anon;
68999:GRANT SELECT ON TABLE public.academy_quiz_questions TO anon;
69150:GRANT SELECT ON TABLE public.categories TO anon;
```

The test database does not:

```
                                  prod_rehearsal_e4b (production)   afrakala (test)
anon SELECT columns on products                 28                        9
anon SELECT columns on categories               11                        6
```

Two migrations exist whose entire purpose is to remove exactly that table-level grant, and **both
carry ledger rows on production**:

```
supabase/migrations/20260825020000_388_narrow_anon_product_columns.sql:137
  REVOKE SELECT ON public.products FROM anon;
supabase/migrations/20260825120000_390_narrow_anon_category_columns_and_close_price_definer.sql:64
  REVOKE SELECT ON public.categories FROM anon;

20260825020000 : ledger=1  evidence=20260825020000|NO-EVIDENCE  bucket=unverifiable
20260825120000 : ledger=1  evidence=20260825120000|NO-EVIDENCE  bucket=unverifiable
```

**Stated precisely, without over-claiming:** the ledger says both are applied; the column-level
GRANT half of 388 *is* present on production (eleven product columns in the dump); the table-level
REVOKE that defines both migrations is *not*. Whether it never ran or was undone afterwards is not
established here. What is established is that the ledger and the catalogue disagree about these two
migrations — the R-1 / migration-477 failure mode — and that **the rehearsal classified them
UNVERIFIABLE, therefore trusted the ledger, and did nothing.**

So the 403 `UNVERIFIABLE` candidates are not a theoretical blind spot in "catalogue over ledger".
Two of them were caught lying in this very run, by a gate rather than by the classifier, and both
are anon-exposure migrations. `docs/missions/prodprep/ledger-evidence.sh` has no probe for
grant-only migrations, so it returns `NO-EVIDENCE`, and `NO-EVIDENCE` + a ledger row resolves to
"trust the ledger". **That is the weakest joint in the whole design and it belongs in the runbook,
stated plainly, not buried.** This release does not close the exposure and does not claim to.

---

## E4-4 — `RELEASE-e4b.md`, with 537's count DERIVED

```
$ .\release\emit-blocks.ps1 -RehearsalReport release\out\rehearsal-e4b.md -Date e4b `
    -Decided release\config\decided-migrations.txt
Sequenced expectations parsed for 11 migration(s)
Decision file parsed: 4 declared version(s)
Parsed rehearsal: 15 APPLY, 1 LEDGER_ONLY, 2 SHAPE_TOLERATED, 3 DECISION_SKIPPED, 1 DECIDED_LEDGER_ONLY
Written: release\out\RELEASE-e4b.md          exit code 0
```

Block 18 of the generated document, verbatim:

```
### Block 18 - migration 20260913105000 . 20260913105000_537_revoke_truncate_from_authenticated.sql

    mig_apply 20260913105000 20260913105000_537_revoke_truncate_from_authenticated.sql

Expect: OK 20260913105000_537_revoke_truncate_from_authenticated.sql
Expect: INSERT 0 1
Expect: NOTICE:  537: TRUNCATE revoked from authenticated on 215 table(s); 13 already closed.
Expect: NOTICE:  537: default TRUNCATE privilege revoked for grantor(s): supabase_admin, postgres
Expect: NOTICE:  537 OK: authenticated holds TRUNCATE on 0 of 228 tables; service_role still holds it on all 228.
         (measured in the release sequence by the rehearsal, not typed by hand)
```

**215 — and it is measured, not asserted.** The previous run correctly refused to print it. Here is
where it came from: 537's own psql output during the real replay, in the real sequence.

```
$ cat release/runs/e4b/apply_out_20260913105000.txt
=== apply 20260913105000_537_revoke_truncate_from_authenticated.sql (version 20260913105000) ===
psql:/tmp/mig_20260913105000.sql:105: NOTICE:  537: TRUNCATE revoked from authenticated on 215 table(s); 13 already closed.
```

537's own header says **214**, which is what it revokes applied alone. Migration 534 creates
`cron_run_log` three steps earlier and the new table inherits the schema default that still carries
TRUNCATE, so in sequence it closes one more. An operator reading a typed 214 would see 215, conclude
the run had gone wrong, and stop a correct release.

```
$ grep -n "214" release/out/RELEASE-e4b.md
(no output — no typed count survives anywhere in the document)
```

The document also renders the third category distinctly:

```
Block 22, 23   - SHAPE MISMATCH, HUMAN REVIEW REQUIRED - 336 / 343
Block 24       - ledger-row-only BY DECISION OG-C - 373  (guard first, then ledger_insert_only)
Block 25,26,27 - SKIPPED BY DECISION OG-J - DO NOT RUN - 449 / 450 / 452
```

Blocks 25-27 contain **no runnable directive** — only a read-only check that the row is *absent*,
with `Expect: a value of 1 here means someone recorded it anyway -- STOP and escalate`.

---

## E4-5 — `validate-blocks.ps1`, whose first real run found a real defect (E4)

```
$ .\release\validate-blocks.ps1 -Path release\out\RELEASE-e4b.md        # BEFORE
  mig_apply lines found : 15   unique versions : 15   blocks found : 33   blocks missing Expect : 1
FAILED — 1 problem(s):
  - NO Expect: LINE in block: ### Block 33 - sign-off                    EXITCODE=1
```

Not a false positive. The sign-off block wrote `- [ ] og81 (ledger matches disk)   Expect: PASSED`,
with `Expect:` buried mid-line, so the block contained no line the `^\s*Expect:` rule could see.
**The generator was fixed and the validator left strict** — a check loose enough to accept
"Expect:" anywhere in a sentence would accept prose that merely mentions it, and rule 4 exists so
that no block is signed off without stating what must be seen.

The og81 line also could not honestly say `PASSED`: on a target carrying OG-J it fails permanently,
by design. It now states what must actually hold, including
`Expect: A raw og81 PASS here would mean someone inserted a ledger row that must not exist -- that
is a STOP, not a success.`

```
$ .\release\validate-blocks.ps1 -Path release\out\RELEASE-e4b.md        # AFTER
  mig_apply lines found : 15   unique versions : 15   blocks found : 33   blocks missing Expect : 0
PASSED — no problems found.                                              EXITCODE=0
```

---

## E4-6 — `apply-release.ps1`, and a FALSE PASS (E4)

### The first run executed 2 blocks of 17 and reported PASSED

```
$ .\release\apply-release.ps1 -ReleaseMd release\out\RELEASE-e4b.md -TargetDb prod_rehearsal_e4c `
    -Decided release\config\decided-migrations.txt
PASSED. Log: release\runs\20260913-024603.log

$ grep -E "^(Block:|=== VERDICT)" release/runs/20260913-024603.log
Block: ledger_insert_only 20260913090000
Block: ledger_insert_only 20260822210000
=== VERDICT: PASSED (all preflight + migration blocks matched their Expect: lines;
```

Fifteen `mig_apply` blocks were walked straight past. Root cause, reproduced in isolation rather
than inferred:

```
$ bash -c 'line="    mig_apply 20260913105000 20260913105000_537_x.sql"
  if [[ "$line" =~ ^\ *mig_apply\ +([0-9]{14})\ +(\S+\.sql) ]]; then echo MATCH; else echo "NO MATCH (rc=$?)"; fi'
NO MATCH (rc=1)
```

`\S` is a GNU regex extension this bash's ERE does not honour, so
`release/lib/apply-release-engine.sh`'s mig_apply branch had **never** been able to match — on LF or
CRLF input alike. The `ledger_insert_only` branch carries no `\S`, which is exactly why those two
blocks, and only those two, ran. The engine's core branch was broken from the day it was written and
no run had exposed it, because until now no run had happened.

### Both halves were fixed, and the second is the one that matters

1. POSIX `[[:space:]]` / `[^[:space:]]` classes, plus a CR strip for the Windows-generated document.
2. **A completeness assertion.** The engine counts the directives in the document *before* running
   anything and compares that against what it executed. A mechanical executor that can silently do
   nothing and still print PASSED is worse than no executor, because a human reads PASSED and stops
   checking. Disagreeing counts are now `VERDICT: STOP`, whatever the individual blocks returned.

### The proving run, against a pristine target (E3)

`prod_rehearsal_e4c` was no longer pristine — the false-pass run had written two ledger rows into it
— so `prod_rehearsal_e4d` was restored from the same dump (identity above) and the document executed
against it. **`-TargetDb` is how production's database name is substituted**; it has no default
precisely so that substitution is always explicit and never guessed.

```
$ .\release\apply-release.ps1 -ReleaseMd release\out\RELEASE-e4b.md -TargetDb prod_rehearsal_e4d `
    -Decided release\config\decided-migrations.txt
Running apply-release engine (bash) against prod_rehearsal_e4d@afrakala-lan-db ...
document declares: 15 mig_apply block(s), 2 ledger-row-only block(s) before Phase 5
--- Preflight ---
pg_is_in_recovery() = f (Expect: f)
...
=== apply 20260913105000_537_revoke_truncate_from_authenticated.sql (version 20260913105000) ===
psql:/tmp/mig_20260913105000.sql:105: NOTICE:  537: TRUNCATE revoked from authenticated on 215 table(s); 13 already closed.
INSERT 0 1
OK 20260913105000_537_revoke_truncate_from_authenticated.sql
...
Block: ledger_insert_only 20260913090000
INSERT 0 1
DECISION GUARD OG-C for 20260822210000: got [0], expected [0]
Block: ledger_insert_only 20260822210000
INSERT 0 1
OK ledger-row-only 20260822210000
--- reached Phase 5 (image transfer). Stopping cleanly -- deploy is a human step. ---

executed: 15 of 15 mig_apply block(s), 2 of 2 ledger-row-only block(s)
=== VERDICT: PASSED (all preflight + migration blocks matched their Expect: lines;
    deploy phase was NOT executed -- run it by hand, this script never touches
    the running afrakala-lan-web container) ===
EXITCODE=0
Log: release\runs\20260913-025450.log
```

### Two independent routes reach one end state

```
prod_rehearsal_e4b : ledger_rows=698 top=20260913111000   (the rehearsal's batched replay)
prod_rehearsal_e4d : ledger_rows=698 top=20260913111000   (RELEASE-e4b.md executed mechanically)
```

And 537 printed `on 215 table(s)` on `e4d` as well — the same number the `Expect:` line carries, now
confirmed on a database that played no part in producing it. That is as close to independent
confirmation of the derived expectation as this host allows.

**The OG-C guard was exercised for real here, and only here.** On `e4b` migration 373 had already
been applied at plan index 3 by the previous run, before the decision file existed, so that path
could not fire; the FINAL classification still reports it as `DECIDED_LEDGER_ONLY` because the
decision file — not what one replay happened to do — is what the release document must instruct, and
the report's own `## Decision exercise record` section says plainly which dispositions this run
exercised and which it inherited. On `e4d` the guard did fire (`got [0], expected [0]`) and the
ledger row was written only after it held.

---

## E4-7a — `release/runs/` gitignored, and what a gitignore cannot do

Nineteen run artefacts were showing as untracked work. They are ignored now. But `.gitignore`
untracks nothing that is already tracked, and five files were:

```
$ git ls-files release/runs/
release/runs/e4b/00-first-attempt-336-guard-failure.md
release/runs/e4b/01-restore.md
release/runs/e4b/02-replay-0001-0008.md
release/runs/e4b/apply_plan.txt
release/runs/e4b/progress.txt
```

Four are stable narrative evidence this document cites by path and they stay. `progress.txt` is a
bare counter rewritten by **every** replay batch — the one file that made the tree dirty after each
checkpoint, which is the noise the rule exists to remove — so it was untracked with
`git rm --cached` (untouched on disk, still read by the replay and gates phases). Recorded in
`.gitignore` itself so the next reader is not surprised.

---

## Pinned versions

Nothing was installed, upgraded or pinned by this run. `package.json` and `package-lock.json` are
unchanged. The only version-like values this work pins live in configuration, and every one is
measured rather than chosen:

| pinned value | where | how it was obtained |
|---|---|---|
| dump md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0` | every report's restore identity | `md5sum` on host and in container, every run |
| ceiling `20260913111000` | derived, not typed | `ls supabase/migrations` + `sed` + `sort` + `tail -1` |
| 537's `215` | `RELEASE-e4b.md` Block 18 | lifted from the replay's own NOTICE |
| OG-C guard `0` | `release/config/decided-migrations.txt` | the same query the Preflight snapshot runs |
| the 5-version og81 exception set | reconciliation, recomputed every run | decided SKIPs plus shape-tolerated, never typed |
| the 6-test gate baseline | `release/runs/e4c/baseline-gate-failures.txt` | re-measured on a pristine restore each run |

---

## Verification owed

| check | result |
|---|---|
| `npx tsc --noEmit` | **70 errors across exactly 6 files — baseline matched, per file** |
| `npm run build` | **skipped, and saying so** — see below |
| e2e suite | not run, per the brief. og81/og102/og103 ran only as the rehearsal's own gates. |

```
$ npx tsc --noEmit          (counted per file)
src/lib/accounting/functions.ts               13      baseline 13   MATCH
src/lib/audit/index.ts                         6      baseline  6   MATCH
src/lib/invoices/functions.ts                 13      baseline 13   MATCH
src/routes/_app.admin.automation.tsx           5      baseline  5   MATCH
src/routes/_app.admin.sales-reminders.tsx     15      baseline 15   MATCH
src/routes/_app.products.index.tsx            18      baseline 18   MATCH
                                              --                --
TOTAL                                         70      baseline 70

$ grep -cE "error TS" docs/verification/convergence/typecheck-integration-70-6.txt
70
```

`npm run build` was skipped because this run's diff contains no application code at all:

```
$ git diff --name-only 0065d54e HEAD | grep -E '^src/|\.tsx?$'
(no matches - release tooling and docs only)

$ git diff --name-only 0065d54e HEAD
.gitignore
docs/missions/convergence/RESUME-E4.md
docs/research/convergence/E-4-proof.md
release/apply-release.ps1
release/config/decided-migrations.txt
release/emit-blocks.ps1
release/lib/apply-release-engine.sh
release/lib/decided-migrations.sh
release/lib/rehearse-engine.sh
release/out/RELEASE-e4b.md
release/out/rehearsal-e4b.md
release/out/rehearsal-e4c.md
release/out/rehearsal-e4d.md
release/rehearse.ps1
release/runs/e4b/progress.txt
```

The `node_modules` trap the previous run documented did **not** recur — the first `npx tsc` of this
run returned 70, not 1985, because that run's `npm ci` left the tree intact. No install was needed
and none was run.

---

## What is UNVERIFIABLE, and what is unexercisable on this host

**Unverifiable — the blind spot, stated plainly.** 403 of 703 candidates (57%) are `UNVERIFIABLE`:
they carry a ledger row and `docs/missions/prodprep/ledger-evidence.sh` returns `NO-EVIDENCE`, so
the catalogue cannot say whether their effect is present and the rehearsal falls back to trusting
the ledger. Function-only, grant-only and data-only migrations all land here. **This is not
hypothetical — migrations 388 and 390 are two of the 403 and both were caught lying in this run**,
by og103 and not by the classifier. "Catalogue over ledger" is only as strong as the catalogue
probes, and for more than half the candidate set there are none.

**Unexercisable on this host:**
- Anything requiring the production laptop. Not one packet was sent to `192.168.170.10`.
- The `SHAPE_TOLERATED` disposition for 336/343 against the real target. The rehearsal proves only
  that their guard aborts on a database not named `afrakala`. Whether production carries the objects
  527/528 re-issue is a human check — which is why those blocks say HUMAN REVIEW REQUIRED.
- A raw og81 PASS. Impossible by design on a target carrying OG-J; the reconciliation is the check.
- The release document's Phase 5 and Phase 6 (image, deploy, rollback, verify). `apply-release.ps1`
  stops cleanly at Phase 5 and this role never runs a deploy command.
- Migration 537 against production's actual table set. 215 is the count on a restore of the
  2026-09-13 dump; if production has gained a table since, the number moves — which is exactly why
  the block carries a derived expectation and a note rather than a hard assertion.

---

## What I did NOT do

- **Did not deploy anything.** No compose command, no image built or pushed, no container started,
  stopped or rebuilt, no browser.
- **Never contacted the production laptop** at `192.168.170.10`.
- **Never wrote to** `afrakala` (read-only measurement only), `postgres`, `prod_rehearsal_base`,
  `_gate`, `_v1`, `_v2`, `_da`, `_fix`, or `prod_rehearsal_20260908`. Only `prod_rehearsal_e4b`,
  `_e4c` and `_e4d`, all three created by E-4.
- **Did not add a ledger row for 449, 450 or 452** — measured above: they are three of the five
  files with no ledger row, and `UNEXPLAINED unrecorded = 0`.
- **Did not edit any migration file, or write a new one.** CLAUDE.md rule 6 holds; the 449/450 fix
  remains a database-role task.
- **Did not modify og81, og102 or og103.** Every gate ran unmodified and its real result is in the
  report.
- **Did not green anything by disabling a step.** Both mechanisms added — decision skips and the
  gate baseline — make the run stricter: an unexplained unrecorded migration and a newly-red test
  are each a hard FAIL that did not exist before, as is a candidate accounting that does not sum,
  an unmeasurable anon census, and an apply-release run that skipped a block.
- **Never read or printed a secret.** `deploy/lan/.env.lan` was never opened. The Issabel token
  appears nowhere. Database passwords come from the container's own environment, never echoed.
- Did not run the e2e suite, did not merge PR #448, and pushed exactly once.

---

## OUT OF SCOPE — still open, and NOT recorded as closed

**The five operational scripts cannot be committed from this machine.** They live in
`C:\AfraKalaServer\get-git-going01lan`, which exists only on the production laptop, and that laptop
is untouchable. The previous run verified their absence here and correctly declined to close the
item; **this run declines as well.** It is an owner task, and blocks (a)-(d) of `RELEASE-e4b.md`
are written for a human to run there.

---

## Gitignored files this run produced or changed ([E-2])

Nothing under `deploy/`. Under `release/runs/` (now gitignored):

- `release/runs/e4b/` — `02-replay-0007-0014.md`, `02-replay-0015-0022.md`, `apply_out_*.txt` (one
  per applied migration), `notices.txt`, `gates.log`, `og81.log`, `og81_*.txt`,
  `post-gate-failures.txt`, `gate-new-failures.txt`, `gate-fixed.txt`, `decision_skipped.txt`,
  `decision_ledger_only.txt`, and `progress.txt` (now untracked, still on disk).
- `release/runs/e4c/` — a full restore state dir plus `baseline-gates.log`,
  **`baseline-gate-failures.txt`** (the file `-BaselineFailures` consumes: the gates phase needs it
  and it is NOT committed) and `00-baseline-gates.md`.
- `release/runs/e4d/` — a full restore state dir; no replay was run against it.
- `release/runs/20260913-024603.log` — the FALSE PASS apply-release log, quoted above.
- `release/runs/20260913-025450.log` — the proving apply-release log.
- `release/runs/tsc-e4.txt` — raw `npx tsc --noEmit` output.
- `node_modules/` — **not touched.** No install of any kind was run.

Three scratch databases are left on the server on purpose: `prod_rehearsal_e4b` (fully replayed,
ledger 698), `prod_rehearsal_e4c` (baseline source; **no longer pristine** — the false-pass run
wrote ledger rows `20260913090000` and `20260822210000` into it) and `prod_rehearsal_e4d` (the
apply-release target, ledger 698).

---

## Recommendations, out of scope — recorded, not acted on

1. **Catalogue probes for grant-only migrations in `docs/missions/prodprep/ledger-evidence.sh`.**
   This is now the highest-value item in the release line. 388 and 390 were caught by a gate, by
   luck of coverage; there are 401 other `UNVERIFIABLE` candidates and nothing is watching them.
2. **Close the anon table-level SELECT on `products`, `categories` and `academy_quiz_questions` on
   production** — a new forward migration, catalogue-driven, in the 523/524 pattern. This release
   does not fix it.
3. Forward migrations for **449** and **450** that derive their assertions from the catalogue. OG-J
   makes this optional rather than blocking, but the files remain unrunnable anywhere.
4. A pre-merge gate that greps new migrations for literal row-count and database-name assertions:
   336, 343, 449, 450 and 477 are five instances of one recurring defect, and og103's own static
   table list is a sixth.
5. `ledger-evidence.sh` hardcodes `supabase_admin`; it needs a user argument if `--db-user` ever
   changes.
6. og102's 17-item exclusion list and og103's `REVOKED_SELECT` / `REVOKED_WRITE` lists are static
   lists generated on the test computer. Six names in og103's lists do not exist on production
   (`keep=11 sel=190 wr=204` expected, `keep=11 sel=184 wr=198` measured) — the OG-J divergence,
   permanent by decision. These gates will fail on production forever until they derive their
   targets at run time.
7. `release/lib/apply-release-engine.sh` shipped with a branch that could never match, and nobody
   noticed because nobody had run it. Every script in this pipeline that has not been exercised
   end-to-end at least once should be assumed to contain one of these.

## Verdict: COMPLETE (for E4-3, E4-4, E4-5, E4-6 and E4-7a)

Every step in scope has a command and its output. The two items deliberately left open — the five
operational scripts, and the fix for 449/450 — are recorded above as open, not as done.
