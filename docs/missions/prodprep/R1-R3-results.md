# R-1 / R-2 / R-3 — the rehearsal database, the lying ledger, and the reconciliation

Run overnight 2026-09-08 on the **test** host `afrakala-lan-db` (`192.168.170.8`).
**Production `192.168.170.10` was never contacted — no HTTP, no psql, no ping, no DNS.**

| row | verdict |
|---|---|
| **R-1** build the rehearsal database | **PARTIAL** — both required discriminators hold, but the baseline differs from live production in ways listed in §6, and one of those differences is large |
| **R-2** reproduce the lying ledger | **COMPLETE** — 569 rows / max `20260827120000`, production's exact shape |
| **R-3** reconciliation that re-runs nothing | **COMPLETE** — proven twice (records the gap, then inserts 0), plus a negative test that the collision guard actually fires |

> **The headline is not in any of those three rows.** While proving the baseline, the rehearsal
> produced hard evidence that **production is missing a whole 29-migration band below its stated
> ceiling** — migrations 336–370, the ledger-documents / dual-document / reversal module. See §5.
> Nothing was done about it; it is reported, not acted on.

---

## 1 · What the rehearsal database is, and where it came from

**`prod_rehearsal_20260908`** on container `afrakala-lan-db`. No earlier `prod_rehearsal_*`
existed, so nothing was dropped (E3: `SELECT datname FROM pg_database WHERE datname LIKE
'prod_rehearsal%'` → `(0 rows)` immediately before `CREATE DATABASE`).

It was **not** built by replaying 612 migrations onto an empty database. It was built from a real
production dump that was already on this host:

```
CREATE DATABASE prod_rehearsal_20260908 TEMPLATE afrakala_prod_clone4;   -- exit 0
```

`afrakala_prod_clone4` is the **pristine restore** of `prod-full-20260831.dump`
(29,725,089 bytes, md5 `41830357199bf4fe743e824fee89f3f5` verified on both sides), taken from
production on **2026-08-31 21:11** and restored on 2026-09-01 by an earlier mission. Provenance
and the md5 chain are recorded at
`D:\AfraKalaTest\wt-prodprep\docs\migration\prod-clone-dryrun-20260831.md` lines 20–48.

That it is the *pristine* one and not a dry-run leftover is measured, not assumed — the same doc
publishes the expected figures and the database matches all four exactly (E4-style
before-comparison):

| | tables | views | functions | policies | `sales_quotes.accepted_at` | ledger |
|---|---|---|---|---|---|---|
| doc's "production, expected" | 221 | 20 | 823 | 622 | absent | — |
| `afrakala_prod_clone4`, measured tonight | **221** | **20** | **823** | **622** | **absent (0)** | 523 / `20260811180000` |

Two other clones on the host (`afrakala_prod_clone`, `afrakala_prod_clone7`) are the *post*-dry-run
states (224 tables, 839 functions, ledger 569). They were read and left untouched.
**`afrakala` — the live test database — was read only, never written.**

## 2 · Reaching production's baseline — and why it is 424 *minus two*

Production runs commit **`469fe0a9`**, whose tree carries **610** migration files. The repo has
**612** at or below `20260904150000_424`. The two missing ones are **420 and 421** (E3):

```
$ git ls-tree -r --name-only 469fe0a9 -- supabase/migrations | wc -l
610
$ git ls-tree -r --name-only 469fe0a9 -- supabase/migrations | grep -E "_(419|420|421|422|423|424)_"
supabase/migrations/20260831210000_419_receivables_due_date_from_settlement_terms.sql
supabase/migrations/20260903160000_422_document_register_view.sql
supabase/migrations/20260904113000_423_purchase_settlement_term_is_mandatory.sql
supabase/migrations/20260904150000_424_bank_account_asan_code.sql
```

420 and 421 are absent from production's own checkout — which is exactly why they are steps 1 and
2 of the runbook. So the baseline target is **every file ≤ 424 in filename order, minus 420 and
421**, and that is what was applied.

### Delivery method (CLAUDE.md rule 1)

`docker cp` was not used. Every file went in over **stdin** and was **md5-verified on both sides
before psql ever saw it**; every apply used `--single-transaction -v ON_ERROR_STOP=1`:

