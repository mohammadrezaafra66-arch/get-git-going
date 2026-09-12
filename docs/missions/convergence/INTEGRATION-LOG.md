# Stage 2 — integration log

Branch `feature/conv-integration`, worktree `D:\AfraKalaTest\wt-conv-int`.
One section per numbered step. A step is written here only after it is **proven**, with the
command that proves it. Checkpoint = local commit after each step; push at phase end.

---

## Step 1 — branch and merge · DONE

Branched from `origin/staging` = `ad0138df` (= `origin/main`; both were fast-forwarded after the
2026-09-12 production run).

Merged `--no-ff` in the briefed dependency order, **E-4 excluded**:

| order | branch | PR | head | result |
|---|---|---|---|---|
| 1 | `feature/conv-migrations` (E-1) | **#444** | `da281f72` | clean, 0 conflicts |
| 2 | `feature/conv-db-fixes` (E-2) | #441 | `b77622f6` | clean, 0 conflicts |
| 3 | `feature/conv-ops` (E-5) | #445 | `e8a1676f` | clean, 0 conflicts |
| 4 | `feature/conv-security` (E-6) | #442 | `6f3b8422` | clean, 0 conflicts |
| 5 | `feature/conv-frontend` (E-3) | #443 | `e267a054` | clean, 0 conflicts |
| 6 | `feature/conv-orchestrator-state` | none | `72235109` | clean, 0 conflicts — **added by the orchestrator, see below** |

Integration head after step 1: `09499234`.

### Two things the brief did not say, both re-measured rather than assumed

**1. E-1 does have an open PR — #444.** `STATE.md` and `RESUME.md` both record E-1 as "no PR /
pushed `da281f72`". `gh pr list` shows **#444 `feature/conv-migrations -> staging`, MERGEABLE**,
head `da281f72` — the same commit. Only the PR row was stale; nothing about the code changed.

**2. `feature/conv-orchestrator-state` was merged as a sixth branch.** It was not on the briefed
list. It is docs-only — `STATE.md`, `RESUME.md`, `MIGRATION-LEDGER.md` and the five R-1…R-5 Stage 0
reports — with **zero file overlap** against the other five (verified with `comm -12` over the two
name lists). Without it the mission's own memory never reaches `staging` and this log has no
directory to live in. Called out here because it is an addition to the instruction, not a silent
one.

### Why no conflict was possible

The five execution partitions share **zero files**. Verified per branch *before* merging:

```
git diff --name-only ad0138df origin/<branch>
```

21 files across the five, each touched by exactly one branch. The merge output confirms
`conflicts=0` at every step (`git ls-files -u | wc -l`).

### `routeTree.gen.ts` was not regenerated, and must not be

```
git diff --name-only ad0138df HEAD -- src/routeTree.gen.ts   ->   0 lines
```

E-3 modified four existing route files (`_app.accounting.payables.tsx`, `_app.dashboard.tsx`,
`_app.pricing.index.tsx`, `sitemap[.]xml.ts`) and added none, so the generated route tree is
unchanged by construction. Regenerating it would have produced a diff with no cause.

### Eleven migrations enter the gate

`526 527 528` (E-1) · `530 531 532` (E-2) · `533 534` (E-5) · `535 536` (E-6).
**529 was reserved and not used** — the gap is intentional and is recorded in `MIGRATION-LEDGER.md`.

---

## Step 2 — fresh `prod_rehearsal_gate`, restored and proven to be production · DONE

The gate database that carried the 526 idempotency proof was **dropped and rebuilt from the dump**,
so nothing in this stage inherits state from Stage 1.

```
psql -U supabase_admin -d postgres -c "DROP DATABASE IF EXISTS prod_rehearsal_gate;"
                                   -c "CREATE DATABASE prod_rehearsal_gate OWNER supabase_admin;"
PGPASSWORD=... pg_restore -U supabase_admin -d prod_rehearsal_gate \
                          --no-owner --disable-triggers /tmp/prod13.dump
```

**Dump identity re-measured, not taken from memory:**
`md5sum /tmp/prod13.dump` -> `6ccd2dbb07a9a4d9bbae4421eb3265e0`, 35,424,962 bytes, byte-identical
to `D:\AfraKalaTest\dumps\prod-20260913.dump` on the host.

**`pg_restore` exit 1 with exactly 21 errors — the expected outcome, and every one accounted for:**

| count | error |
|---|---|
| 17 | `schema "cron" does not exist` |
| 1 | `extension "pg_cron" does not exist` |
| 1 | `can only create extension in database postgres` |
| 1 | `relation "decrypted_secrets" already exists` |
| 1 | `function "secrets_encrypt_secret_secret" already exists with same argument types` |

All pg_cron / vault, all in the allowlist R-2 and R-4 established. **Data-load errors: zero.**

### The ledger proof the brief required

```
ledger_rows  681
ledger_top   20260912150000          <- migration 525, production's top after the 09-12 run
last five    20260912150000 · 20260912143000 · 20260912140000 · 20260908120000 · 20260908034500
```

```
select version from supabase_migrations.schema_migrations where version >= '20260913000000';
(0 rows)
```

**None of 526-536 is present.** The gate starts from production's real shape, not from a shape that
has already seen this mission's work.

### Baseline census — the "before" half of every before/after in this stage

| measure | value |
|---|---|
| tables (`relkind='r'`, public) | **227** |
| views + matviews (`relkind IN ('v','m')`, public) | **24** |
| functions (public) | **859** |
| RLS policies (public) | **645** |
| `persons` rows | 4,857 |
| `audit_logs` rows | 112,696 |
| **anon-reachable relations** | **20** — 13 tables + 7 views |
| functions `anon` may EXECUTE | 544 |
| functions `authenticated` may EXECUTE | 806 |
| `SECURITY DEFINER` functions (public) | 446 |
| views **without** `security_invoker` | 13 |

The anon figure of **20** independently confirms that 523/524/525 did land on production: the
pre-523 measurement was 214 and the post-525 target was 20. This is the first time that number has
been read back off a fresh restore of the post-run dump.

---

## Step 3 — apply the ten migrations under the `mig_apply` contract · DONE, with three findings

`mig_apply` was rebuilt from the contract rather than reused from memory: stdin delivery (never
`docker cp`), **md5 compared on both sides**, `psql --no-psqlrc -v ON_ERROR_STOP=1
--single-transaction -f`, then the ledger `INSERT` **without** `ON CONFLICT`, so that anything but
`INSERT 0 1` is a stop.

```
OK  ..._526_catalogue_repair_absent_migration_effects.sql   md5=b997ce7fb3ed  ledger=INSERT 0 1
OK  ..._527_drop_dead_receipt_posting_path_no_guard.sql     md5=1183f08466fe  ledger=INSERT 0 1
OK  ..._528_posted_entry_immutability_no_guard.sql          md5=b806a1fd1f1e  ledger=INSERT 0 1
OK  ..._530_overdue_sensor_covers_unknown_due_date.sql      md5=618a0873816e  ledger=INSERT 0 1
OK  ..._531_audit_logs_actor_fk_set_null_on_delete.sql      md5=47a8b2d18304  ledger=INSERT 0 1
OK  ..._532_drop_duplicate_signup_trigger.sql               md5=e012d60e442d  ledger=INSERT 0 1
OK  ..._533_pg_cron_http_scheduler.sql                      md5=610c55e02d94  ledger=INSERT 0 1
OK  ..._534_cron_run_log.sql                                md5=6b30be2e620d  ledger=INSERT 0 1
OK  ..._535_security3_s5_function_fixes.sql                 md5=5a8d88357a2d  ledger=INSERT 0 1
OK  ..._536_ai_providers_updated_by.sql                     md5=3a1e4b5d18ea  ledger=INSERT 0 1
```

