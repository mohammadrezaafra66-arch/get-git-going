# Final dry-run v6 — **COMPLETE**

All 43 migrations applied. All five RPC paths execute against real production data. The journal
balances. Business data is untouched.

Six attempts, and this is the one that finishes. Run 2026-09-01. Production was **never contacted**;
the live `afrakala` database was **not touched**; no tracked migration file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. Pre-flight sweep — re-derived for the 43-set

Not carried forward from v5. Recomputed against a fresh clone.

| pattern | result |
|---|---|
| **P1** `current_database()` guard | **11 — unchanged**: 337 338 339 341 342 344 345 346 347 391 392 |
| **P2** `ALTER DEFAULT PRIVILEGES` (executable) | **0** — the problem left with 393 |
| **P3** assertion vs production data volume | 418, 410 — both relaxed |
| **P4** hard-coded UUIDs | 391, 392, 402 — all eleven accounts absent on production; proofs deferred |
| **P5** `current_user` / `session_user` | **0** |
| **P6** self-contained `BEGIN;`/`COMMIT;` | **402 only** |

**Body-reference sweep — the class execution cannot catch.** Every `INSERT INTO t (cols…)` and
`UPDATE t SET col =` across all 43 files, checked against the clone's **2,563** live columns plus the
**22 columns** and **3 tables** the set creates. One hit, `392 document_status_history.result`, and it
is the known false positive: `result` appears only inside a `RAISE EXCEPTION` message string. **Clean.**

The CHECK-value half stays closed by 341 — `cheque_receivable`, `cheque_payable` and `settlement` are
all permitted, and are exactly what the set writes.

## 2. The run — 43 of 43

Fresh clone `afrakala_prod_clone7`, restored and verified at **221 / 20 / 823 / 622**, named to expose
the guard rather than hide it.

```
291 ✅ 337 ✅ 338 ✅ 339 ✅ 341 ✅ 342 ✅ 344 ✅ 345 ✅ 346 ✅ 347 ✅ 348 ✅
349 ✅ 350 ✅ 351 ✅ 352 ✅ 353 ✅ 354 ✅ 355 ✅ 356 ✅ 357 ✅
359 ✅ 360 ✅ 361 ✅ 362 ✅ 363 ✅ 364 ✅ 365 ✅ 366 ✅ 367 ✅ 368 ✅ 369 ✅
391 ⚠️ NOTICE  392 ⚠️ NOTICE  398 ✅ 400 ✅  402 ⚠️ NOTICE
403 ✅ 407 ✅ 408 ✅ 410 ✅ 417 ✅ 418 ✅ 419 ✅
```

**40 PASS, 3 with deferred-proof NOTICEs, 0 failures.**

### The three NOTICEs, and why they are not failures

| migration | deferred | why |
|---|---|---|
| **391** | A0 ×6, D ×3 | all five probe accounts absent on production |
| **392** | the whole proof block | same, and its **setup** INSERT hits `documents_uploaded_by_fkey` before any assertion is reached |
| **402** | the two-parent probe | `dual_documents` is empty on a fresh database, so the probe row has one parent and the CHECK correctly accepts it |

**391's B and C assertions were kept and they passed** — the DROP took effect, no trigger still points
at the dropped function, `post_receipt_accounting(uuid,uuid)` survives, and the policy is RESTRICTIVE
/ FOR ALL / TO authenticated with the house predicate. Those are the assertions that prove 391 did its
job, and none of them needs an account.

**One correction to the approval's arithmetic:** it named "the two identity-dependent D lines". There
are **three** — lines 238 (viewer), 244 (admin/accountant/manager) and 251 (sales). All three read row
counts under a probe account's JWT. All three were deferred, on the same measured ground.

Each deferred assertion now emits a NOTICE saying why in one line, so an operator reading the output
cannot mistake a deferred proof for a passed one:

```
391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred
392 PROOF DEFERRED -- probe account absent on production; policy created but proof deferred
402 PROBE SKIPPED: dual_documents is empty, so the probe had only one non-null parent…
```