```bash
cat "$L" | docker exec -i afrakala-lan-db sh -c "cat > '$R'"
[ "$(md5sum "$L" | awk '{print $1}')" = "$(docker exec afrakala-lan-db md5sum "$R" | awk '{print $1}')" ] || exit 9
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d prod_rehearsal_20260908 -v ON_ERROR_STOP=1 --single-transaction -f "$RF"'
```

Thirteen files were shipped; **all thirteen md5s matched on both sides.**

**Friction, recorded rather than worked around:** the first run of the apply script failed at file
one with `md5sum: 'C:/Users/AFRA/AppData/Local/Temp/rehearsal_...': No such file or directory`.
MSYS was rewriting the container-side `/tmp` path. `export MSYS_NO_PATHCONV=1` fixed it. No
extension or role friction appeared, because the template copy inherited an already-restored
database — see §6 for what that inheritance *cost*.

### The applies (E3 — command, output and exit code above; summarised here)

| migration | result | note |
|---|---|---|
| 410 backfill_migration_ledger | **ERROR, rolled back** | its own assertion is hard-coded to test's numbers — see §3 |
| 411 credit ranges widened | exit 0 | `UPDATE 1` ×7, `UPDATE 328` — 328 score rows recomputed |
| 412 cooperation hint | exit 0 | |
| 413 salesperson ranges | exit 0 | `UPDATE 20` |
| 414 every person is a customer | exit 0 | `INSERT 0 64`; NOTICE "every one of 832 persons now has a customers row" |
| 415 quote items require a real product | exit 0 | |
| 416 settlement_types write policy | exit 0 | |
| 417 sales_quotes.accepted_at | exit 0 | column + trigger added |
| 418 backfill accepted_at | **ERROR, rolled back** | `418: expected 9 accepted quotes, found 151` |
| 419 receivables due date | exit 0 | |
| *(420, 421 deliberately skipped — not in production's tree)* | | |
| 422 document_register_view | **ERROR, rolled back** | `relation "public.document_numbers" does not exist` |
| 423 purchase settlement term mandatory | exit 0 | |
| 424 bank_account_asan_code | exit 0 | NOTICE "asan_code present, empty string rejected, NULL allowed" |

`--single-transaction` meant each of the three failures rolled back **whole**. Nothing is
half-applied.

### The baseline test — both discriminators hold (E3)

```
$ psql -d prod_rehearsal_20260908 -tAc "SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='bank_accounts' AND column_name='asan_code';"
1                                              <-- bank_accounts.asan_code EXISTS ✅

$ psql -d prod_rehearsal_20260908 -c "\set VERBOSITY verbose" \
     -c "SELECT applied_action FROM public.asan_import_person_rows LIMIT 1;"
ERROR:  42703: column "applied_action" does not exist   <-- ✅ exactly 42703, exit 1
```

## 3 · Two migrations in the window assert numbers that only the TEST database ever had

Both are **runbook-critical** and neither is visible from reading the files casually.

**Migration 410** inserts its 46 versions and then requires the ledger to end at 598 — the number
measured on the test server (552 existing + 45 + itself). Production's baseline holds **523**, so:

```
INSERT 0 46
ERROR:  410: the ledger holds only 569 rows; 598 were expected (552 existing + 45 back-filled + this one)
EXIT=3
```

With `--single-transaction` the INSERT rolls back with it. Yet **production's ledger today shows
569 / `20260827120000` — precisely 523 + 46.** Two readings fit and I cannot separate them without
touching production: either 410 was applied there *without* `ON_ERROR_STOP`/`--single-transaction`
so the INSERT committed and only the assertion complained, or those rows arrived another way. Both
readings agree on the outcome, which is what R-2 needed.

**Migration 418** backfills `accepted_at` and then asserts the count is 9:

```
UPDATE 151
ERROR:  418: expected 9 accepted quotes, found 151 -- the data moved under the migration
```

151 is the production figure (the earlier dry-run doc reports the same 151). So 418's assertion is
a test-database constant. It is *below* the ceiling, so it is not in the runbook's 74 — but if
anyone ever re-runs it against production it will fail the same way.

**Migration 422 cannot run at all** on this baseline: it joins `public.document_numbers`, created
by migration **338**, which production does not have. See §5.

## 4 · R-2 · the lying ledger, reproduced

The rehearsal's ledger inherited the dump's **523 / `20260811180000`**. Production's is
**569 / `20260827120000`**. `docs/missions/prodprep/r2-reproduce-lying-ledger.sql` records exactly
the 46 versions migration 410 carries — **no DDL, no migration re-run** — and asserts production's
numbers rather than 410's test-only 598. E4, both halves:

```
before: 523   20260811180000
        md5 local=bbb33124d54646f6c3a990bc563ad465 remote=bbb33124d54646f6c3a990bc563ad465
        INSERT 0 46
        NOTICE:  R-2: ledger now 569 rows, max 20260827120000 -- production shape reproduced
        EXIT=0
after:  569   20260827120000
```

**What this reproduces and what it does not.** The row **count** and the **max version** now match
production exactly, and the schema is far ahead of the ledger — the defect the runbook's first step
must survive. Whether production's 569 rows are the *same 569 strings* is **UNVERIFIED**: checking
would mean reading production's ledger, which is forbidden. The arithmetic (523 + 46 = 569, max
`20260827120000`) is consistent with it but is not proof.