Ledger **681 -> 691**, top `20260913104000`. Ten applied, ten recorded, no gaps.

### G-1 (red) — 535 and 536 recorded their own ledger rows. Fixed here.

The **first** run of the contract stopped dead at 535:

```
ERROR:  duplicate key value violates unique constraint "schema_migrations_pkey"
DETAIL:  Key (version)=(20260913103000) already exists.
```

Cause, found in the files themselves rather than inferred — both 535 and 536 ended with:

```sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260913103000')
ON CONFLICT (version) DO NOTHING;
```

**Why this had to be fixed rather than tolerated.** The ledger `INSERT` is the operator's step
(`CLAUDE.md` rule 2b) and `INSERT 0 1` is the *only* evidence that a migration is newly recorded.
A migration that records itself turns that evidence into a duplicate-key `ERROR` — and on the
owner-typed production run an `ERROR` on screen is a stop condition, so the owner would be stopping
on a migration that had in fact succeeded. `ON CONFLICT DO NOTHING` also silently masks a re-run,
so the ledger stops being proof of a single application.

**Why the gate edited the files instead of sending them back to E-6.** The precedent set for 531
was "back to the author, not forward to the gate" — but that was a migration that could *abort on
production shape*, a correctness risk needing a fresh rehearsal. This is a three-line deletion with
**zero schema effect**, and E-6 is no longer resumable (verified: `ListAgents` shows no in-process
Stage 1 subagents). `CLAUDE.md` rule 6 ("never edit an existing migration file") was checked
against its purpose — a migration must not change after it has been applied anywhere real — and
these had been applied nowhere:

```
afrakala   -> versions >= 20260913000000 : (none)    686 rows, top 20260908034500
origin/staging, origin/main               : 0 files matching 20260913*
```

Only the scratch `prod_rehearsal_gate`, which was then dropped and rebuilt. E-6 had itself edited
536 once before, for the same class of defect (a `BEGIN;...COMMIT;` conflicting with
`--single-transaction`).

Each file now carries a comment where the `INSERT` was, naming this finding, so the next reader
does not put it back. **V-1 is to verify this edit independently.**

### G-2 (amber) — 533's production branch cannot be exercised anywhere but production

533 is guarded by `IF current_database() = 'postgres'`, because pg_cron refuses
`CREATE EXTENSION` outside the database that `cron.database_name` names. On the production laptop
the app database *is* `postgres`, so the extension and the eight job rows are created there. On
this host no rehearsal database can be named `postgres` — that name belongs to the LAN stack's own
database — so **the gate exercised only the false branch**: the wrapper procedures and their
REVOKEs were created; the extension and job DDL were not.

This is a limitation of the host, not a defect in the file, and E-5 recorded it in 533's own
header. It has one consequence for Stage 3: the release block that applies 533 must be preceded by
a pg_cron pre-flight **typed on production** (extension availability, `cron.timezone`, the `http`
shared object), because that is the first and only place this branch will ever run.

Not a finding against the migration: the six `COMMIT;` statements in 533 are inside
`CREATE OR REPLACE PROCEDURE ... $fn$ ... $fn$` bodies (lines 172-235, 314-434). They are string
literals at apply time and cannot conflict with `--single-transaction`; they are required because
pg_cron calls a procedure outside a transaction. Checked because 536 had shipped that exact defect
once.

### Idempotency — the whole set, twice, on the same database

All ten re-applied to the already-migrated database:

```
pass 2: OK on all ten (md5 re-verified each time)
S1 vs S2 : IDENTICAL across 15,518 lines — 0 differences
```

The snapshot compares relations, **view definitions**, columns, column defaults, function bodies
(`md5(pg_get_functiondef)`), policies (`qual` and `with_check`), constraints, triggers, table
grants, per-function `anon`/`authenticated` EXECUTE, and indexes.

> **The snapshot tool had to be fixed mid-step, and that matters.** Its first version compared
> views only by `reloptions`. It therefore reported "identical" while 526 was in fact rewriting two
> view *bodies* — a false pass on exactly the class of change this gate exists to catch. It was
> found because 526's own output said it had redefined `vw_account_balances` while the diff showed
> nothing. `pg_get_viewdef` was added, **both databases were rebuilt from the dump, and the entire
> proof was re-run**; every number above is from the second, corrected run.

### What the ten actually changed — S0 (production shape) vs S1

| measure | before | after |
|---|---|---|
| ledger rows | 681 | **691** |
| tables | 227 | **228** (`cron_run_log`) |
| **views + matviews** | **24** | **24 — none added, none dropped** |
| functions | 859 | 862 |
| RLS policies | 645 | 646 |
| `SECURITY DEFINER` functions | 446 | 444 |
| **anon-reachable relations** | **20** | **20 — no new anon exposure** |
| functions `anon` may EXECUTE | 544 | **541** |
| `persons` / `audit_logs` rows | 4,857 / 112,696 | **4,857 / 112,696 — unchanged** |

Every one of the 88 changed snapshot lines maps to a named migration:

- **526** — `security_invoker=true` on `product_computed_prices_public`; view bodies of
  `v_promotion_suggestions` and `vw_account_balances` rewritten to restore the `uid() IS NOT NULL`
  guard; `create_purchase`, `get_payables_list`, `upsert_staff_daily_performance_metric` and the
  two `sdpm_*` policies moved from `CURRENT_DATE` to `tehran_today()`;
  `asan_list_bank_deposit_export` redefined; the stale `expire_stale_credit_holds(integer)`
  overload dropped.
- **527** — `post_receipt_journal(uuid)` dropped.
- **528** — `tg_journal_entry_immutable` / `tg_journal_line_immutable` and their triggers on
  `journal_entries` and `journal_lines`.
- **530** — `can_issue_customer_invoice` body.
- **531** — `audit_logs_actor_id_fkey` gains `ON DELETE SET NULL`.
- **532** — `on_auth_user_created_afrakala` removed from `auth.users`; **one** signup trigger
  remains (`on_auth_user_created`). Confirmed by direct comparison of `pg_trigger` on `auth.users`
  between the two databases — this change lives outside `public` and the snapshot would have
  missed it.
- **533** — `run_issabel_import` and `generate_birthday_notifications_worker` procedures only
  (see G-2).
- **534** — `cron_run_log` plus its sequence, PK, status CHECK, `idx_cron_run_log_job_started`,
  RLS enabled, and one policy `cron_run_log_admin_manager_read` (SELECT, admin/manager).
- **535** — `delete_bot_api_key_secure`, `admin_upsert_ai_provider`, `admin_delete_ai_provider`
  bodies; `anon` EXECUTE revoked on `asan_list_bank_deposit_export`.
- **536** — `ai_providers.updated_by`, `set_ai_providers_updated_by`,
  `trg_ai_providers_set_updated_by`.

**526 fired all nine of its branches on the real production shape** — taken from its own output,
which is the cleanest available evidence that the nine objects had genuinely drifted:

