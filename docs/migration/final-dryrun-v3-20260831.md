# Final dry-run v3 — **PARTIAL / HALTED AT PRE-FLIGHT**

**The run was not executed, and it should not have been.** The pre-flight sweep found a defect that
a green run would have hidden: the migration list is missing a prerequisite, and the migrations that
depend on it **apply cleanly and fail only when the feature is first used**.

Had this run gone ahead, all 42 migrations would have reported success and production would have
shipped a `create_receipt` and a `create_payment` that raise `42703` the first time an accountant
records a receipt.

This is the sweep doing exactly what it was added to do.

Run 2026-09-01. Production was **never contacted**; the live `afrakala` database was **not touched**;
no tracked migration file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. Pre-flight sweep

Clone `afrakala_prod_clone4`, pristine restore, verified at **221 / 20 / 823 / 622** — production
exactly. Dump re-verified before use: 29,725,089 bytes, md5 `41830357199bf4fe743e824fee89f3f5`.

### Mechanical patterns

| pattern | result | status |
|---|---|---|
| **P1** `current_database()` guard | exactly seven in the set: **337 338 342 344 346 391 392** | ✅ list confirmed |
| **P2** `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` | **only 393** (8 executable statements). 379/380 matched only in comments — 0 executable | 🔴 fixed, see §2 |
| **P3** assertion against production data volume | **only 418** (accepted quotes) and **410** (ledger rows). The coarse first scan flagged 33 migrations; narrowed to counts of *business* tables it is these two | ✅ both already relaxed |
| **P4** hard-coded UUIDs | 391 (5), 392 (6), 402 (1) | ✅ all known, probes deferred |
| **P5** `current_user` / `session_user` | **none, anywhere in the set** | ✅ no risk |
| **P6** self-contained `BEGIN;`/`COMMIT;` | **only 402** | ✅ script marks it |

### 🔴 What the judgment sweep found — omitted prerequisites

| migration | pattern | would it fail on production | fix |
|---|---|---|---|
| **341** *(not in the list)* | **six listed migrations write a column and two CHECK values that production does not have** | **Yes — but silently.** The migrations apply; the functions raise at first call | add 341 before 349 |
| **339** *(not in the list)* | 338 ships `burn_document_number` as SECURITY DEFINER with no REVOKE, so EXECUTE falls to PUBLIC. 339 exists solely to close it | No abort — a live privilege hole on the numbering ledger | add 339 after 338 |
| **345, 347** *(not in the list)* | exist to keep the other ledger writers and `validate_journal_line_ref` consistent with 341 | not independently, but they are 341's siblings | add with 341 |

---

## 2. The blocker, verified first-hand

Every claim below was re-measured against the clone by me, not accepted from the sweep.

### The column and the CHECK values do not exist on production

```sql
SELECT string_agg(column_name,', ') FROM information_schema.columns
WHERE table_schema='public' AND table_name='journal_entries';
```
```
id, source_type, source_id, entry_date, description, status, posted_by,
posted_at, created_at, payer_accounting_code, receiver_accounting_code
```
**Eleven columns, and `doc_kind` is not among them.**

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.journal_lines'::regclass AND conname LIKE '%account_kind%';
```
```
CHECK (account_kind = ANY (ARRAY['customer_credit','bank','external_party',
                                 'invoice_ar','clearing','other','supplier_payable']))