## 5 · The finding that matters most — production is missing 29 migrations *below* its ceiling

Migration 422 failing with `relation "public.document_numbers" does not exist` was the first
thread. `document_numbers` is created by `20260818152000_338_document_numbers.sql` — well below
424.

`docs/missions/prodprep/ledger-evidence.sh` was written to pull that thread: for each version in
the ledger gap it asks the **live catalogue** whether the tables, columns, types, views and indexes
that migration creates actually exist. Every strong artefact in the band
`20260818150000 … 20260822210000` reads **0**:

```
20260818152000|TABLE|document_numbers|0
20260818155000|COLUMN|journal_entries.doc_kind|0
20260818156000|TABLE|document_attachments|0
20260819100000|COLUMN|payment_vouchers.endorsed_receipt_id|0
20260819130000|TABLE|dual_documents|0
20260819150000|COLUMN|journal_entries.reverses_entry_id|0
20260819150000|COLUMN|payment_receipts.reversed_at|0          (+14 more reversal columns, all 0)
```

**The supersession trap — the thing migration 410's own header warns about — was ruled out
explicitly**, because "absent" and "dropped by a later migration" look identical:

```
$ grep -inE "DROP TABLE( IF EXISTS)? +(public\.)?(document_numbers|document_attachments|dual_documents)" *.sql
(no matches — nothing in 684 migration files ever drops them)

$ psql -d afrakala           -tAc "...relname IN (...)"   ->  document_attachments=1  document_numbers=1  dual_documents=1
$ psql -d prod_rehearsal_... -tAc "...relname IN (...)"   ->  <NONE>
$ journal_entries.doc_kind:  afrakala = 1,  prod_rehearsal_20260908 = 0
```

They exist on test, no migration drops them, and they are absent from the production baseline.
**That is absence, not supersession: migrations 336–370 never ran on production.**