```
526: [386a] set security_invoker=true on product_computed_prices_public (was unset)
526: [386b] redefined v_promotion_suggestions -- restored security_invoker=true and the uid() guard
526: [386c] redefined vw_account_balances -- restored the uid() IS NOT NULL guard
526: [394]  redefined create_purchase -- restored the tehran_today() future-date comparison
526: [396a] redefined get_payables_list -- restored the tehran_today() due-date comparison
526: [396b] redefined upsert_staff_daily_performance_metric -- restored the tehran_today() comparisons
526: [396c] restored tehran_today() on sdpm_insert_privileged / sdpm_update_privileged
526: [404]  dropped and redefined asan_list_bank_deposit_export -- restored the payment-vouchers branch
526: [409]  dropped the stale expire_stale_credit_holds(integer) overload
```

This settles a question the mission memory left open: `STATE.md` records that 526 repairs **nine**
objects rather than the seven originally scoped. All nine fired, so all nine had drifted.

The 409 drop is guarded: 526 scans every other function's source for a call to
`expire_stale_credit_holds(` and **raises rather than drops** if it finds one. On this shape it
found none.

### G-3 (orange) — a pre-existing exposure, measured not alleged, for HANDOFF

`cron_run_log`'s grants give `authenticated` `SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
REFERENCES, TRIGGER`. RLS is enabled with a single SELECT policy, so reads and writes are
governed — **but `TRUNCATE` is not subject to RLS**, so any authenticated user could wipe the cron
audit trail. Before concluding that 534 introduced this, it was measured against production's own
shape:

```
tables in public                      227
authenticated already has TRUNCATE    214
```

So it is the database's **pre-existing cluster-wide default**, inherited by every new table
including this one. 534 did not create it, and fixing it inside 534 would fix 1 case out of 215.
Recorded as a HANDOFF item: one global `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM
authenticated` plus the matching `ALTER DEFAULT PRIVILEGES` — its own migration and its own
decision, not this mission's.

### The convergence gap this step made visible

The three ledgers, compared directly rather than assumed:

```
prod (dump)          681 rows, top 20260912150000
afrakala (test DB)   686 rows, top 20260908034500
disk (integration)   700 migration files
```

**Exactly nine migrations are applied on test and on disk but absent from production**, and every
one is a file that exists:

| version | file | disposition |
|---|---|---|
| `20260818150000` | 336 drop dead receipt posting path | **covered** — E-1's 527 is its guard-free re-issue |
| `20260818157000` | 343 posted entry immutability | **covered** — E-1's 528 |
| `20260822210000` | 373 close anon default privileges | **DECIDED (OG-C)** — ledger row only, never re-run, and only after `anon_default_acl = 0` is checked |
| `20260828000000` | 411 customer credit ranges widened | owner APPROVED (OG-A) — ships as-is in its own release block |
| `20260828010000` | 412 cooperation hint matches widened range | same block as 411 |
| `20260829000000` | 413 salesperson scoring ranges widened | same block as 411 |
| `20260905171000` | 449 retire daily capital functions | **ACCEPTED DIVERGENCE (OG-J)** — permanently skipped, **no ledger row** |
| `20260905171500` | 450 retire superseded tables | **ACCEPTED DIVERGENCE (OG-J)** — permanently skipped, **no ledger row** |
| `20260905180000` | 452 retire parameter weight backups by rename | **ACCEPTED DIVERGENCE (OG-J)** — permanently skipped, **no ledger row** |

> **OG-J is a decision, not a gap, and the reason is the most expensive lesson in this mission.**
> Nothing performed 449/450/452's work on production, so recording a ledger row for them would be a
> false statement about the schema — exactly what `og81` exists to catch. They are skipped without
> a row, permanently. The consequence is that **six `zz_retired_*` table names differ between test
> and production forever**, plus `payment_receipts_backup_20260722`, which 450 dropped on test and
> which production still has. That divergence is precisely what made migration 477 — a static list
> generated from the test catalogue — abort on production on 2026-09-12 and need re-issuing as 523
> and 524. The rule it leaves behind, now with three instances behind it: **a migration whose
> target set is a list of names generated on one database cannot be applied to the other. Derive at
> run time, or do not ship it.**

And **four** run in the other direction — applied on production, absent from test:
`20260908120000` (522), `20260912140000` (523), `20260912143000` (524), `20260912150000` (525) —
the four written during the 09-12 production run and never replayed onto `afrakala`.

Two consequences, both acted on later in this stage:

1. **The test database is behind production on anon grants.** Any e2e spec that measures anon
   exposure against `afrakala` is measuring a pre-523 shape. Step 5 must say so rather than read
   the result as a pass.
2. **Convergence is not complete when this branch merges.** Nine migrations still separate
   production from the tree, four of them (373, 449, 450, 452) with no decision recorded anywhere.
   That list belongs in Stage 3, and it is written here so it cannot be forgotten again.

---

## Step 4 — og81 / og102 / og103 and the view census · DONE, and the result is 8 red

Run twice, against two databases restored from the same dump, so that every failure could be
attributed rather than argued about:

| run | database | migrations applied |
|---|---|---|
| baseline | `prod_rehearsal_base` | **none** — production's shape exactly |
| after | `prod_rehearsal_gate` | **all ten** |

```
E2E_DB_CONTAINER=afrakala-lan-db  E2E_DB_USER=postgres  E2E_DB_NAME=<db> \
npx playwright test --project=chromium-admin \
  e2e/security/og81-migration-ledger-matches-disk.spec.ts \
  e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts \
  e2e/security/og103-anon-table-grants-stay-closed.spec.ts
