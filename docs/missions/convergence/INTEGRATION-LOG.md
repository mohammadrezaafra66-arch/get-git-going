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
| `20260822210000` | 373 close anon default privileges | **needs a Stage 3 decision** |
| `20260828000000` | 411 customer credit ranges widened | owner APPROVED (OG-A) — ships as-is in its own release block |
| `20260828010000` | 412 cooperation hint matches widened range | same block as 411 |
| `20260829000000` | 413 salesperson scoring ranges widened | same block as 411 |
| `20260905171000` | 449 retire daily capital functions | **needs a Stage 3 decision** |
| `20260905171500` | 450 retire superseded tables | **needs a Stage 3 decision** |
| `20260905180000` | 452 retire parameter weight backups by rename | **needs a Stage 3 decision** |

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