## 3. The RPC calls — the check this rehearsal exists for

All inside `BEGIN … ROLLBACK`. Nothing persisted.

**Two things production does not have had to be created synthetically**, and this is itself a finding:

- **Zero persons on production carry an ASAN code.** `require_asan_code()` is called by
  `create_payment`, `create_dual_document` and `post_receipt_accounting`, and refuses without one.
- **Zero bank accounts exist on production**, and a bank account needs an `accounting_code` of its own.

Everything else — the customers, their person links, the amounts — is real production data.

| call | result | document number |
|---|---|---|
| **create_receipt(CHEQUE)** | ✅ **OK** | `RCP-1405-000001` |
| **create_receipt(BANK)** | ✅ OK | `RCP-1405-000002` |
| **create_payment** | ✅ OK | `PAY-1405-000001` |
| **create_dual_document** | ✅ OK | `DUAL-1405-000001` |
| **reverse_document(dual)** | ✅ OK | reversal entry written |
| reverse_document(receipt) | refused — `اعتبار مشتری برای برگشت این فیش کافی نیست` | **correct business rule**, not a defect: reversing would push the customer's credit below zero |

**What was written:**

```
payment_receipts = 3   payment_vouchers = 1   dual_documents = 1
document_numbers = 4   journal_entries  = 4
JOURNAL: 8 lines  debits=17000000  credits=17000000  BALANCED=t
```

**And the journal stayed balanced across a reversal:**

```
BEFORE reversal: 4 lines  D=7000000  C=7000000  balanced=t
AFTER  reversal: 6 lines  D=9000000  C=9000000  BALANCED=t
reversal entries written: 1
```

> **Migration 348's necessity is now proven rather than argued.** The cheque receipt was created with
> real production data and got document number `RCP-1405-000001`. Before 348, the
> `payment_receipts_receiver_exclusive_chk` constraint permitted only three shapes and a cheque — which
> has neither a destination bank account nor a receiver party — was none of them.

**And the v3 lesson is discharged.** A set can apply 43/43 and still ship functions that raise on first
call, because `CREATE OR REPLACE FUNCTION` does not resolve plpgsql bodies. These were called. They work.

## 4. End-state verification

**All 12 Live Ledger objects present:**

| | | | |
|---|---|---|---|
| `dual_documents` ✅ | `document_numbers` ✅ | `document_attachments` ✅ | `v_customer_credit_exposure` ✅ |
| `sales_quotes.accepted_at` ✅ | `create_receipt` ✅ | `create_payment` ✅ | `create_dual_document` ✅ |
| `reverse_document` ✅ | `hold_credit_for_quote` ✅ | `expire_stale_credit_holds` ✅ | **`jalali_year` ✅** |

**Backfill:** `accepted = 151, stamped = 151, still_null = 0` ✅

**Business data — unchanged:**

| | before | after |
|---|---|---|
| customers | 768 | **768** |
| products | 358 | **358** |
| sales_quotes | 170 | **170** |
| profiles | 36 | **36** |
| user_roles | 42 | **42** |

**Counts vs the live test database, every delta explained:**

| | test DB | migrated clone | delta |
|---|---|---|---|
| tables | 224 | **224** | — |
| views | 21 | **21** | — |
| functions | 840 | 839 | **−1** |
| policies | 618 | 628 | **+10** |

*Functions −1* is three minus two, not one missing thing:

| on test only | on clone only |
|---|---|
| `expire_stale_credit_holds(int, int)` | `expire_stale_credit_holds(int)` — a **different arity**; the 2-arg version comes from a migration outside this set |
| `tg_journal_entry_immutable()` | `post_receipt_journal(uuid)` — the neutralised stub; 391 drops its *trigger*, never claimed to drop the function |
| `tg_journal_line_immutable()` | |