```

```
baseline : 8 failed, 11 passed  (19 of 19 ran, 0 skipped, 0 did-not-run)
after    : 8 failed, 11 passed  (19 of 19 ran, 0 skipped, 0 did-not-run)
```

**The same eight titles fail in both runs.** The ten migrations do not turn any of these gates red;
every one was already red against production's own shape. That is stated on the strength of a
line-by-line diff of the two run logs, not on the strength of the counts matching — and the diff
shows the ten moving **three** numbers, all in the safe direction:

| gate | baseline | after | cause |
|---|---|---|---|
| og102 — functions anon may execute outside the 17 exclusions | 39 | **36** | `asan_list_bank_deposit_export` revoked by 535; `expire_stale_credit_holds` dropped by 526; `post_receipt_journal` dropped by 527 |
| og81 — applied-but-unrecorded | 19 | **9** | the ten got their ledger rows |
| og81 — disk vs ledger | 700 vs 681 | 700 vs **691** | same |

Nothing else in either log differs. The ten only close things; they open nothing.

> Worth naming plainly, because the mission's own memory records the opposite lesson from og61:
> "prior state unmeasured" is what made those eight failures unarguable for a whole day. Here the
> prior state was measured first, on a database restored from the same dump minutes earlier, and
> the attribution took one diff.

### View census

`relkind IN ('v','m')` in `public`: **24 before, 24 after.** No view added, none dropped. Two view
*bodies* were rewritten — `v_promotion_suggestions` and `vw_account_balances`, both by 526
restoring the `uid() IS NOT NULL` guard — caught by comparing `md5(pg_get_viewdef())`, which the
first version of the snapshot tool did not do (see Step 3).

### The eight failures, each attributed

**og81 (2) — the convergence gap, already itemised in Step 3.**
`disk 700 vs ledger 691`; the nine unrecorded are 336, 343, 373, 411, 412, 413, 449, 450, 452.
Not a defect in this branch. It is the remaining distance between production and the tree, and it
is a Stage 3 decision.

**og102 (2) — production never received migration 476's effect, and this is the largest single
security finding of the gate.**

1. *"no NEW function in public is born anon-executable"* — **36 application functions in `public`
   are executable by `anon` on production** and are not among the 17 documented exclusions. The
   list includes `create_payment`, `create_receipt`, `create_dual_document`, `get_customer_credit`,
   `get_receivable_detail`, `bot_authenticate_key`, `refresh_sale_list_prices` and 31 others. 476
   revoked 142 such functions — but 476 was derived from the **test** database's catalogue in
   September, and production's catalogue is not the same catalogue. This is the identical failure
   mode as 477, which aborted on production on 09-12 and had to be re-issued as 523/524: a static
   list, generated on one shape, applied to another.

   **This wants a 524-shaped successor** — catalogue-driven, revoking `anon` EXECUTE from every
   `public` function that is not an extension function, not a trigger function, and not one of the
   17 exclusions, with the `MUST_STAY_OPEN` set derived at run time rather than listed. It is not
   in this mission's reserved range and it is not written. Recorded here as the gate's
   recommendation, for the owner to schedule.

2. *"the 17 deliberate exclusions stay reachable by anon"* — one exclusion,
   `dyn_table_role_can_view(uuid, text, jsonb)`, is **not** anon-executable on production. The
   spec's warning is that closing an exclusion makes the RLS policy referencing it raise 42501 and
   takes the public sale-list page and product feed down. **Measured, it does not:**

   ```
   policies referencing dyn_table_role_can_view :
       dynamic_tables        dyn_tables_view_by_access_level
       dynamic_table_rows    dyn_rows_view_by_access_level
       dynamic_table_columns dyn_cols_view_by_access_level
       dynamic_table_cells   dyn_cells_view_by_access_level
   of those, readable by anon on production        : none
   ```

   All four live on `dynamic_table*`, and none of the four is among the twenty relations `anon` can
   read. No anonymous query will ever evaluate those policies, so the missing EXECUTE cannot raise
   42501 for an anonymous caller. **Not a live outage.** Checked rather than assumed, because the
   spec's own header says this is the failure that took a credentialed API down once before.

**og103 (4) — production's anon table grants are close to the design but not equal to it.**

The twenty relations `anon` can read on production are 13 tables + 7 views:

```
r: academy_quiz_questions, brands, categories, currencies, league_settings, payment_terms,
   presence_logs, pricing_recompute_queue, product_images, products, profile_field_definitions,
   purchase_prices, sale_price_types
v: academy_quiz_questions_public, effective_currencies_view, employee_monthly_hours,
   v_latest_active_purchase_prices, v_league_tiers_public, v_pricing_recompute_queue_summary,
   vw_purchase_float