**What this does and does not establish.** It is measured on a **2026-08-31** dump. Production
deployed `469fe0a9` on 2026-09-04, and someone applied 411–424 to it between those dates. If that
same person also applied 336–370, the hole is closed and this finding is stale. **Nothing in the
audit checked** — the audit's ceiling test was only `asan_code` present / `applied_action` absent,
and a database with this hole passes both. **This is the single most important thing for the owner
to check on production before the runbook runs**, with one read-only query:

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('document_numbers','document_attachments','dual_documents');
```

Three rows: the hole is closed, and 422 will apply. Zero rows: production has a 29-migration hole,
**migration 422 will abort**, and the runbook's 74 is not the whole job.

## 6 · How the rehearsal differs from live production — read this before trusting any rehearsal on it

| # | difference | size | consequence |
|---|---|---|---|
| **1** | Data is production's at **2026-08-31**, not today. `persons` 832 (prod today 4851) · `audit_logs` 91,548 (107,713) · `sales_quotes` 170 (256) · `purchases` 2 (10) · `journal_entries` 0 (15) · products active 358 (374). `user_roles` 42 matches. | large | anything counting rows, and any migration asserting a row count, behaves differently. 418 already did. |
| **2** | **Migrations 336–370 absent** (§5) — status on live production **UNKNOWN** | large | 422 aborts here. If production has the same hole, more of the 74 may abort. |
| **3** | **418 rolled back** — `sales_quotes.accepted_at` is entirely NULL here; on production it may be back-filled | medium | anything reading `accepted_at` rehearses against NULLs |
| **4** | **422 not applied** — no `v_documents_unified` | medium | the document register cannot be rehearsed |
| **5** | **`pg_cron` is not installed** and there is no `cron` schema — the extension can only live in a database named `postgres`, and this one deliberately is not | medium | **six of the runbook's migrations touch `cron.*`** (445, 469, 492, 496, 504, and the untracked 520). They cannot be rehearsed here. |
| **6** | `pg_net` also absent (present in `supabase/schema_full_export.sql`'s extension list) | small | anything using `pg_net` cannot be rehearsed |
| **7** | The owner's two **manual** 2026-09-07 fixes are **not** present: `v_promotion_suggestions` and `vw_account_balances` still grant `anon SELECT` here (`has_table_privilege` = `true` for both) | medium | *useful* — R-5 can rehearse the REVOKE. But "no change" on production will not reproduce here. |
| **8** | The owner's manual OCR re-pin is not present either. Migration 460's targets are `public.ai_providers` and `public.ai_usage_routes` (**not** `workflow_settings`, which has no `setting_key`/`setting_value` columns at all). Measured here: `ai_providers` → `gpt` `is_active=t`, `ollama` `is_active=t` — the **pre-fix** state | medium | 460 will actually change rows here, whereas on production it is expected to be a **no-op** (`UPDATE 0`) because the owner already did it by hand. R-5 must not read "no change here" and "no change there" as the same result. |
| **9** | `anon`-SELECT-able tables: **199** here vs **202** measured on production | small | census-style assertions will be off by a few |
| **10** | `pg_default_acl` still carries **9** `anon` entries — V-2 is open here exactly as on production | — | faithful; V-2 can be rehearsed |
| **11** | Database **name** differs (`prod_rehearsal_20260908` vs production's `postgres`) | small | any migration or cron job that hard-codes a database name behaves differently |

**Honest summary: this is an approximate rehearsal, not a replica.** It is faithful on schema
shape, grants, the ledger defect and the migration window; it is a week stale on data and it
cannot execute anything cron-related. Differences 2, 3 and 4 mean three of the fourteen baseline
migrations are in a state the rehearsal *chose* rather than *observed*.

## 7 · R-3 · the reconciliation

`docs/missions/prodprep/ledger-reconcile.sh` — report-only by default, `--record` to write.
It **re-runs no migration**; it writes rows to `supabase_migrations.schema_migrations` and nothing
else. It refuses outright if handed the database name `postgres`.

### Step 1 — "what the schema says is applied" — and exactly how much to trust it

**There is no single source, and the answer is partly hand-maintained. Stated plainly:**

```
candidates = (every migration file whose timestamp <= ceiling)  MINUS  <not-applied-file>
```

The first half is **derived** — a directory listing. The second half is a **hand-maintained list**
(`not-applied-rehearsal.txt`, 33 versions), because nothing in this project stamps the schema with
what ran, and the ledger — the thing being repaired — cannot be its own witness.

`ledger-evidence.sh` exists to *build* that list from evidence rather than memory. It reports
PRESENT / ABSENT / NO-EVIDENCE per version from the live catalogue. **What it cannot see, stated in
its own header and repeated here because it decides how much to trust the result:**

- `CREATE OR REPLACE FUNCTION` — the name existing says nothing about *which* version. Function-only
  migrations come back **NO-EVIDENCE**, never PRESENT.
- `GRANT` / `REVOKE` / `COMMENT` / data-only migrations leave no durable named object at all.
- A migration whose object a **later** migration dropped reads ABSENT although it ran. Migration
  410's header documents six real instances of that trap on this project. §5 rules it out for the
  case that mattered, by hand.

Of the 43 gap versions, only **13** carried a strong artefact; the other 30 were NO-EVIDENCE. The
rule applied to those was **when in doubt, do not record** — under-recording is recoverable by a
later reconciliation, over-recording hides a genuinely missing migration forever. That is why all
29 members of the proven-absent band are excluded, including the GRANT-only ones with no evidence
of their own.

### Steps 2–5, and why the INSERT has no `ON CONFLICT`

The gap is computed **first**, a **plain** `INSERT ... SELECT` writes exactly that gap,
`GET DIAGNOSTICS ... ROW_COUNT` captures what really landed, and the block raises unless
`inserted = gap` **and** `ledger_after = ledger_before + gap`. A collision therefore raises
`unique_violation` and aborts. `ON CONFLICT (version) DO NOTHING` would have exited 0.

### Proof — E4, twice, plus a negative test

**Run 1, against the broken 569-row ledger:**

```
files at/below ceiling . 612
declared NOT applied ... 33   (from docs/missions/prodprep/not-applied-rehearsal.txt)
candidates ............. 579
candidate list md5 ..... 1967833326ee596d74d324c6b76a08f5 (identical both sides)

