# R-4 / R-5 — the 74 run in apply order against the rehearsal, and the two already-fixed objects

Run overnight **2026-09-08** against `prod_rehearsal_20260908` on the **test** host container
`afrakala-lan-db`. **Production `192.168.170.10` was never contacted — no HTTP, no psql, no ping,
no DNS.** No command in this row named the database `postgres`; every apply used
`-d prod_rehearsal_20260908`. `afrakala` was read twice, read-only, for contrast (§4.3, §5.1).

| row | verdict |
|---|---|
| **R-4** run the 74 in apply order and record what each does | **COMPLETE** — 74/74 attempted, 60 applied, 14 failed, every failure recorded verbatim and classified |
| **R-5** prove the two already-fixed objects behave | **COMPLETE, and the answer is not the expected one** — the view REVOKE behaves exactly as hoped (§5.2); **migration 460 does not** (§5.1). It aborts on production even when production is already in the desired state. |

> **Three findings outrank the table.** (1) **Migration 460 will abort on production**, in the exact
> state the owner left it in — proven, not inferred (§5.1). (2) **PREFLIGHT #1's query is not
> sufficient**: the baseline is missing migration **408** as well, which sits *above* the 336–370
> band and which the ledger *claims* is applied (§4.2). (3) **Production's nine open
> `pg_default_acl` anon entries make migration 507 fail and leave 26 newly-created functions
> anon-executable** — a defect that is structurally invisible on the test computer, which has zero
> such entries (§4.3).

---

## 1 · Method

Each of the 74 was applied on its own, in the order of `MIGRATIONS-74.md`, one psql invocation each:

```bash
cat "$L" | docker exec -i afrakala-lan-db sh -c "cat > /tmp/r4_$n.sql"      # stdin, never a pipe into psql
md5sum "$L"  vs  docker exec afrakala-lan-db md5sum /tmp/r4_$n.sql          # verified BEFORE psql sees it
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d prod_rehearsal_20260908 --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/r4_'$n'.sql'
```

- **`docker cp` was not used.** Delivery was stdin, per CLAUDE.md rule 1's amendment.
- **All 74 md5s matched on both sides.** Zero mismatches. Persian survived intact — six migrations
  printed Persian NOTICEs and they arrived correct, e.g. order 66 `D-52: هر چهار assert برقرار است.`
- **Elapsed** is wall-clock around the `docker exec` (harness overhead included, ~50 ms/call).
- **Ledger row recorded after every successful apply**, with a plain `INSERT` and no
  `ON CONFLICT` — a collision must raise, per `ledger-reconcile.sh`'s step 5. The block asserts
  `ROW_COUNT = 1` **and** `ledger_after = ledger_before + 1`, so an already-owned version aborts
  instead of exiting 0. All 60 inserts asserted clean: **ledger 579 → 639, max `20260907170000`.**
- **A failure did not stop the run.** Each failure was recorded verbatim and the next migration was
  attempted, so downstream cascades are visible rather than hidden. This is a deliberate deviation
  from what production will do: on production, `--single-transaction -v ON_ERROR_STOP=1` means the
  **first** failure ends the run. See §6.5.

### Rows touched — read this before using the numbers

`ins/upd/del` in the table is the **`pg_stat_database` tuple delta** across the whole database,
measured immediately before and immediately after each apply (PostgreSQL 15.6, shared-memory stats,
so no collector lag). It is honest but it is **not** a business-row count: it **includes system
catalogue churn**, so a pure-DDL migration that creates one function still shows `ins=9 upd=3 del=8`.

The alternative was worse: top-level psql command tags are **zero for 70 of the 74**, because
essentially all DML in these files happens inside `DO $$ … $$` blocks, which emit no command tag.
Where a migration reports its own count, §3 quotes it verbatim — those are the trustworthy figures.

**The audit's `[schema+data]` marking of 33 of the original 62 could not be honoured: no document in
the repo carries that marking** (`grep -r "schema+data" docs/` → no matches). It lived in the
orchestrator's own working notes. Rows touched was therefore measured for **all 74** instead of the
33.

---

## 2 · The 74, in apply order

`ins/upd/del` = whole-database tuple delta, catalogue churn included (see §1).