> ⚠️ **Worth the owner's attention:** `tg_journal_entry_immutable` and `tg_journal_line_immutable` are
> **not** in this set. After this migration, posted journal entries on production will not be immutable
> the way they are on the test server. Nothing here depends on it, and production has 4 journal entries
> only in the rolled-back probe — it has **zero** in reality — but it is a real difference and belongs
> on the list with the deferred security series.

*Policies +10* are production-only policies on `categories`, `dynamic_entity_scores`,
`daily_capital_settings`, `inquiry_price_cache` and six more — a **pre-existing** divergence the test
database has since re-policied. This run did not create them.

---

## 5. THE PRODUCTION RUNBOOK

Database **`postgres`**, user `supabase_admin`, `PGPASSWORD` from the env file. In a maintenance window.

### Before you start

**1. Backup, and verify its md5.**
```
docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/pre-ledger.dump
```
A restore of it needs `--disable-triggers` (circular FKs) and therefore superuser. Proven restorable.

**2. Build the eleven guard scratch copies. This is the substitution, exactly as typed:**
```bash
for n in 337 338 339 341 342 344 345 346 347 391 392; do
  f=$(ls supabase/migrations/ | grep -E "_${n}_" | head -1)
  sed "s/current_database() <> 'afrakala'/current_database() NOT IN ('afrakala','postgres')/" \
      "supabase/migrations/$f" > "scratch/$f"
done
```
> **`'postgres'`, not a clone name.** The rehearsal used `afrakala_prod_clone7` in that slot; production
> is `postgres`. That one token is the only difference between what was tested and what you type.

**3. All fourteen scratch files are committed under `docs/migration/scratch/`, ready to run.**
Step 2's `sed` is documented so the substitution is understandable, but you do **not** need to run
it — the guard files below already carry `NOT IN ('afrakala','postgres')`. Verified: no scratch file
in this directory names a clone database.

| scratch file | what differs from the tracked migration |
|---|---|
| `337_SCRATCH_337_jalali_year_helper.sql` | db-name guard |
| `338_SCRATCH_338_document_numbers.sql` | db-name guard |
| `339_SCRATCH_339_lock_down_burn_document_number.sql` | db-name guard |
| `341_SCRATCH_341_cheque_kinds_and_doc_kind.sql` | db-name guard |
| `342_SCRATCH_342_document_attachments.sql` | db-name guard |
| `344_SCRATCH_344_seed_ledger_documents_module.sql` | db-name guard |
| `345_SCRATCH_345_writers_supply_doc_kind.sql` | db-name guard |
| `346_SCRATCH_346_gate_a_major_fixes.sql` | db-name guard |
| `347_SCRATCH_347_cheque_external_party_counterparties.sql` | db-name guard |
| `391_SCRATCH_391_drop_orphan_receipt_fn_and_viewer_restrict_attachments.sql` | db-name guard; **drops the trigger before the function** (the bare DROP has no CASCADE and aborts); A0 ×6 and D ×3 downgraded to NOTICE. **B ×2 and C ×6 are kept and must pass.** |
| `392_SCRATCH_392_viewer_restrict_document_status_history.sql` | db-name guard; the proof block exits early when the probe account is absent. **Its two DDL statements — DROP POLICY / CREATE POLICY — still run.** |
| `402_FIXED_idempotent_and_guarded_probe.sql` | idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before each add) + the two-parent probe skips when `dual_documents` is empty |
| `410_SCRATCH_410_backfill_migration_ledger.sql` | `IF v_ledger < 598` → `IF v_ledger < 1` |
| `418_SCRATCH_418_backfill_accepted_at_from_the_audit_log.sql` | `IF _total <> 9` → `IF _total < 1`; `IF _filled <> 9 OR _null <> 0` → `IF _null <> 0` |

> `393_FIXED_both_grantors.sql` is also in that directory. **Migration 393 is NOT in the 43.** It was
> removed with the other three security gates under Option A. The file is kept only because it
> documents the `FOR ROLE postgres` finding, which the deferred security mission will need.

### The order — all 43 migrations, by filename