```
**Seven permitted values. Neither `cheque_receivable` nor `cheque_payable` is one.**

### Six migrations in the run list depend on both

| migration | `doc_kind` refs | cheque-kind refs |
|---|---|---|
| 349 `create_receipt` | 2 | 4 |
| 351 | 2 | 4 |
| 355 `create_payment` | 4 | 8 |
| 356 | 2 | 5 |
| 364 `reverse_document` | 4 | 4 |
| **403** — the **last** definition of `create_receipt` and `create_payment` | **5** | **8** |

403 being last matters: nothing later repairs them.

### Only 341 supplies either, and it is not in the list

```
$ grep -rlE "ADD COLUMN( IF NOT EXISTS)? doc_kind" supabase/migrations/
20260818155000_341_cheque_kinds_and_doc_kind.sql
```

Not applied on production either — the ledger's high-water mark is `20260811180000`, and 339, 341,
345, 347 and 348 are all later and all absent.

### Why a green run would have lied — demonstrated

The crux. `CREATE OR REPLACE FUNCTION` does **not** name-resolve a plpgsql body. Proven on the clone
inside `BEGIN … ROLLBACK`:

```
CREATE succeeded even though journal_entries has no doc_kind column
CALL failed: 42703 / column "doc_kind" of relation "journal_entries" does not exist
ROLLBACK
```

So every one of those six migrations applies without complaint. **The run reports 42/42 success.**
The failure surfaces the first time someone records a cheque receipt — in production, in front of a
user, with no migration log to blame.

**This is the first defect in this project that execution could not have caught.** v1 and v2 both
died loudly at a step. This one would have passed.

### 341 is safe to add

- widens `journal_lines_account_kind_chk` to include the two cheque kinds
- `CREATE OR REPLACE validate_journal_line_ref()`
- adds `doc_kind` nullable, backfills it by `source_type` (4 UPDATEs), adds its CHECK, then
  `SET NOT NULL` and `DROP DEFAULT` — an order that cannot fail on legacy rows
- **production has 0 `journal_entries`**, so the backfill touches nothing at all
- it carries the `current_database()` guard, so it needs the same workaround as the other seven

### 339 is a privilege hole, not an abort

338 issues exactly two privilege statements, and both name the wrong function:

```sql
REVOKE ALL ON FUNCTION public.assign_document_number(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_document_number(text, uuid) TO authenticated;
```

`grep -c "REVOKE.*burn_document_number"` on 338 → **0**. So `burn_document_number`, a
`SECURITY DEFINER` function that voids issued document numbers, would ship with EXECUTE available to
PUBLIC. 339's own header calls this a defect raised in review of 338. Nothing in the run asserts it,
so nothing would have caught it either.

---

## 3. The 393 fix — done, and pre-flight proven

The v2 blocker is resolved. `docs/migration/scratch/393_FIXED_both_grantors.sql`.

`ALTER DEFAULT PRIVILEGES` without `FOR ROLE` edits only the **executing role's** rows. 393 runs as
`supabase_admin`; production carries rows from **two** grantors, and 393's own check C2 scans every
grantor — so it clears half and then fails itself. It also never revoked TABLES or SEQUENCES at all,
which gates 378/379/380 require.

Six statements added (three implicit, three `FOR ROLE postgres`). Measured on the clone:

```
BEFORE  393-C2 rows=2   378/379/380 rows=4
AFTER   393-C2 rows=0   378/379/380 rows=0
storage schema anon rows left intact: 3  (deliberately untouched)
PRE-FLIGHT PASS: the 393 fix satisfies C2 AND all three gates
ROLLBACK
```

**For the operator, and this is why the scratch carries a warning block:** the six lines are not
duplicates and must not be "simplified" back to one. The scratch spells out the two-grantor table
and quotes C2's grantor-blind `WHERE` clause so the reason is visible at the point of edit.
`storage`'s anon rows are left alone on purpose — no check in this set looks at `storage`, and
Supabase's storage layer legitimately uses anon.

## 4. Run log

**Not executed.** Halting before the run was the correct action: the sweep established that a
successful run would have produced a false green.

## 5. Not verified

- **All 21 steps.** Nothing was executed against clone4.
- **A3** (391's `document_type` probe). Its precondition was measured in v2 — all five columns
  present at 391's point in the sequence — but 391 has still never executed in a clean pass.
- **The 151-row `accepted_at` backfill** in a clean pass.
- **Whether adding 341/345/347 introduces anything new.** They have not been run against production
  data. 341 is read as safe from its text and from production having 0 journal entries; that is
  analysis, not measurement.
- **348.** It appears in the same omitted family but nothing in the run list references it. Whether
  it is needed is undetermined.
- **Anything about production.** Not contacted.

## 6. Unresolved

**The migration list is incomplete.** It needs at least **341** (hard requirement — six listed
migrations are broken without it) and **339** (privilege hole), plus **345** and **347** which exist
to keep 341's siblings consistent. **348** is undetermined.

That is four to five additions, on top of the two corrections already made across v1 and v2. The
guard list grows from seven to roughly eleven, since 339, 341, 345 and 347 all carry it (348 does
not).

**I did not add them and run.** The instruction was to sweep, report, then run — and what the sweep
found changes the run's composition, not just one step of it. Choosing which prerequisites belong in
a production migration is the owner's call, not something to decide silently inside a rehearsal.

## 7. What this run established

Three attempts, three classes of defect, and the pattern is now clear enough to state:

| | halted at | defect | could execution have caught it? |
|---|---|---|---|
| v1 | step 1 | 337's `current_database()` guard | yes — loudly |
| v2 | step 9 | 393's missing `FOR ROLE postgres` | yes — loudly |
| **v3** | **pre-flight** | **341 omitted; six migrations silently broken** | **no — the run would have gone green** |

Every one of the three was findable by reading against production's real state, and none was visible
on the test database. The sweep earned its place: it caught the only one execution could not.

**Recommendation before v4:** decide the final migration list (341, 339, 345, 347, and a verdict on
348), then re-run the sweep against that list before executing it. The sweep is cheap; a false green
on production is not.

---

`afrakala_prod_clone4` is left pristine and un-migrated, ready for the corrected run.
`afrakala_prod_clone` and `afrakala_prod_clone3` remain from earlier rehearsals.
The live `afrakala` database was not touched, and **production was never contacted**.