| ord | # | file | outcome | ms | ins/upd/del | error (verbatim) | class |
|---|---|---|---|---|---|---|---|
| 1 | 420 | `20260903100000_420_guest_quotes_get_their_own_reason.sql` | applied ok | 389 | 9/3/8 | | |
| 2 | 421 | `20260903140000_421_guest_refusal_message_tells_the_truth.sql` | applied ok | 346 | 5/1/5 | | |
| 3 | 425 | `20260904160000_425_settlement_dead_predicates.sql` | applied ok | 342 | 4/6/4 | | |
| 4 | 430 | `20260904190000_430_asan_import_requires_code_and_mobile.sql` | applied ok | 440 | 12/2/7 | | |
| 5 | 431 | `20260904193000_431_retire_person_import_batch.sql` | applied ok | 345 | 0/0/6 | | |
| 6 | 432 | `20260904200000_432_asan_import_batch_provenance_and_revert.sql` | applied ok | 472 | 35/6/7 | | |
| 7 | 435 | `20260904210000_435_person_delete_when_there_is_no_history.sql` | applied ok | 390 | 21/6/6 | | |
| 8 | 436 | `20260905100000_436_close_anon_role_grant_escalation.sql` | applied ok | 474 | 12/21/12 | | |
| 9 | 446 | `20260905110000_446_attach_purchase_actor_active_trigger.sql` | applied ok | 399 | 6/0/0 | | |
| 10 | 443 | `20260905130000_443_fix_ambiguous_outparams_and_assert_route_permissions.sql` | applied ok | 473 | 4/2/4 | | |
| 11 | 445 | `20260905140000_445_scheduled_jobs_documentation.sql` | applied ok | 422 | 3/0/0 | | |
| 12 | 437 | `20260905163000_437_inline_create_registers_asan_identifier.sql` | applied ok | 358 | 4/2/4 | | |
| 13 | 447 | `20260905170000_447_retire_capital_allocation_tombstones.sql` | applied ok | 473 | 0/0/12 | | |
| 14 | 448 | `20260905170500_448_retire_superseded_functions.sql` | applied ok | 475 | 0/0/11 | | |
| **15** | **449** | `20260905171000_449_retire_daily_capital_functions.sql` | **FAILED** | 384 | 0/0/13 | `ERROR:  449: daily_capital_snapshots expected 10 rows, found 0` | **(a)** |
| **16** | **450** | `20260905171500_450_retire_superseded_tables.sql` | **FAILED** | 372 | 0/12/70 | `ERROR:  450: backup_142 expected 18 rows, found 16` | **(a)** |
| 17 | 451 | `20260905172000_451_retire_app_role_wrappers.sql` | applied ok | 426 | 0/0/8 | | |
| **18** | **452** | `20260905180000_452_retire_parameter_weight_backups_by_rename.sql` | **FAILED** | 371 | 2/6/0 | `ERROR:  452: rows were lost in the rename (142=16, 0722=16)` | **(a)** |
| 19 | 453 | `20260905183000_453_credit_customers_report_uncomputed_as_null.sql` | applied ok | 436 | 9/2/8 | | |
| 20 | 454 | `20260905220000_454_wire_overdue_gate_to_receivables.sql` | applied ok | 555 | 8/7/6 | | |
| 21 | 455 | `20260905221500_455_score_period_current_month_then_dated_fallback.sql` | applied ok | 455 | 10/6/5 | | |
| 22 | 457 | `20260905224500_457_payables_debt_is_the_purchase_total.sql` | applied ok | 390 | 22/3/22 | | |
| 23 | 458 | `20260905230000_458_receivables_summary_keeps_unknown_due_dates.sql` | applied ok | 404 | 4/4/3 | | |
| 24 | 459 | `20260905231500_459_payables_names_an_unknown_due_date.sql` | applied ok | 427 | 28/7/24 | | |
| **25** | **460** | `20260906090000_460_pin_receipt_ocr_to_local_vision.sql` | **FAILED** | 365 | 0/0/0 | `ERROR:  460: the local ollama provider d30816a9-8ff0-4d0e-8f25-0661f8cbea61 is missing, inactive, does not declare vision, or has no vision_model; refusing to leave receipt OCR pointed at a cloud provider` | **(a)** |
| 26 | 461 | `20260906091500_461_gate_hold_and_release_credit.sql` | applied ok | 472 | 8/8/7 | | |
| **27** | **462** | `20260906093000_462_gate_money_tier_definers.sql` | **FAILED** | 387 | 5/11/2 | `ERROR:  function public.hold_credit_for_quote(uuid, uuid) does not exist` | **(b′) new hole** |
| 28 | 463 | `20260906094500_463_gate_identity_tier_definers.sql` | applied ok | 346 | 6/8/5 | | |
| 29 | 464 | `20260906100000_464_gate_catalogue_tier_definers.sql` | applied ok | 474 | 3/14/3 | | |
| 30 | 465 | `20260906101500_465_gate_housekeeping_tier_definers.sql` | applied ok | 395 | 13/14/12 | | |
| 31 | 466 | `20260906103000_466_receivables_carry_salesperson_and_ceiling.sql` | applied ok | 342 | 8/4/8 | own `BEGIN;`/`COMMIT;` — §6.6 | |
| 32 | 467 | `20260906110000_467_scoring_tables_select_credit_audience.sql` | applied ok | 515 | 12/0/0 | | |
| 33 | 468 | `20260906111500_468_bot_writers_require_a_valid_key.sql` | applied ok | 447 | 26/12/26 | | |
| 34 | 469 | `20260906113000_469_market_rate_system_rpcs_test_for_service_role_positively.sql` | applied ok | 430 | 9/9/8 | | |
| 35 | 470 | `20260906114500_470_expire_pending_documents_loses_its_direct_authenticated_grant.sql` | applied ok | 378 | 0/3/0 | | |
| 36 | 471 | `20260906120000_471_ai_provider_key_and_bot_readers_require_a_caller.sql` | applied ok | 424 | 9/15/8 | | |
| **37** | **475** | `20260906130000_475_audit_ai_routing_changes.sql` | **FAILED** | 389 | 12/0/0 | `ERROR:  475 VERIFY: receipt_ocr.vision is no longer pinned, enabled and fallback-off against the LAN Ollama provider. 475 does not write to this table, so this means the state changed underneath it - stop and investigate before trusting the audit trail` | **(a)** cascade of 460 |
| **38** | **476** | `20260906140000_476_close_pre393_anon_execute_grants.sql` | **FAILED** | 428 | 48/146/48 | `ERROR:  function public.jalali_year(date) does not exist` | **(b)** |
| **39** | **477** | `20260906150000_477_close_anon_table_grants.sql` | **FAILED** | 494 | 0/72/0 | `ERROR:  relation "public.document_attachments" does not exist` | **(b)** |
| **40** | **478** | `20260906160000_478_partial_purchase_payment.sql` | **FAILED** | 461 | 0/0/0 | `ERROR:  column pv.reversed_at does not exist` | **(b)** |
| 41 | 481 | `20260906170000_481_allocation_rows.sql` | applied ok | 469 | 208/14/6 | | |
| 42 | 482 | `20260906171500_482_allocation_rpcs.sql` | applied ok | 419 | 23/12/0 | | |
| 43 | 483 | `20260906180000_483_allocation_rows_audit_write_triggers.sql` | applied ok | 461 | 21/7/6 | | |
| 44 | 484 | `20260906181000_484_retire_capital_allocation_ledger.sql` | applied ok | 518 | 11/7/6 | | |
| 45 | 485 | `20260906182000_485_fill_role_permissions_gaps.sql` | applied ok | 470 | 3/0/0 | | |
| 46 | 486 | `20260906190000_486_chart_of_accounts.sql` | applied ok | 415 | 103/12/0 | | |
| **47** | **487** | `20260906190500_487_ledger_accrual_columns.sql` | **FAILED** | 504 | 0/0/0 | `ERROR:  column "doc_kind" does not exist` | **(b)** |
| 48 | 488 | `20260906191000_488_sale_accrual_posting.sql` | applied ok | 446 | 18/5/7 | | |
| 49 | 489 | `20260906191500_489_purchase_accrual_posting.sql` | applied ok | 362 | 9/3/0 | | |
| 50 | 490 | `20260906192000_490_quote_status_cancelled_after_accept.sql` | applied ok | 307 | 1/0/0 | | |
| 51 | 491 | `20260906192500_491_accrual_cancel_paths.sql` | applied ok | 464 | 16/5/7 | | |
| 52 | 492 | `20260906193000_492_daily_accrual_notice.sql` | applied ok | 375 | 3/3/0 | | |
| 53 | 493 | `20260906193500_493_notification_type_daily_accrual.sql` | applied ok | 525 | 4/2/3 | | |
| 54 | 494 | `20260906194000_494_purchase_payment_outstanding_clamp.sql` | applied ok | 421 | 5/1/4 | | |
| 55 | 495 | `20260906194500_495_implicit_payment_is_outstanding.sql` | applied ok | 404 | 5/1/5 | | |
| 56 | 496 | `20260906200000_496_call_logs_batch_score_recompute.sql` | applied ok | 395 | 4/3/6 | | |
| **57** | **497** | `20260906201000_497_call_logs_cdr_columns.sql` | **FAILED** | 412 | 21/6/8 | `ERROR:  497: anon holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on call_logs` | **(b)** cascade of 477 |
| 58 | 498 | `20260906202000_498_call_log_extensions.sql` | applied ok | 388 | 100/9/0 | | |
| 59 | 504 | `20260906210000_504_employee_streaks_daily.sql` | applied ok | 632 | 9/3/3 | | |
| 60 | 505 | `20260906211000_505_credit_request_approval.sql` | applied ok | 647 | 27/7/11 | | |
| 61 | 506 | `20260906212000_506_capital_manual_floor.sql` | applied ok | 488 | 4/1/4 | | |
| **62** | **507** | `20260907060000_507_cron_definer_writers_are_not_authenticated_callable.sql` | **FAILED** | 440 | 3/6/3 | `ERROR:  507: anon must not reach either function` | **(a)** |
| 63 | 508 | `20260907090000_508_delete_residue_allocation_row.sql` | applied ok | 412 | 0/0/0 | no-op here: `D-55: allocation_rows قبل=0 ، حذف‌شده=0` | |
| 64 | 509 | `20260907093000_509_allocation_tehran_today.sql` | applied ok | 405 | 9/8/6 | | |
| 65 | 512 | `20260907100000_512_call_logs_issabel_import_foundation.sql` | applied ok | 376 | 12/5/0 | own `BEGIN;`/`COMMIT;` — §6.6 | |
| 66 | 510 | `20260907103000_510_daily_allocation_honours_manual_floor.sql` | applied ok | 431 | 8/3/8 | | |
| 67 | 513 | `20260907110000_513_call_import_worker_recompute.sql` | applied ok | 548 | 4/4/0 | own `BEGIN;`/`COMMIT;` — §6.6 | |
| 68 | 511 | `20260907113000_511_manual_credit_floor_guard.sql` | applied ok | 351 | 9/5/2 | | |
| 69 | 515 | `20260907123000_515_system_health_reports_require_admin.sql` | applied ok | 534 | 6/9/3 | | |
| **70** | **514** | `20260907130000_514_call_extension_activity_views.sql` | **FAILED** | 343 | 0/0/0 | `ERROR:  column "extension" does not exist` | **(b)** cascade of 497 |
| **71** | **516** | `20260907140000_516_call_extension_views_least_privilege.sql` | **FAILED** | 331 | 0/0/0 | `ERROR:  relation "public.v_call_extension_hourly" does not exist` | **(b)** cascade of 514 |
| 72 | 518 | `20260907150000_518_manual_credit_floor_guard_covers_insert.sql` | applied ok | 480 | 6/3/6 | | |
| 73 | 517 | `20260907154500_517_derive_staff_call_metrics.sql` | applied ok | 445 | 4/7/0 | own `BEGIN;`/`COMMIT;` — §6.6 | |
| 74 | 519 | `20260907170000_519_system_health_guard_targets_api_callers.sql` | applied ok | 465 | 6/9/6 | | |