Run in exactly this order. Each line is

```
psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction -f <file>
```

**except number 36, which runs WITHOUT `--single-transaction`.**

```
 1.  20260805113000_291_asan_export_module.sql                               
 2.  20260818151000_337_jalali_year_helper.sql                                 <- scratch: db-name guard
 3.  20260818152000_338_document_numbers.sql                                   <- scratch: db-name guard
 4.  20260818153000_339_lock_down_burn_document_number.sql                     <- scratch: db-name guard
 5.  20260818155000_341_cheque_kinds_and_doc_kind.sql                          <- scratch: db-name guard
 6.  20260818156000_342_document_attachments.sql                               <- scratch: db-name guard
 7.  20260818158000_344_seed_ledger_documents_module.sql                       <- scratch: db-name guard
 8.  20260818160000_345_writers_supply_doc_kind.sql                            <- scratch: db-name guard
 9.  20260818161000_346_gate_a_major_fixes.sql                                 <- scratch: db-name guard
10.  20260818170000_347_cheque_external_party_counterparties.sql               <- scratch: db-name guard
11.  20260818180000_348_receipt_cheque_receiver_check.sql                    
12.  20260818181000_349_create_receipt.sql                                   
13.  20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql         
14.  20260819091000_351_create_receipt_cash_account_and_date_bounds.sql      
15.  20260819092000_352_og13_remaining_surfaces.sql                          
16.  20260819093000_353_block_receipt_delete_when_posted.sql                 
17.  20260819100000_354_payment_voucher_endorsed_cheque_ref.sql              
18.  20260819101000_355_create_payment.sql                                   
19.  20260819110000_356_endorsement_consumed_once.sql                        
20.  20260819111000_357_block_voucher_delete_when_posted.sql                 
21.  20260819120000_359_cheque_does_not_move_bank_balance.sql                
22.  20260819130000_360_dual_documents_table.sql                             
23.  20260819131000_361_create_dual_document.sql                             
24.  20260819140000_362_dual_document_no_fee.sql                             
25.  20260819150000_363_reverse_document_schema.sql                          
26.  20260819151000_364_reverse_document.sql                                 
27.  20260819160000_365_reverse_document_gate_a.sql                          
28.  20260819170000_366_asan_journal_export_doc_kind.sql                     
29.  20260819180000_367_asan_export_filters.sql                              
30.  20260821120000_368_close_payment_voucher_insert_path.sql                
31.  20260821121000_369_ledger_derived_balance_readers.sql                   
32.  20260825180000_391_drop_orphan_receipt_fn_and_viewer_restrict_attachments.sql  <- scratch: guard + drop trigger first + A0/D proofs deferred
33.  20260826090000_392_viewer_restrict_document_status_history.sql            <- scratch: guard + proof block deferred
34.  20260827000000_398_receipt_document_extraction_can_persist.sql          
35.  20260827020000_400_lock_amount_and_party_after_posting.sql              
36.  20260827040000_402_document_attachments_real_fks.sql                      <- scratch: idempotent DDL + guarded probe -- RUN WITHOUT --single-transaction
37.  20260827050000_403_create_rpcs_accept_attachments.sql                   
38.  20260827090000_407_credit_is_a_revolving_ceiling.sql                    
39.  20260827100000_408_quote_reserves_ceiling_and_stale_holds_expire.sql    
40.  20260827120000_410_backfill_migration_ledger.sql                          <- scratch: ledger floor relaxed (598 -> 1)
41.  20260831170000_417_sales_quotes_records_when_it_was_accepted.sql        
42.  20260831190000_418_backfill_accepted_at_from_the_audit_log.sql            <- scratch: accepted-quote count relaxed (9 -> 1)
43.  20260831210000_419_receivables_due_date_from_settlement_terms.sql       
```

**The ELEVEN that carry the `current_database()` guard**, by number:
**337, 338, 339, 341, 342, 344, 345, 346, 347, 391, 392.**
Every one needs the scratch copy built in step 2. There is no twelfth — the whole 43 were swept.