--- ledger claims ---           569 | 20260424144837 | 20260827120000
--- schema says applied ---     579 | 20260904150000
--- 3a APPLIED BUT UNRECORDED --- gap_rows 10
   20260828000000 20260828010000 20260829000000 20260829120000 20260831090000
   20260831140000 20260831170000 20260831210000 20260904113000 20260904150000
--- 3b RECORDED BUT NOT A CANDIDATE --- orphan_rows 0
NOTICE:  ledger-reconcile: gap=10 inserted=10 ledger 569->579 (asserted)
psql exit code = 0
LEDGER: 569/20260827120000  ->  579/20260904150000
```

Those ten versions are **exactly** the ten migrations that applied cleanly in §2 — the
reconciliation independently rediscovered them.

**Run 2, immediately after, unchanged inputs:**

```
--- 3a APPLIED BUT UNRECORDED --- gap_rows 0
NOTICE:  ledger-reconcile: gap=0 inserted=0 ledger 579->579 (asserted)
psql exit code = 0
LEDGER AFTER RUN 2: 579   20260904150000
```

**Negative test — the guard fires for the reason under test, not an incidental one.** Both halves
in one rolled-back session on the rehearsal:

```
=== A · ON CONFLICT DO NOTHING on a version that is ALREADY THERE (the trap) ===
INSERT 0 0                          <-- no error. This is how 517 nearly went unrecorded.

=== B · the reconcile code path, with a version someone else already owns ===
ERROR:  duplicate key value violates unique constraint "schema_migrations_pkey"
DETAIL:  Key (version)=(20260904150000) already exists.
CONTEXT: SQL statement "INSERT INTO supabase_migrations.schema_migrations (version) SELECT version FROM _gap"