### Totals

| outcome | count |
|---|---|
| **applied ok** | **60** |
| **failed** | **14** |
| **skipped — already true** | **0** |
| **unrehearsable** | **0** — see the correction below |
| total | **74** |
| total elapsed for the 74 applies | **31.8 s** (31,848 ms) |
| ledger | **579 → 639**; max `20260904150000` → `20260907170000`; 60 inserts, every one asserted `ROW_COUNT = 1` |

### 🔴 Correction: **not one of the 74 is unrehearsable for `pg_cron`**

The brief expected some migrations to be marked `UNREHEARSABLE — pg_cron absent`, and R-1 §6.5 named
six ("445, 469, 492, 496, 504, and the untracked 520"). **Measured, that is not true of the 74.**
Eight of them mention cron, and every mention is in a `--` comment or inside a `COMMENT ON`
documentation string. There is no executable `cron.` reference anywhere in the set:

```
$ while read n f; do grep -nE "cron\." "$f" | grep -vE "^[0-9]+:\s*--"; done < list74.txt
(no output — zero non-comment matches across all 74 files)
```

Every one of the eight explicitly documents *why* it does **not** schedule anything — 492 line 21:
`pg_cron is AVAILABLE but NOT INSTALLED, there is no cron schema, and therefore …`. So `pg_cron`'s
absence from the rehearsal cost this run nothing, and **no row of the runbook needs an
`UNREHEARSABLE` marker on that account.** (Migration 520 is C-1's untracked work, outside this row's
set; it was not read or run.)