**Number 36 — `20260827040000_402_document_attachments_real_fks.sql` — runs plain:**

```
psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f scratch/20260827040000_402_document_attachments_real_fks.sql
```

**402 is the ONLY one of the 43 that needs this**, and the reason matters: it is the only file in the
set carrying its own `BEGIN;`/`COMMIT;`. Under `--single-transaction` that commit ends the outer
transaction early, so an error later in the same file reports FAILURE with the schema **already
changed** — and a re-run then dies on `column "receipt_id" already exists`. Measured across all 43
files: one, and only one.

**Step 402 runs plain, no `--single-transaction`.** It is the only one of the 43 that carries its own
`BEGIN;`/`COMMIT;`; under `--single-transaction` its commit ends the outer transaction early and a later
error would report failure with the schema already changed. Measured: it is the only one.

### Manual steps between migrations

**None.** Specifically, no backfill call is needed before 418: all 151 accepted quotes have an
acceptance event in `audit_logs`, so the backfill resolves every one and invents nothing.
`person_backfill_existing` belongs to the 230/231 boundary, below this range.

### NOTICEs that are expected, not failures

```
391 A0 DEFERRED / 391 D DEFERRED  -- probe account absent on production
392 PROOF DEFERRED               -- same
402 PROBE SKIPPED                -- dual_documents empty on a fresh database
"policy … does not exist, skipping"      -- DROP POLICY IF EXISTS on first run
"column … already exists, skipping"      -- 402's idempotent guards
```

Anything **not** on that list is a real failure. Stop.

### Afterwards

```sql
-- 1. all twelve objects
SELECT to_regclass('public.dual_documents'), to_regclass('public.document_numbers'),
       to_regclass('public.document_attachments'), to_regclass('public.v_customer_credit_exposure'),
       to_regproc('public.create_receipt'), to_regproc('public.create_payment'),
       to_regproc('public.create_dual_document'), to_regproc('public.reverse_document'),
       to_regproc('public.hold_credit_for_quote'), to_regproc('public.expire_stale_credit_holds'),
       to_regproc('public.jalali_year');
-- 2. the backfill
SELECT count(*) AS accepted, count(accepted_at) AS stamped
FROM public.sales_quotes WHERE status='accepted';        -- expect 151 | 151
-- 3. business data untouched
SELECT (SELECT count(*) FROM customers), (SELECT count(*) FROM products),
       (SELECT count(*) FROM sales_quotes), (SELECT count(*) FROM profiles),
       (SELECT count(*) FROM user_roles);                -- expect 768 358 170 36 42
```

Then restart the PostgREST container — it caches RPC signatures at startup.

### Reproducing the RPC smoke test on production — the exact fixtures

The migration installs the module; this is how to prove it works, the same way the rehearsal did.
**Everything below is inside `BEGIN … ROLLBACK` and persists nothing.**

Two fixtures must be built synthetically **because production has neither**, and that is the whole
reason this section exists rather than a one-line "call the RPCs":

| what | why it must be synthetic |
|---|---|
| **an ASAN code** on the person behind each customer used | production has **zero**. `require_asan_code(person_id)` reads `person_identifiers` where `kind = 'asan_person_code'` and raises `کد آسان برای «X» ثبت نشده است` without one. It is called by `create_payment`, `create_dual_document` and `post_receipt_accounting`. |
| **a bank account with an `accounting_code`** | production has **zero** `bank_accounts`. Without the code the RPC raises `کد حسابداری برای حساب «X» ثبت نشده است`. The **cheque** channel needs no bank account; the **bank** channel does. |

Everything else — the customers, their `person_id` links, the amounts — is real production data.