```

1. *"anon reads exactly the eleven and nothing else"* — thirteen, not eleven. The two extra are
   **`products` and `categories`**, and both hold a **table-level** SELECT grant. og103's design
   is that the public product feed reaches them through **column-level** grants only, so that
   adding a column does not silently publish it.
2. *"the column-level SELECT grants that keep the public product feed alive are intact"* — fails
   for the same reason, from the other side.
3. *"the baseline is still exactly the two known pairs"* — same root cause.
4. *"the target lists still resolve to real tables"* — the gate names tables that **do not exist
   under that name on production**. That is 450 and 452, two of the nine unapplied migrations:
   they retire and rename tables on test that production still carries under their original names.
   This failure will clear itself the moment the nine are resolved.

None of the four is caused by this branch, and all four are identical in the baseline run.

### What this step does and does not license

It does **not** say the eight failures are acceptable. Three of them (og103 1-3) describe a real
over-grant on production, and og102's 36 functions describe a larger one. What it says is narrower
and is the only thing the gate is entitled to conclude: **the eleven migrations in this branch are
not their cause, and applying this branch does not make any of them worse.** Every number moved by
the ten moved toward closed.

---

## Step 5 — scoped e2e, and `validate-role-sessions` from the same hour · DONE

### `validate-role-sessions` — 5 passed, 0 failed, 0 did-not-run, at 22:24

```
✓ all required storageState files exist
✓ accountant: authenticated, role label, route access
✓ salesperson-a: authenticated, role label, route access
✓ salesperson-b: authenticated, role label, route access
✓ salesperson-a and salesperson-b are distinct users
```

Getting there cost two things that must be recorded rather than smoothed over.

**🔴 I destroyed the existing session artifacts.** `generate-role-sessions.spec.ts` begins by
`unlinkSync`-ing all six `e2e/auth/*.storage.json` files and only then tries to rebuild them.
Its first run failed after the delete, so the six were gone from both worktrees — I had copied
them into the integration worktree earlier and then ran the generator there too, destroying the
copy as well as the original. They are gitignored, regenerable session artifacts and all six were
rebuilt, so nothing is lost; but "take a copy first" is not a safeguard if the copy lives where
the destructive step will also run.

**🟠 Kong's published port 9000 was dead from the host, and `docker restart afrakala-lan-kong`
fixed it.** The generator could not reach the Auth Admin API:

```
before:  curl http://192.168.170.8:9000/auth/v1/health   ->  http=000
inside:  wget http://kong:8000/auth/v1/health            ->  {"name":"GoTrue",...}
after docker restart afrakala-lan-kong:
         curl http://192.168.170.8:9000/auth/v1/health   ->  http=200
```

Healthy inside the Docker network, unreachable through the published port — **the same stale
port-proxy failure as `:3100` earlier in this mission, on a different container, with the same
one-line fix.** Twice now on this host. It belongs in HANDOFF as a recurring Docker Desktop fault,
not as a one-off. (`http=000` on `/` is not the same thing and is not a fault: Kong has no route
for `/` and closes the connection.)

The generator also needs `E2E_AUTH_BASE_URL=http://192.168.170.8:9000`, because
`deploy/lan/.env.lan` points `VITE_SUPABASE_URL` at `https://api.test.myafrakala.ir`, whose TLS
handshake fails (OG-82). The spec's own header documents that override; it is not a workaround I
invented.

### Scoping — which specs can actually measure the gate database

Not every e2e spec is parameterised, and running one against a database it does not read would
have produced a number that looks like evidence and is not. The three helpers differ:

| helper | reads `E2E_DB_NAME` | what it actually touches |
|---|---|---|
| `e2e/helpers/db.ts` | **yes** | the named database, read-only (`assertReadOnlySql`) |
| `e2e/helpers/tx.ts` | **yes** | the named database, inside `BEGIN … ROLLBACK` |
| `e2e/helpers/pgrest.ts` | **no** | mints a JWT and goes through Kong to **`afrakala`**, always |

So the scoped set is the **16** spec files that use `db.ts` and/or `tx.ts` and no browser page.
Specs importing `pgrest.ts` were excluded from the gate comparison **because their result would
describe the live test stack, not the shape under test** — they are picked up after the deploy in
Step 6 instead.

### The result: 6 fixed, 0 regressed

Same two-database technique as Step 4 — `prod_rehearsal_base` (production shape, none of the ten)
against `prod_rehearsal_gate` (all ten):

```
baseline : 27 failed · 63 passed · 1 skipped · 0 did-not-run
after    : 21 failed · 69 passed · 1 skipped · 0 did-not-run
```

Six titles move from red to green, and **nothing moves the other way**:

| spec | test | migration that fixes it |
|---|---|---|
| `og64-tehran-today-bucketing` | no function, view or policy in the converted set still asks UTC | **526** |
| `og64-tehran-today-bucketing` | the RLS policy moved WITH the function it guards | **526** |
| `e2-signup-audit-and-actor-delete` | `auth.users` carries exactly one signup trigger after 532 | **532** |
| `e2-signup-audit-and-actor-delete` | a signup writes exactly one `user_registered` audit row | **532** |
| `e2-signup-audit-and-actor-delete` | deleting a user with audit history succeeds after 531 | **531** |
| `e2-signup-audit-and-actor-delete` | the audit row survives the delete with `actor_id` nulled | **531** |

E-2's spec on its own is the cleanest single result in this stage: **4 failed on production shape,
4 passed after the ten.** It fails without the migrations and passes with them, which is the
property a regression test is supposed to have and is not automatic — a spec that passes on both
shapes proves nothing.

**A privilege artifact had to be cleared first, and it was masking that result.** On the first run
all four E-2 tests failed with `ERROR: permission denied for table users` on *both* databases. The
cause is the restore, not the migrations:

```
afrakala             auth.users owned by supabase_auth_admin   customers owned by postgres
prod_rehearsal_gate  auth.users owned by supabase_admin        customers owned by supabase_admin
```

`pg_restore --no-owner` run as `supabase_admin` makes `supabase_admin` own everything, so the
`postgres` role the helpers connect as cannot read `auth.users`. Cleared with per-database
`GRANT ALL ON ALL TABLES IN SCHEMA auth, public TO postgres` **on the two scratch databases only** —
object grants, not role membership, so `afrakala` and `postgres` are untouched. Worth knowing for
the release line: **any rehearsal restored this way needs that grant before the e2e helpers can
read it**, and without it a spec fails for a reason that has nothing to do with the migration
under test.

### The 21 that stay red, each attributed

None is caused by this branch; all 21 are red on production's own shape.

| spec | n | what it is |
|---|---|---|
| `og72-receipt-ocr-runs-locally` | 4 | *"`receipt_ocr.vision` is pinned to a provider that does NOT declare the vision capability"* — **this is migration 522's deliberate choice**, taken during the 09-12 run because production's ollama declares only `{chat, embeddings}`. The real fact underneath is the known one: **OCR is dark on production**, because neither compose tree defines `OLLAMA_*`. Already a HANDOFF item. |
| `og85-ocr-amount-arithmetic` | 2 | same root cause — no vision provider resolves. |
| `rule12-no-gate-creates-posted-documents` | 3 | pins specific receipt rows (*"OG-76's receipt is no longer marked reversed"*, *"a known-stuck receipt disappeared"*) that exist in the test database's data and not in production's. Data-shape, not schema. |
| `og78-default-privilege-restores-are-derived` | 3 | production's `pg_default_acl` differs across `auth`, `extensions`, `graphql_public`. |
| `og100-purchase-term-is-mandatory` | 3 | its FORCED-DISTURBANCE half must drop a constraint: `ERROR: must be owner of table` — the same restore-ownership artifact, which the schema-level GRANT cannot fix. |
| `h9-manual-credit-floor-guard` | 1 | same (`must be owner of table customers`, disabling a trigger). |
| `og77-view-callers-can-execute-what-views-call` | 2 | *"anon regained EXECUTE — 395's closure was undone"* and *"supabase_read_only_user should still be blocked on the OG-45 views; found 10"*. **Real production findings**, same family as og102's 36 functions. |
| `og81-migration-ledger-matches-disk` | 2 | the nine-migration convergence gap. |

Two of those groups are genuine production security findings (og77's two, alongside og102's 36);
two are artifacts of how a rehearsal database is restored; the rest are the known OCR and
ledger-gap items.

### What did NOT run in this step, stated plainly

- **Every UI/browser spec.** The test app was still serving `9c113aac` (built 2026-09-08) against
  the unmigrated `afrakala` database, so a UI run here would have measured pre-change code. Step 6
  deploys and runs them.
- **Every spec importing `pgrest.ts`** — `454-overdue-gate-reads-live-receivables`,
  `a4-person-delete-only-without-history`, `og23-posted-documents-lock-amount-and-party`,
  `persons-rls-ownership`, `public-price-exposure`, `viewer-restrictions`,
  `wave1-a1-sales-today-semantics`. Not parameterised; they read `afrakala` no matter what
  `E2E_DB_NAME` says. An earlier run that included them reported **39 did-not-run** — serial
  blocks abandoned after an early failure — which is exactly why they are called out here instead
  of being folded into a pass count.
- **`og91-receivables-real-due-date`** — uses a browser page; deferred to Step 6 with the rest.

---

## Step 6 — typecheck, build, deploy to the test app · DONE

### Typecheck: exactly the baseline, per file

```
70 errors across exactly 6 files

18  src/routes/_app.products.index.tsx          13  src/lib/invoices/functions.ts
15  src/routes/_app.admin.sales-reminders.tsx   13  src/lib/accounting/functions.ts
 6  src/lib/audit/index.ts                       5  src/routes/_app.admin.automation.tsx
```

Not one error in any of the four files E-3 changed.

**The first run said 72 across 7 files, and chasing that down found something worth keeping.** The
seventh file was `src/lib/calls/issabel-cdr.server.ts`:

```
(18,19):  error TS2307: Cannot find module 'mysql2/promise' or its corresponding type declarations.
(352,37): error TS7006: Parameter 'r' implicitly has an 'any' type.
```

Neither error is this branch's. The file arrived with **PR #434 (`9c113aac`)**, which is on
`staging` and predates the branch point, and `git diff --name-only ad0138df HEAD` on that path
returns nothing. The cause is simpler than a regression: **`mysql2` is declared in `package.json`
(`^3.24.3`) and was not installed.** `node_modules/.package-lock.json` was last written on **Jul 29**
— `npm install` had not been run on this machine since #434 merged. Running it added 9 packages,
and the count fell to 70/6 immediately; the second error was the first one's shadow.

**So the 70/6 baseline holds, and the machine had a stale `node_modules` that would have made any
local verification here read two errors high.** Worth carrying into the release line: the rehearsal
should run `npm install` before it trusts a typecheck number.

### Build

```
npm run build  ->  vite build  ->  exit 0
client bundle built in 32.27s, SSR environment built, .output/ produced
```

The pre-existing 500 kB chunk-size warnings are unchanged and are not errors.

### Deploy

Rollback tag taken **before** anything was replaced:

```
docker tag afrakala-app:lan afrakala-app:rollback-9c113aac      (image d953490abc5f, 4 days old)
```

Built and deployed from the integration worktree, with `GIT_SHA` and `BUILD_TIME` **on the command
line** — the `.env.lan` value is pinned and stale, and a build that takes it produces a correct
image with a lying label:

```
cd D:\AfraKalaTest\wt-conv-int
export GIT_SHA=$(git rev-parse --short HEAD)   # f703ae54
export BUILD_TIME=$(date -Iseconds)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml build web
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps web
```

`--no-deps` throughout, so `db-role-fix` was never pulled into the start-up graph. It still shows
`Exited (0) 8 days ago`, which is the expected state; every other `afrakala-lan-*` service stayed
`Up`.

### Verification — and it checks the thing that failed last time

```
APP_GIT_SHA      f703ae54        git rev-parse --short HEAD   f703ae54     MATCH
APP_BUILD_TIME   2026-09-12T22:38:18+05:00
/login           http=200  0.080s  content-type: text/html; charset=utf-8  Server: (absent)
/api/version     http=200  0.005s  {"commit":"f703ae54","environment":"lan",...}
container        afrakala-lan-web  Up (healthy)
```

The **`Server:` header is absent and the content-type is `text/html`**, which is the specific pair
that would have caught the 09-12 incident: the container was `Up (healthy)` then too, while
`:3100` was answering from PostgREST (`Server: postgrest/12.2.0`) and every casual check passed.
Asserting 200 alone is not enough, and this deploy was verified on all three.

The test app now serves `f703ae54` — up from `9c113aac` built 2026-09-08, four days and four
merged PRs behind.

### What the test app is serving against — stated, because it matters for Step 7

The deployed code is the integration branch. The **database it talks to is `afrakala`, which has
none of the ten** and is itself four migrations behind production:

```
afrakala             686 ledger rows, top 20260908034500, 226 tables, 18 anon-readable relations
production (dump)    681 ledger rows, top 20260912150000, 227 tables, 20 anon-readable relations
```

`afrakala` is *tighter* than production on anon grants (476/477 landed there and their production
equivalents 523/524/525 have not been replayed onto it), and *older* on everything after
`20260908034500`. Bringing it to parity is the remaining half of "test and production converge on
one schema", and it is a separate, announced action rather than a side effect of this deploy.


---

## Correction to Steps 4 and 5 — the anon-executable count is 36, not 38

The figures above originally read **41 before / 38 after**. Both were wrong by two, and the error
was mine: I read the counts off Playwright's diff rendering (`+ Received + 38`), which counts the
array's bracket lines as well as its items. Counted directly against the catalogue with og102's own
predicate:

```
prod_rehearsal_base (production shape)   39
prod_rehearsal_gate (after the ten)      36
```

Verified by extracting the names out of og102's own failure message and diffing them against an
independent query — the two lists are **identical, 36 items, zero difference in either direction**.
The delta of 3 between the two databases is unchanged and still accounted for exactly:
`asan_list_bank_deposit_export` (535), `expire_stale_credit_holds` (526), `post_receipt_journal`
(527).

Nothing else in Steps 4 or 5 depends on the figure. The finding itself — that production carries a
population of `anon`-executable application functions which migration 476 never reached — stands,
and is now measured rather than transcribed.
---

## Step 7 — O-5 cold-session checks · DONE, and it found a defect

Two roles, each in a browser context that has never visited the app — the state a real user is in
the morning after a deploy, and the state nobody was in on 2026-09-12 when `:3100` was answering
from PostgREST behind a healthy container.

For each role, each route is asserted on four things, not one: HTTP **200**, `content-type:
text/html`, **no `Server: postgrest` header**, and no bounce to `/login`. Then the role label must
be visible, and a screenshot is taken.

```
accountant     /dashboard  /accounting/payables   role label «حسابدار»     PASS
salesperson-a  /dashboard  /pricing               role label «فروشنده»     PASS
2 passed
```

Screenshots: `docs/verification/convergence/o5/` — six PNGs, 1440x900, taken against
`APP_GIT_SHA=c0804142`.

### 🔴 G-4 — F-9 was applied to one of the two identical strings. The screenshot found it.

The salesperson dashboard rendered its purchase-request KPI subtitle as **`0 تأیید · 0 در انتظار`**
— Latin digits, in a Persian RTL interface. E-3's F-9 fix routed that exact string through
`toPersianDigits`, but only in `AdminKpis()`:

```
src/routes/_app.dashboard.tsx
  line 199  AdminKpis()   ${toPersianDigits(purchases.data.approved)} تأیید · ...   <- fixed by E-3
  line 290  SalesKpis()   ${purchases.data.approved} تأیید · ...                    <- missed
```

The file has four KPI blocks — `DashboardPage`, `AdminKpis`, `SalesKpis`, `AccountantKpis` — and
the sales one carries a copy of the same template. A source review of the diff cannot see this;
only rendering the page as the role that gets that block can. Fixed at `c0804142`, one line, the
same shape as the change already reviewed at line 199, and **re-proved by redeploying and
re-taking the screenshot**: it now reads `۰ تأیید · ۰ در انتظار`.

A full scan of the route for the same class found nothing else: the only other Persian template
string interpolating a value is `${created.toLocaleString("fa-IR")} نوتیفیکیشن تولد ایجاد شد`,
which already localises its own digits.

### 🟠 The app shows every user a red "live connection lost" badge, and it is not a glitch

Visible in both dashboard screenshots: **«اتصال زنده قطع است»**. The console explains it:

```
WebSocket connection to 'ws://192.168.170.8:9000/realtime/v1/websocket?...' failed:
Error during WebSocket handshake: Unexpected response code: 404
```

404, not a timeout — Kong has no route for it, because **there is no `realtime` service in the LAN
stack at all**: `docker ps -a` lists no realtime container and `deploy/lan/docker-compose.yml`
declares none. The app opens that socket on every page load for every user, so the red badge is
permanent, and production runs the same compose family. Not caused by this branch and not fixed
here; HANDOFF, because a permanently-red status indicator trains people to ignore status
indicators.

The other console lines are `[auth-diagnostic]` traces logged at error level. They are
informational and are reported rather than asserted on.

---

## Step 8 — the owner's four decisions, and the ledger-insert sweep

### The sweep, answered in full: zero across all twelve, not just the two

The question was whether G-1 was swept or spot-fixed, and specifically whether 526's own header —
which said it *"inserts its own new row"* — described a literal `INSERT`.

```
file                                          mentions  non-comment  EXECUTABLE INSERT
526 catalogue_repair                              0          0              0
527 drop_dead_receipt_posting_path                0          0              0
528 posted_entry_immutability                     0          0              0
530 overdue_sensor_covers_unknown_due_date        0          0              0
531 audit_logs_actor_fk_set_null_on_delete        0          0              0
532 drop_duplicate_signup_trigger                 0          0              0
533 pg_cron_http_scheduler                        0          0              0
534 cron_run_log                                  0          0              0
535 security3_s5_function_fixes                   1          0              0
536 ai_providers_updated_by                       1          0              0
537 revoke_truncate_from_authenticated            0          0              0
538 close_anon_execute_on_pre393_functions        0          0              0
```

The two remaining mentions are the comments this gate wrote where the `INSERT`s used to be. There
is **no executable `schema_migrations` write in any migration in this release.**

**526 was prose, not SQL — but the prose was dangerous and has been corrected.** Its header read
*"their ledger rows are untouched -- this migration inserts its own new row"*, which reads as a
description of what the file does. It does not; the operator's `mig_apply` writes that row. Left
alone, that sentence is an instruction to the next author to add exactly the defect 535 and 536
shipped. It now names the mechanism, the owner of the step, and this finding. Comment-only change;
526's md5 changed and it was re-applied and re-proved from a fresh restore.

**There is also empirical proof, independent of the grep.** Every one of the twelve returned
`INSERT 0 1` from the operator's ledger step on a database restored minutes earlier. A file that
had already inserted its own row could not produce that — it would produce the duplicate-key error
that found G-1 in the first place.

---

### Decision 1 — TRUNCATE ships as migration 537

**Measured first, as instructed.** Nothing legitimately needs it:

*Repository grep.* `TRUNCATE` appears in `e2e/` exactly three times, and not once as something a
test does: twice inside the guards that **forbid** it (`e2e/helpers/db.ts:26` `assertReadOnlySql`
and `e2e/helpers/db-write.ts:26`), and once in an og103 comment. In `src/` every match is the
Tailwind class `truncate`. In `scripts/` and `deploy/`, none. No migration in the repository issues
`GRANT TRUNCATE`.

*Which role e2e actually connects as — measured, not assumed from the default.*

```
e2e/helpers/db.ts:17     E2E_DB_USER ?? "postgres"      -> psql -U postgres
e2e/helpers/tx.ts:33     E2E_DB_USER ?? "postgres"      -> psql -U postgres
e2e/helpers/db-write.ts:71                              -> psql -U supabase_admin -d afrakala
e2e/helpers/pgrest.ts:54 mintJwt(... role: "authenticated")
```

Nothing overrides `E2E_DB_USER` anywhere in `e2e/`, `playwright*.ts` or `package.json`; the two
specs that re-declare it (`a4-…`, `a5-…`) repeat the same default. So the DB-level helpers connect
as **`postgres`** and the write helper as **`supabase_admin`** — both of which keep TRUNCATE on all
227/228 tables. The only role 537 touches that any test reaches is **`authenticated`, through
`pgrest.ts`** — and PostgREST exposes no TRUNCATE verb, no `public` function truncates anything but
a temporary table, and no spec contains the statement.

*Five functions do contain TRUNCATE, and all five are safe:*

```
bot_query_table_rows              TRUNCATE _bot_q_rows      temp table, SECURITY DEFINER
export_dynamic_table_rows         TRUNCATE _x_rows          temp table, SECURITY DEFINER
query_dynamic_table_rows          TRUNCATE _q_rows          temp table, SECURITY DEFINER
recompute_dynamic_capital_setting TRUNCATE _sp_cust         temp table, SECURITY DEFINER
run_daily_capital_allocation      TRUNCATE _sp_cust         temp table, SECURITY DEFINER
```

Temporary tables live in `pg_temp_*` and are reached by no grant in `public`; and all five are
SECURITY DEFINER owned by `supabase_admin`, so the privilege that matters is the owner's.

**Then the test the decision demanded.** The full DB-parameterised scoped suite, run on the gate
database before and after 537:

```
ten migrations only   21 failed · 69 passed · 1 skipped
+ 537                 21 failed · 69 passed · 1 skipped
```

Identical, and the failing **titles** are identical in both directions of the comparison — zero
regressed, zero cleared. **537 is GREEN.**

Result on the catalogue:

```
                       before   after
authenticated TRUNCATE   214       0     (227 tables; 228 after 534 adds cron_run_log)
service_role  TRUNCATE   227     228     untouched, asserted by 537's own gate
authenticated SELECT     227     227     untouched
authenticated UPDATE     223     223     untouched
pg_default_acl TABLES  authenticated=arwdDxt  ->  authenticated=arwdxt   for BOTH grantors
```

That last line is the half that makes it permanent. The default is registered **twice**, under
`supabase_admin` and under `postgres`, and `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` touches
only the current role's entry — so a one-statement fix would look complete and leave the other
grantor re-granting `D` to every new table. 537 handles both.

Proven idempotent and shape-tolerant: a second pass reports `0 revoked, 228 already closed`; run
against a raw production restore without the other eleven it reports `214 revoked, 13 already
closed` — exactly the measured numbers.

---

### Decision 2 — the anon-executable functions ship as migration 538. The split, first.

**The count is 36, not 38** — see the correction above; 38 and 41 were my misreadings of
Playwright's diff rendering. The split, measured on the gate database:

| n | shape | what they are |
|---|---|---|
| **2** | **DEFINER · WRITES · NO caller check** | **`bot_authenticate_key(text)`, `refresh_sale_list_prices(uuid)`** |
| 3 | DEFINER · WRITES · caller-checked | `create_payment`, `create_receipt`, `create_dual_document` |
| 4 | DEFINER · reads · caller-checked | `get_customer_credit`, `get_receivable_detail`, `product_videos_waiting`, `search_messenger_messages_semantic` |
| 25 | DEFINER · reads · no caller check | the leaderboards, product/pricing lookups, observatory snippets, registry reports |
| 2 | INVOKER · reads · no caller check | `compute_promotion_scores`, `require_asan_code` |

**The two on the first row are the live holes**, exactly as the decision anticipated: SECURITY
DEFINER, they write, they run as `supabase_admin`, they check nothing about the caller, and an
unauthenticated PostgREST request reaches them. The two INVOKER ones are dead weight — they run as
`anon`, so RLS still stands between them and every row. The 25 read-only DEFINERs are in between:
they bypass RLS to read, which is a disclosure surface, not a write surface.

**The tension with Phase 5 block 65, named rather than smoothed over.** On 2026-09-12 that block
reported *"zero sensitive functions for anon"* and it was true of what it checked: a **12-item
list** of named sensitive functions, none of which is in the 36. This is a **full catalogue sweep**
against og102's predicate, and it finds a different population. Both statements are correct; they
are answers to different questions, and the second is the one that would have caught these.

**Two things the measurement changed about how 538 is written.**

*First, revoking from `anon` alone would have done nothing on most of them.* Of the 39 (pre-ten):

```
24  carry an explicit `=X` entry -- EXECUTE granted to PUBLIC
15  carry only `anon=X`
```

`has_function_privilege('anon', …)` is true whenever PUBLIC holds it, so on those 24 a revoke from
`anon` changes the ACL and changes nothing about who can call the function. PUBLIC has to go too.

*Second, revoking PUBLIC blindly would have repeated migration 405.*

```
role                       can execute    holds own grant
authenticated                    39             39     safe
service_role                     39             39     safe
authenticator                    24              0     depends on PUBLIC
dashboard_user                   24              0     depends on PUBLIC
products_api_readonly            24              0     depends on PUBLIC
supabase_read_only_user          24              0     depends on PUBLIC
```

395 revoked from PUBLIC, every catalogue check it shipped passed, and a live credentialed API went
down because `products_api_readonly` reached `get_product_price_bounds` only through PUBLIC.

So 538 grants explicitly **before** revoking, to a set derived twice over: a role must (i) lose
access when PUBLIC goes, and (ii) be a role this schema already knows about — it holds at least one
explicit privilege on some relation in `public`. On the production dump (ii) selects exactly
`postgres, supabase_admin, service_role, authenticated, anon, products_api_readonly`. In practice
**538 issues grants to `products_api_readonly` and nothing else** — the same one role and one grant
405 had to add by hand. `authenticator` needs none: `pg_auth_members` shows it is a member of
`anon`, `authenticated`, `service_role` and `products_api_readonly`.

> **A first draft of 538 got this wrong and it is worth recording.** It preserved *every*
> non-superuser role that would lose access, which turned one implicit PUBLIC entry into **thirteen
> explicit ACL entries per function** — `pgsodium_keyholder` and `pgbouncer` granted EXECUTE on
> `create_payment`. It also granted to `supabase_read_only_user`, which
> `og77-view-callers-can-execute-what-views-call.spec.ts` asserts should be **blocked**. Caution
> pointed the wrong way is not caution. The narrowed version leaves those roles to lose the
> incidental PUBLIC grant, which is the correct outcome.

**Result.** `538: closed 36 function(s) to anon; issued preserving grant(s) to products_api_readonly only.`

```
                            ten only    + 537 + 538
anon EXECUTE on public fns     541          505
og81/og102/og103            8 failed     7 failed    og102 "no NEW function ... born anon-executable"  PASSES
scoped DB suite            21f · 69p    19f · 71p    og77's two failures BOTH CLEAR
regressions                     —            0
```

538 clears `og77`'s *"anon regained EXECUTE — 395's closure was undone"* and *"supabase_read_only_user
should still be blocked"* as a side effect of doing the job properly.

All twelve re-applied to the already-migrated database: **identical across 15,422 snapshot lines.**

**One og102 test stays red, deliberately.** `dyn_table_role_can_view` is not anon-executable on
production and 538 does not open it. The four policies referencing it are on `dynamic_tables`,
`dynamic_table_rows`, `dynamic_table_columns` and `dynamic_table_cells`, and `anon` can read none
of the four — so no anonymous query ever evaluates them. Whether the gate's 17-item list or
production's grants should move is a decision, not a repair, and 538 does not make it.

---

### Decision 3 — 373 is ledger-row-only (OG-C)

Recorded here so the release blocks inherit it: 373 (`20260822210000`,
`close_anon_default_privileges`) is **not re-run**. The row is inserted after checking
`anon_default_acl = 0`, and only if that check passes. It is one of the nine in the schema-diff
section, and it is the only one of the nine that gets a ledger row.

---

### Decision 4 — 449 / 450 / 452 are ACCEPTED DIVERGENCE, not a gap (OG-J)

Permanently skipped, **and no ledger row**: nothing performed their work on production, so a row
would be a false statement about the schema — the precise failure `og81` exists to catch, written
deliberately.

**The consequence, stated explicitly because it is what broke 477.** These three retire and rename
tables. Test has them; production never will. So **six `zz_retired_*` table names differ between the
two databases forever**, along with `payment_receipts_backup_20260722`, which 450 dropped on test
and which still exists on production. That is exactly why 477 — a static list generated from the
test catalogue — aborted on production on 2026-09-12 and had to be re-issued as 523 (477 minus the
six) plus 524 (catalogue-driven, closing them under their production names).

The operational rule that follows, and it now has three instances behind it (477, 476, and
whatever comes next): **a migration whose target set is a list of names generated on one database
cannot be applied to the other.** Derive at run time, or do not ship it.

This is recorded in the schema-diff section as **ACCEPTED**, with that reason, so that the next
reader of the nine-migration gap does not try to close it.

---

# WAVE B — the browser pass

One deployed build (`APP_GIT_SHA=c0804142`), cold contexts only — a fresh browser context carrying
nothing but the role's `storageState`. Role sessions revalidated **5 passed** immediately before the
run. Screenshots in `docs/verification/convergence/o5/`.

Every page was checked on four things, not one: HTTP status, `content-type`, **absence of a
`Server:` header**, and where the URL actually landed. That set is what would have caught the
2026-09-12 incident, where `:3100` answered `200` from PostgREST behind a container reporting
`Up (healthy)`.

## 1 · The three pages no human had ever opened

| page | as `accountant` | as `sales` |
|---|---|---|
| `/sales/credit-requests` | 200 · renders **fully** | 200 · renders **fully** |
| `/admin/person-fields` | 200 · **denied in-page** | 200 · **denied in-page** |
| `/admin/call-extensions` | 200 · **denied in-page** | 200 · **denied in-page** |

All six loads: `content-type: text/html; charset=utf-8`, **no `Server:` header**, **zero uncaught
page errors**.

**`/sales/credit-requests` is a real, working feature, and this is the first time anyone has seen
it.** It renders «درخواست‌های افزایش اعتبار» with a complete new-request form — customer search
(«جست‌وجوی مشتری» / «نام مشتری»), customer select («انتخاب مشتری»), requested amount labelled
«مبلغ درخواستی (ریال)» with a Persian «۰» placeholder, a reason field («دلیل درخواست افزایش
اعتبار»), and a «ثبت درخواست» submit — above a populated requests table with columns
«مشتری · مبلغ درخواستی · وضعیت · تاریخ ثبت · تاریخ بررسی». Nothing is stubbed, nothing is empty,
and the digits and layout are correct RTL.

**The two admin pages deny correctly, with identical verbatim Persian:**

> «دسترسی ندارید. این بخش فقط برای مدیر کل، مدیر است.»

The right-hand rail on every page carries the standard empty state «موردی برای نمایش وجود ندارد».

## 2 · 🔴 The cold-gate check — and it is a finding, not a pass

A user logged in as `test.sales@afrakala.local`, role **«فروشنده»**, typed `/admin/automation`
into the address bar.

**The admin automation centre rendered in full.** No redirect, no denial: «مرکز اتوماسیون و
ربات‌ها», the Torob route status panel (`Queue enqueue`, `Local tests passed 115`,
`Guarded readiness`, `Skeleton`), the active-guards list, and the **«ثبت job کنترل‌شده ترب در صف»
enqueue form**. The management gear in the sidebar is highlighted for this user.

**Recorded, not fixed** — S-1 belongs to the Security-3 mission, as instructed.

What makes it worth more than one line is the **inconsistency it exposes**: on the same build, with
the same cold session, `/admin/person-fields` and `/admin/call-extensions` both refuse and
`/admin/automation` does not. So this is not "admin routes are ungated" — it is **per-page
component checks with no common enforcement**, which is precisely the shape that makes a route
inventory necessary rather than a spot fix. Two of three pages happen to carry a check; the third
happens not to.

## 3 · G-4 rendered

Scanning the live DOM of `/dashboard` for a Latin digit adjacent to «تأیید» / «در انتظار» /
«فاکتور صادرشده»:

```
accountant  Latin-digit Persian KPI subtitles found: none
sales       Latin-digit Persian KPI subtitles found: none
```

The salesperson subtitle that read `0 تأیید · 0 در انتظار` before now reads «۰ تأیید · ۰ در انتظار».

## 4 · Console

Nothing thrown. Every console line falls into exactly two classes:

- `[auth-diagnostic][session.onAuthStateChange]` traces — `SIGNED_IN`, `INITIAL_SESSION`,
  `TOKEN_REFRESHED` — logged at error level though they are informational. Worth demoting: logging
  routine session events as errors is why a real error is hard to spot here.
- The Realtime websocket 404, on every page load, for every user (already a HANDOFF item).

## 5 · One small thing, recorded because nobody will otherwise

`/admin/person-fields`'s denial page shows the breadcrumb **«صفحه»** — a literal placeholder
meaning "page". `/admin/call-extensions` shows its real title «داخلی‌های تلفن» in the same state.
The page's title is missing in its denied state; a user who lands there is told only "page".