---

## 3 · Row counts the migrations reported about themselves

These are the trustworthy "rows touched" figures, quoted from each migration's own `NOTICE`:

| ord | # | what it said |
|---|---|---|
| 10 | 443 | `role_permissions module roles -> 7 rows`; `module purchases -> 7 rows`; `module dashboard -> 7 rows` |
| 18 | 452 | `452: backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows` (then it aborted demanding 18) |
| 41 | 481 | `481 OK: allocation_rows created; 31 person FKs, all registered; anon has nothing` |
| 45 | 485 | `485: role_permissions now 189 rows, 0 gaps` |
| 56 | 496 | `496 OK: per-row call_logs recompute retired (call_logs now carries 0 user trigger(s)); batch entry point installed; anon has nothing` |
| 63 | 508 | `D-55: allocation_rows قبل=0 ، حذف‌شده=0` — **deletes nothing on the production baseline**; the residue row it targets is a test-database artefact |

---

## 4 · The fourteen failures, in full

### The two classes, as the brief defines them

- **(a)** it would fail on production too — a real defect in the migration set.
- **(b)** it fails only because the rehearsal baseline lacks migrations 336–370.

A third label was needed and is used once: **(b′)** — fails because the baseline lacks a migration
that is **not** in the 336–370 band, and which PREFLIGHT #1's query therefore cannot detect.

| class | count | orders |
|---|---|---|
| **(a) real defect** | **5** | 15 (449), 16 (450), 18 (452), 25 (460), 62 (507) |
| **(a) cascade of an (a)** | **1** | 37 (475), behind 460 |
| **(b) the 336–370 hole** | **4** | 38 (476), 39 (477), 40 (478), 47 (487) |
| **(b) cascade of a (b)** | **3** | 57 (497), 70 (514), 71 (516) |
| **(b′) a hole PREFLIGHT #1 misses** | **1** | 27 (462) |

### 4.1 · Orders 15, 16, 18 — three migrations assert row counts only the TEST database ever had — **(a)**

```
[15] ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
     CONTEXT:  PL/pgSQL function inline_code_block line 12 at RAISE
[16] ERROR:  450: backup_142 expected 18 rows, found 16
     CONTEXT:  PL/pgSQL function inline_code_block line 11 at RAISE
[18] ERROR:  452: rows were lost in the rename (142=16, 0722=16)
     CONTEXT:  PL/pgSQL function inline_code_block line 20 at RAISE
```

**Why (a):** none of these errors names an object from the 336–370 module. Each is an absolute row
count baked into the migration's own assertion, taken from the `afrakala` test database when the
migration was written. The production baseline holds different data — 0 rows where 449 wants 10, 16
rows where 450 and 452 want 18. 452's own NOTICE prints the truth one line before it aborts
(`backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows`), and then:

```sql
IF n_new_142 <> 18 OR n_new_0722 <> 18 THEN
  RAISE EXCEPTION '452: rows were lost in the rename (142=%, 0722=%)', n_new_142, n_new_0722;
```

**18 is not a cascade of 16.** They assert the same constant independently; 452 renames the table
whether or not 450 ran. Both fail for the same reason, separately.

**This is the same defect R-1 found in migrations 410 and 418** — the project keeps writing absolute
row-count assertions against a database whose data is not production's. It has now happened five
times.

### 4.2 · 🔴 Order 27 — the baseline is missing migration **408** as well — **(b′)**

```
[27] psql:/tmp/r4_27.sql:260: ERROR:  function public.hold_credit_for_quote(uuid, uuid) does not exist
```

462 does `REVOKE EXECUTE ON FUNCTION public.hold_credit_for_quote(uuid, uuid) FROM anon,
authenticated, PUBLIC;`. The function is absent. Tracing it:

```
$ grep -n "hold_credit_for_quote" supabase/migrations/*.sql
20260827100000_408_quote_reserves_ceiling_and_stale_holds_expire.sql:
    CREATE OR REPLACE FUNCTION public.hold_credit_for_quote(p_quote_id uuid, p_user_id uuid)
   ... every other hit is a comment, or 462's own REVOKE

$ grep -nE "DROP (FUNCTION|TABLE)[^;]*hold_credit_for_quote" supabase/migrations/*.sql
(no matches — nothing anywhere drops it)

rehearsal  : SELECT proname FROM pg_proc … proname LIKE '%credit_for_quote%'  ->  (0 rows)
afrakala   : same query                                                      ->  1 row
```