```sql
BEGIN;
-- act as a real admin
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id::text FROM public.user_roles WHERE role='admin' LIMIT 1),
                    'role','authenticated')::text, true);

-- two REAL customers that have a person link
--   \set c1 / c2 by hand, or use a DO block as the rehearsal did
-- synthetic fixture 1: ASAN codes for their persons
INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized)
SELECT c.person_id, 'asan_person_code', '900001', '900001'
FROM public.customers c WHERE c.person_id IS NOT NULL ORDER BY c.created_at LIMIT 2;

-- synthetic fixture 2: a bank account WITH an accounting code
INSERT INTO public.bank_accounts (title, bank_name, account_type, currency,
                                  is_active, opening_balance, accounting_code)
VALUES ('smoke test', 'ملت', 'bank', 'IRR', true, 0, '110001');
--   account_type must be 'bank' or 'cash' -- the CHECK permits nothing else.

-- then call, capturing the RECORD each one returns (they are not uuids):
--   create_receipt      -> TABLE(receipt_id uuid, document_number text, journal_entry_id uuid, new_balance numeric)
--   create_dual_document-> TABLE(document_id uuid, document_number text, journal_entry_id uuid)
--   reverse_document    -> uuid
SELECT * FROM public.create_receipt('cheque', <customer>, 5000000, current_date, '10:00',
         NULL, 'SMOKE-CHQ', NULL, 'CHQ-1', current_date + 30, 'ملت', 'smoke');
SELECT * FROM public.create_receipt('bank', <customer>, 7000000, current_date, '11:00',
         <bank_account_id>, 'SMOKE-BNK', 'ملت', NULL, NULL, NULL, 'smoke');
SELECT * FROM public.create_payment('bank','customer', <customer2>, 3000000, current_date,
         <bank_account_id>, 'SMOKE-PAY', NULL,NULL,NULL,NULL,NULL,'smoke');
SELECT * FROM public.create_dual_document('customer', <customer>, 'customer', <customer2>,
         2000000, current_date, 'SMOKE-DUAL', 'smoke');
SELECT public.reverse_document('dual', <document_id from the call above>, 'smoke reversal');

-- and the only assertion that matters:
SELECT count(*) AS lines, sum(debit) AS d, sum(credit) AS c, sum(debit)=sum(credit) AS balanced
FROM public.journal_lines;
ROLLBACK;
```

**What the rehearsal got, for comparison:**

```
create_receipt(CHEQUE)   -> RCP-1405-000001
create_receipt(BANK)     -> RCP-1405-000002
create_payment           -> PAY-1405-000001
create_dual_document     -> DUAL-1405-000001
reverse_document(dual)   -> reversal entry written
JOURNAL: 8 lines  debits=17000000  credits=17000000  BALANCED=t
```

`reverse_document('receipt', …)` was **refused** with `اعتبار مشتری برای برگشت این فیش کافی نیست`.
That is the credit rule working, not a defect — reversing that receipt would push the customer's
credit below zero. Expect the same.

### Before anyone can actually use the module

The migration installs it; two data steps make it usable, and neither is a migration:

1. **ASAN codes.** Zero persons on production have one, and `require_asan_code()` refuses every
   document without it. Enter codes for the persons who will appear on documents.
2. **Bank accounts.** Production has zero, and each needs its own `accounting_code`. The cheque channel
   does not need one; the bank channel does.

## 6. Not verified

- **The receipt reversal path.** `reverse_document('receipt', …)` refused with a credit rule that is
  working correctly, so the receipt branch of that function was not exercised end to end. The dual
  branch was, and the journal stayed balanced.
- **The deferred proofs** in 391, 392 and 402 — unrunnable on production by construction, not skipped
  for convenience.
- **Anything about production itself.** Not contacted.

## 7. Carried forward, on the owner's list

- **The security series 370–401**, 24 migrations, deliberately deferred with Option A. The anon
  exposure they close is open on production today; this set neither opens nor closes it.
- **`tg_journal_entry_immutable` / `tg_journal_line_immutable`** — outside this set, so posted journal
  entries will not be immutable on production.

---

`afrakala_prod_clone7` is left fully migrated for inspection. The live `afrakala` database was not
touched, and **production was never contacted**.