=== ledger untouched by either probe ===  579
```

An earlier revision of the script had a real bug — a `%%` in the `RAISE NOTICE` format string gave
it four arguments for two placeholders, and psql returned `ERROR: too many parameters specified
for RAISE`, exit 3, **ledger unchanged at 569**. It is recorded because it is the best evidence
that the transaction envelope works: a defect anywhere in the assert block leaves the ledger alone.

### Running it against production later

```
ledger-reconcile.sh <db> <migrations-dir> 20260904150000 <not-applied-production.txt>       # report
ledger-reconcile.sh <db> <migrations-dir> 20260904150000 <not-applied-production.txt> --record
```

**`not-applied-rehearsal.txt` must not be reused verbatim on production.** Its Band B entries
(418, 422) describe what *this rehearsal* could not apply, and on production 418 may well have run.
Band A (the 29) and Band C (420, 421) do carry over — Band A only if the §5 query returns zero rows.

## 8 · Consumers of the ledger (path:line)

- `e2e/security/og81-migration-ledger-matches-disk.spec.ts:40` — fails if disk and ledger disagree
  **in either direction**. Note the interaction: it compares against **every** file in
  `supabase/migrations`, with no ceiling. A deliberately under-recorded ledger (§7) is red there by
  design, which is the correct signal — those migrations really are unapplied.
- `e2e/requirements/wave1-a4-purchase-actor-guard.spec.ts:62`
- `e2e/security/og100-purchase-term-is-mandatory.spec.ts:211` — asserts version `20260904113000` (423) is recorded
- `CLAUDE.md` rule 2b — the human procedure this script mechanises

## 9 · What was not verified

- **Production's actual ledger contents** — count and max are reproduced from the audit; the row
  set is unverified and unverifiable without touching production.
- **Whether migrations 336–370 are absent on live production today** (§5). Measured on a 2026-08-31
  dump only. One read-only query settles it.
- **Whether 418 and 422 ran on production.** Unknown.
- **Anything cron-related.** Not installable in this database (§6.5).
- **No `npm`/`tsc`/`build` was run** — this row changed no application code. Typecheck baseline
  (70) untouched by construction: the only files added are two shell scripts, a `.sql`, a `.txt`
  and this `.md`.
- The reconciliation was **never run against `afrakala` or any production database.**

## 10 · Out-of-scope recommendations (recorded, not acted on)

1. **The §5 query belongs at the very top of the runbook**, before migration 420. If production has
   the hole, the plan changes shape.
2. **Migrations 410 and 418 carry test-only constants in their own assertions.** Any future
   migration that asserts an absolute row count should assert a *relation* ("every accepted quote
   has an `accepted_at`") instead. Not a change to make now.
3. **`og81` has no ceiling concept.** Once a legitimately-unapplied migration exists, it can only
   be green by recording a lie. A `known-unapplied.txt` the spec reads would let it stay honest.
4. **The rehearsal database is a week stale.** A fresh production dump would remove differences 1,
   3, 7, 8 and 9 at once, and would settle §5 outright. It needs the owner and a dump; it is not
   something this row could do.
5. `afrakala_prod_clone` … `clone7` (six databases, roughly 100 MB each) are spent dry-run
   artefacts. `clone4` is now load-bearing as this rehearsal's template and must be kept.

---

## 11 · The state R-4 / R-5 inherit, and how to rewind it

`prod_rehearsal_20260908` is left **reconciled**: ledger **579 / `20260904150000`**. That is
deliberate — the runbook's first real step is the reconciliation, so this is the state every later
step starts from.

To put the lying ledger back (to re-rehearse step 1, or to test a change to the script), delete
the ten rows R-3 added and nothing else:

```sql
BEGIN;
DELETE FROM supabase_migrations.schema_migrations WHERE version > '20260827120000';
SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;  -- expect 569 / 20260827120000
COMMIT;
```

To rebuild the whole rehearsal from scratch, drop it and re-run §1's `CREATE DATABASE … TEMPLATE
afrakala_prod_clone4`, then the §2 applies and `r2-reproduce-lying-ledger.sql`.
**`afrakala_prod_clone4` must not be dropped** — it is the only pristine copy of the production
dump on this host.

## Housekeeping

- Worktree `D:\AfraKalaTest\wt-prodprep`, branch `feature/prodprep-20260908`.
- `git status --porcelain` at **start**: `?? docs/missions/prodprep/` only. HEAD `9c113aac`.
- `git status --porcelain` at **end**: this row's five files, plus
  `?? supabase/migrations/20260908030000_520_...` and `?? ...20260908034500_521_...` — **another
  agent's untracked work, not touched and not committed.**
- **HEAD moved during the mission**, `9c113aac` → `da057ec7`, via two `docs(prodprep)` commits from
  the orchestrator. Expected coordination in a shared worktree, recorded per the shared-tree rule.
- No `git stash`, no push, no merge, no rebase, no force, no reset.
- Files written outside the repo: none except scratchpad temporaries and container `/tmp` files
  (`/tmp/rehearsal_*.sql`, `/tmp/r2.sql`, `/tmp/neg.sql`, `/tmp/disk612.txt`,
  `/tmp/ledger_evidence.sql`, `/tmp/ledger_reconcile.sql`, `/tmp/reconcile_candidates.txt`).
- Databases written: **`prod_rehearsal_20260908` only.** `afrakala` and every `afrakala_prod_clone*`
  were read-only.