**Migration 408 is the sole creator, nothing drops it, and it is absent from the production
baseline.** The supersession trap is ruled out the same way R-1 ruled it out for 336–370.

**And the ledger claims 408 applied:**

```
$ psql -d prod_rehearsal_20260908 -tAc "SELECT version FROM supabase_migrations.schema_migrations
                                         WHERE version = '20260827100000';"
20260827100000
```

**Why this matters more than one failed migration.** 408 is at `20260827100000`. R-1's Band A ends at
`20260822210000`, so `not-applied-rehearsal.txt` does not list 408 and R-3's reconciliation treated
it as applied — correctly by its own rule, because the ledger already held that row from migration
410's backfill. **The ledger lies in both directions**: it under-reports 10 migrations that ran (R-3
fixed those) and it over-reports at least one that did not.

**PREFLIGHT #1's query is therefore not sufficient.** It asks only about `document_numbers`,
`dual_documents` and `document_attachments`. A production database can return all three and still be
missing 408. The preflight should be extended — one extra read-only line:

```sql
-- add to PREFLIGHT #1, run on production, read only
SELECT to_regprocedure('public.hold_credit_for_quote(uuid,uuid)') AS m408_hold_credit_for_quote;
-- NULL  =>  migration 408 did not run; migration 462 will abort
```

**What this does and does not establish.** Measured on the 2026-08-31 dump, exactly like
PREFLIGHT #1. Whether production today has 408 is **UNKNOWN** and cannot be settled here.

### 4.3 · 🔴 Order 62 — production's open `ALTER DEFAULT PRIVILEGES` makes 507 fail — **(a)**

```
[62] psql:/tmp/r4_62.sql:99: ERROR:  507: anon must not reach either function
     CONTEXT:  PL/pgSQL function inline_code_block line 19 at RAISE
```

**This is not a cascade and not a baseline artefact.** 507's two subjects were created by migrations
that both applied cleanly tonight — `notify_accountants_daily_accrual_summary` by 492 (order 52) and
`roll_employee_daily_streaks` by 504 (order 59). 507 revokes from `PUBLIC` and `authenticated`, then
asserts anon cannot reach either. Measured immediately after the run:

```
                 proname                  |                     proacl                        | anon_exec
------------------------------------------+---------------------------------------------------+-----------
 notify_accountants_daily_accrual_summary | {postgres=X/…,authenticated=X/…,service_role=X/…} | f
 roll_employee_daily_streaks              | {postgres=X/…,anon=X/supabase_admin,…}            | t
```

`roll_employee_daily_streaks` carries an **explicit** `anon=X` grant, so revoking from `PUBLIC` does
not remove it. Where it came from:

```
rehearsal (production dump)  : pg_default_acl entries mentioning anon  ->  9 rows
                               public/r, public/f, public/S and storage/*, each granting
                               anon arwdDxt or X automatically at object creation
afrakala (test computer)     : same query                             ->  0 rows
```

**The test computer has zero default ACLs; production has nine.** On test every new function is born
clean and 507 passes; on the production baseline `CREATE FUNCTION` grants anon `EXECUTE`
automatically and **507's own assertion catches it and aborts.** 507 will fail on production.

**The blast radius is far wider than 507.** Of the **80** distinct functions the 60 successful
migrations created or replaced, **26 are anon-EXECUTE-able on the production baseline right now**,
including `pay_purchase_with_voucher`, `review_credit_request`, `create_sales_quote_with_items`,
`reverse_document`, `calculate_customer_realtime_credit`, `get_receivables_summary`,
`get_payables_summary`, `asan_commit_person_batch` and `asan_revert_person_batch`.

Tables are safe by habit of authorship, not by design — the newer migrations revoke by hand, e.g.
`20260906170000_481_allocation_rows.sql:659` `REVOKE ALL ON TABLE public.allocation_rows FROM anon;`
— and measured, all three tables created tonight (`allocation_rows`, `call_log_extensions`,
`chart_of_accounts`) plus the view `vw_supplier_payables` carry **no** anon grant. **Functions have
no such habit.**

**Consequence for the runbook, and it changes the order of steps.** CONTRACTS §"What the 74 do NOT
cover" lists "`ALTER DEFAULT PRIVILEGES … TO anon` is still open" as one of three extra steps, with
no stated position. It is not a tidy-up: **it must run BEFORE the 74**, because otherwise migration
507 aborts the run, and every function the run creates is born anon-executable with nothing later
revoking it — 476 and 477 enumerate objects that existed when they were *written*, not objects the
run creates.

### 4.4 · Orders 38, 39, 40, 47 — the 336–370 hole — **(b)**

```
[38] ERROR:  function public.jalali_year(date) does not exist
[39] ERROR:  relation "public.document_attachments" does not exist
[40] ERROR:  column pv.reversed_at does not exist
[47] ERROR:  column "doc_kind" does not exist
```

Each names an object created inside the proven-absent band, traced to its sole creator:

| ord | # | missing object | created by | in Band A? |
|---|---|---|---|---|
| 38 | 476 | `jalali_year(date)` | `20260818151000_337_jalali_year_helper.sql` | yes |
| 39 | 477 | `public.document_attachments` | `20260818156000_342_document_attachments.sql` | yes |
| 40 | 478 | `payment_vouchers.reversed_at` | `20260819150000_363_reverse_document_schema.sql` | yes |
| 47 | 487 | `journal_entries.doc_kind` | `20260818155000` (band member) | yes |

**These four are the ones that disappear if PREFLIGHT #1 comes back with three non-NULL rows.** They
are also the reason the 336–370 question must be answered *before* the run and not discovered during
it.

**One (a)-shaped risk hides inside 477 and should be recorded even though its failure is (b).** 477
is not a catalogue-driven sweep. It is a **hard-coded list of 390 explicit `REVOKE` statements**
(`grep -c '^REVOKE'` → 390), generated from the test database's catalogue when it was written, with
no `pg_class`, `pg_tables`, `information_schema` or `relkind` query anywhere in its 631 lines. So a
table on test but not on production **aborts the whole migration** — which is exactly what
`document_attachments` at line 298 did — and a table on production but not on test is **silently left
anon-granted**. R-1 measured 199 anon-selectable tables here against 202 on production; those three,
whatever they are, are outside 477's list.

### 4.5 · Orders 37, 57, 70, 71 — cascades

| ord | # | error | cascades from | class |
|---|---|---|---|---|
| 37 | 475 | `475 VERIFY: receipt_ocr.vision is no longer pinned, enabled and fallback-off against the LAN Ollama provider…` | **460** (order 25) | **(a)** — 460 fails on production too, so 475 does as well |
| 57 | 497 | `497: anon holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on call_logs` | **477** (order 39) | **(b)** — 477 would have revoked those grants; `call_logs` carries the default-ACL `anon=arwdDxt` |
| 70 | 514 | `column "extension" does not exist` | **497** → 477 (`call_logs.extension` is added by 497) | **(b)** |
| 71 | 516 | `relation "public.v_call_extension_hourly" does not exist` | **514** → 497 → 477 | **(b)** |

475's message deserves a note: it says *"the state changed underneath it — stop and investigate"*. On
production that will be **misleading**. Nothing changed underneath it; 460 simply never ran. An
operator following that instruction would go hunting a concurrent writer that does not exist.

---

## 5 · R-5 — the two objects the owner already fixed by hand on 2026-09-07

### 5.1 · 🔴 `receipt_ocr` / migration 460 — **it will ABORT on production, not "make no change"**

**Which half is observed and which is simulated.** The brief anticipated *observing* 460 doing its
work here (the rehearsal starts unfixed) and *simulating* the already-fixed case. **The first half
could not be observed at all: 460 aborts on the unfixed rehearsal too** (order 25). The second half
was simulated exactly as instructed, and it aborts as well.

**Before — measured on the rehearsal, which is production's 2026-08-31 state (OBSERVED):**

```
    service_key     | pinned_to |             provider_id              | is_enabled | fallback_enabled
--------------------+-----------+--------------------------------------+------------+------------------
 receipt_ocr.vision | gpt       | f6a5bc04-9c89-42a1-9bfe-dd3258313a0b | t          | t

ai_providers, all of them:
 f6a5bc04-9c89-42a1-9bfe-dd3258313a0b | gpt    | openai_compatible | https://api.openai.com/v1  | is_active=t | caps={vision}
 e07894ce-e804-443c-9873-040c312c48d5 | ollama | ollama            | http://192.168.170.8:11434 | is_active=t | caps={chat,embeddings}
```

**The root cause: migration 460 addresses its rows by hard-coded UUID, and the UUIDs are the TEST
database's.** Side by side (`afrakala` read read-only):

| | production baseline (rehearsal) | test `afrakala` | what 460 hard-codes |
|---|---|---|---|
| cloud provider | `f6a5bc04-…` name **`gpt`** | `0fbe576a-…` name **`for ocr`** | `0fbe576a-9ef3-475b-92e7-fabd981a7d5d` |
| local provider | `e07894ce-…` name `ollama`, caps **`{chat,embeddings}`** | `d30816a9-…` name `ollama`, caps include `vision` | `d30816a9-8ff0-4d0e-8f25-0661f8cbea61` |

460's own header states these ids were "measured 2026-09-06 on the `afrakala` database". They do not
exist on production. Its header is wrong about production in a second way too: it asserts
`receipt_ocr.vision` "is the ONLY route of the eight with `fallback_enabled = false`" — on the
production baseline **all eight routes have `fallback_enabled = true`**.

**After — SIMULATED, inside a transaction that was rolled back.** The owner's fix was applied by hand
in the most favourable possible form — ollama was even *given* the `vision` capability it lacks, so
that the id would be the only thing left that could fail — and then 460 was run against it:

```
=== 2. apply the owner's 2026-09-07 manual fix BY HAND ===
UPDATE 1     -- ollama capabilities := {chat,embeddings,vision}
UPDATE 1     -- receipt_ocr.vision -> ollama, is_enabled=true, fallback_enabled=false
UPDATE 1     -- gpt.is_active := false

=== 3. state AFTER the fix — this is what 460 lands on in production ===
    service_key     | pinned_to |              pinned_id               | is_enabled | fallback_enabled | gpt_is_active
--------------------+-----------+--------------------------------------+------------+------------------+---------------
 receipt_ocr.vision | ollama    | e07894ce-e804-443c-9873-040c312c48d5 | t          | f                | f

=== 4. now run migration 460 against that already-correct state ===
SET
psql:/tmp/r4_25.sql:172: ERROR:  460: the local ollama provider d30816a9-8ff0-4d0e-8f25-0661f8cbea61
                         is missing, inactive, does not declare vision, or has no vision_model;
                         refusing to leave receipt OCR pointed at a cloud provider
CONTEXT:  PL/pgSQL function inline_code_block line 21 at RAISE
psql:/tmp/r4_25.sql:255: ERROR:  current transaction is aborted, commands ignored until end of transaction block

ROLLBACK
    service_key     | pinned_to | fallback_enabled | gpt_is_active
--------------------+-----------+------------------+---------------
 receipt_ocr.vision | gpt       | t                | t              <-- rehearsal restored, nothing kept
```

**Verdict.** The premise of this R-5 row does not hold for object 1. "No change" is *not* what 460
does when it lands on the desired state: **it raises, and with `--single-transaction` it rolls back
and ends the run at step 25 of 74.** The migration is right about its intent and wrong about its
subject; it cannot recognise production's rows at all, fixed or unfixed.

**Note what 460 would do even if the ids were right.** Its two `UPDATE`s are unconditional
(`SET provider_id = …, updated_at = now() WHERE service_key = 'receipt_ocr.vision'`), so both rows
would be **physically rewritten and `updated_at` moved** on every run, each reporting
`ROW_COUNT = 1`. "No change" would mean no change of *value*, never an untouched row. Worth stating
in the runbook so a moved `updated_at` is not read as a second writer.

### 5.2 · `anon` on `v_promotion_suggestions` and `vw_account_balances` — **behaves exactly as hoped**

**No migration in the 74 touches either view** — verified: the only migration files naming them are
351–403, all below the ceiling, and 477 (§4.4) is a hard-coded list that does not include them. So
this is the runbook's separate step, and **both halves were OBSERVED, neither simulated.**

**Before (OBSERVED — the rehearsal carries production's pre-fix state):**

```
         relname         | anon_select | relacl
-------------------------+-------------+-----------------------------------------------------------
 v_promotion_suggestions | t           | {supabase_admin=arwdDxt/…,anon=arwdDxt/supabase_admin,…}
 vw_account_balances     | t           | {supabase_admin=arwdDxt/…,anon=arwdDxt/supabase_admin,…}
```

**Pass 1 — the step run on the UNFIXED state (OBSERVED):**

```
REVOKE ALL ON TABLE public.v_promotion_suggestions FROM anon;   -> REVOKE
REVOKE ALL ON TABLE public.vw_account_balances     FROM anon;   -> REVOKE

         relname         | anon_select | relacl
-------------------------+-------------+-------------------------------------------------------------------
 v_promotion_suggestions | f           | {supabase_admin=arwdDxt/…,postgres=…,authenticated=…,service_role=…}
 vw_account_balances     | f           | {supabase_admin=arwdDxt/…,postgres=…,authenticated=…,service_role=…}
```

`anon=arwdDxt/supabase_admin` is gone from both ACLs; `anon_select` went `t` → `f`.

**Pass 2 — the SAME step again, now landing on the already-revoked state. This is what production
will experience (OBSERVED):**

```
REVOKE ALL ON TABLE public.v_promotion_suggestions FROM anon;   -> REVOKE
REVOKE ALL ON TABLE public.vw_account_balances     FROM anon;   -> REVOKE
                                                                   psql EXIT=0

         relname         | anon_select | relacl
-------------------------+-------------+-------------------------------------------------------------------
 v_promotion_suggestions | f           | {supabase_admin=arwdDxt/…,postgres=…,authenticated=…,service_role=…}
 vw_account_balances     | f           | {supabase_admin=arwdDxt/…,postgres=…,authenticated=…,service_role=…}
```

**Byte-identical to pass 1. No error, exit 0, and no change.** `REVOKE` on a privilege that is not
held is a successful no-op in PostgreSQL — it prints the same `REVOKE` tag either way.

**This is what tells the owner that "no change" is success, not a silent failure**: the command tag
is identical in both passes, so **the tag proves nothing on its own. The proof is the ACL read
afterwards.** The runbook step should therefore be `REVOKE` **followed by** a
`has_table_privilege('anon', …, 'SELECT')` read that must return `f` — and `f` is the success
condition whether or not the REVOKE had anything to do.

---

## 6 · What this rehearsal CANNOT tell the owner

Named plainly, because the runbook is written from the table above and an unnamed gap becomes a step
nobody rehearsed.

1. **Whether production has the 336–370 hole, or the 408 hole.** Everything in class (b) and (b′) —
   **8 of the 14 failures** — is conditional on questions only the owner can answer, read-only, on
   production. If both holes are closed, the expected failure set shrinks to the five (a)s plus 475.
   If they are open, the run stops at order 27 at the latest.
2. **Whether production's `ai_providers` / `ai_usage_routes` rows still look like the 2026-08-31
   dump.** The whole 460 finding rests on the dump's UUIDs, and the owner touched exactly this
   configuration by hand on 2026-09-07. Nothing here can see what that left behind. **One read-only
   query settles it:** `SELECT id, name, kind, is_active, capabilities FROM public.ai_providers;` —
   if neither `0fbe576a-…` nor `d30816a9-…` appears, 460 will abort.
3. **Data is a week stale** (R-1 §6.1): `persons` 832 here vs 4,851 on production, `audit_logs`
   91,548 vs 107,713, `sales_quotes` 170 vs 256, `journal_entries` **0** vs 15. Every timing figure
   in §2 is measured against that smaller data, so **the elapsed times are a floor, not an
   estimate** — the 31.8 s total is not what production will take. Migrations that scan `audit_logs`
   or `journal_entries` will take longer, and 487/488/489/491 barely exercised the accrual path at
   all because there are no journal entries here to touch.
4. **"Rows touched" is a whole-database tuple delta including system-catalogue churn** (§1), not a
   business-row count. A per-migration business-row figure would need a second rehearsal database
   with per-table snapshots; the brief said not to rebuild the rehearsal, and no sibling database was
   created. The trustworthy figures are the six in §3.
5. **Every failure after the first is hypothetical for production.** This run continued past failures
   on purpose. Production's `-v ON_ERROR_STOP=1` means **the run ends at order 15** (or 25, or 27)
   and nothing after it is attempted. The cascades in §4.5 are real *given* the run continues; they
   are not a prediction of production's sequence.
6. **Six migrations carry their own `BEGIN;` … `COMMIT;`** — orders 31 (466), 65 (512), 67 (513),
   70 (514), 71 (516), 73 (517). Under `--single-transaction` each produced, benignly:
   `WARNING: there is already a transaction in progress` … `WARNING: there is no transaction in
   progress`. **The atomicity envelope for these six is the file's own, not psql's**, and the file's
   `COMMIT;` ends the outer transaction early. It made no difference here because nothing follows the
   `COMMIT;` in any of the six, but the operator will see the warnings and must not read them as
   damage.
7. **`pg_cron`** — no longer a limitation for the 74 (see the correction in §2), but the six
   *existing* scheduled jobs on production still cannot be exercised from here, and
   `daily-birthday-notifications` (56 failures, 0 successes — CONTRACTS addendum §1) is untouched by
   this run.
8. **`pg_net` is absent** (R-1 §6.6). Nothing in the 74 appeared to need it, but that is an absence of
   evidence, not a test.
9. **The three extra runbook steps CONTRACTS names were not rehearsed here** except the view REVOKE
   (§5.2). The `ALTER DEFAULT PRIVILEGES` closure was **not** executed — §4.3 measures its
   consequences but does not rehearse the fix, and executing it would have changed the state the rest
   of this row was measuring. The deploy of the new build is likewise untouched.
10. **No application code was touched, so no `npm` / `tsc` / `build` was run.** The typecheck baseline
    of 70 is untouched by construction: this row added exactly one file, a `.md`.

---

## 7 · Recommendations (recorded, not acted on — outside this row's scope)

1. **Extend PREFLIGHT #1** with the 408 probe in §4.2. One read-only line; it closes a hole the
   current query provably cannot see.
2. **Move "close `ALTER DEFAULT PRIVILEGES … TO anon`" to BEFORE the 74**, not after (§4.3).
3. **449, 450, 452 and 460 need fixing before production runs them**, and it is the same fix in three
   of the four: assert a *relation*, not an absolute row count. 460 needs to address its rows by
   `(name, kind, base_url)` rather than by UUID. These are code changes belonging to whoever owns
   those migrations, not to this row.
4. **507 needs `FROM anon` added to its two `REVOKE`s**, or it aborts on production regardless of the
   default-ACL ordering decision.
5. **475's failure message should not say "the state changed underneath it"** when the real cause is
   that 460 never ran.
6. **The 26 anon-executable functions in §4.3 deserve their own sweep** once the default ACLs are
   closed. Closing the ACLs stops the bleeding for *future* objects; it does not revoke what the 74
   already granted.
7. **477 should derive its subject list from the catalogue at run time**, not carry 390 hard-coded
   REVOKEs generated from the test database.

---

## Housekeeping

- Worktree `D:\AfraKalaTest\wt-prodprep`, branch `feature/prodprep-20260908`.
- `git status --porcelain` at **start**, HEAD `aa9c3c06`:
  ```
   M src/routes/_app.gamification.admin.manual-metrics.tsx
  ?? supabase/migrations/20260908030000_520_staff_call_metrics_coverage_guard.sql
  ?? supabase/migrations/20260908034500_521_manual_guard_trigger_fn_least_privilege.sql
  ```
- `git status --porcelain` at **end**: the above, plus `?? docs/missions/prodprep/C1-results.md`
  which appeared mid-run, plus this file. **The modified `src/` file, the two untracked migrations
  and `C1-results.md` are other agents' work — not touched, not committed.** Only
  `docs/missions/prodprep/R4-R5-results.md` was created by this row.
- No `git stash`, no push, no merge, no rebase, no force, no reset.
- **HEAD moved between the run and this commit**, `aa9c3c06` → `f1d5dcf1`, via another agent's
  `fix(gamification)` commit which absorbed the modified `src/` file, the two untracked migrations
  and `C1-results.md` listed above. Expected coordination in a shared worktree, recorded per the
  shared-tree rule. HEAD did not move *during* the 74-migration run itself.
- **Databases written: `prod_rehearsal_20260908` only.** `afrakala` was read twice (§4.3, §5.1),
  read-only, `SELECT` statements only. No `afrakala_prod_clone*` was touched. The database name
  `postgres` was never used in any command.
- Files written outside the repo: scratchpad only
  (`…/scratchpad/r4/{run74.sh,list74.txt,results.tsv,logs/*.log,*.sql}`) and container `/tmp` files
  (`/tmp/r4_1.sql` … `/tmp/r4_74.sql`, `/tmp/r4_ledger.sql`, `/tmp/r5_probe.sql`,
  `/tmp/r5_460_sim.sql`, `/tmp/r5_views.sql`, `/tmp/prov.sql`, `/tmp/q1.sql` … `/tmp/q4.sql`).
- **State left for later rows:** the rehearsal is at ledger **639 / `20260907170000`**, with the 60
  successful migrations applied and `anon` REVOKEd on the two views (§5.2). The 14 failures each
  rolled back whole; nothing is half-applied.

## Verdict: **COMPLETE**

74/74 attempted and recorded, every failure verbatim and classified, both R-5 objects proven — one of
them proving the opposite of what the brief expected, which is the point of having run it.
