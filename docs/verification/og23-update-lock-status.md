# OG-23 — is UPDATE still open on posted documents?

**Verdict: no. It was closed by migration 400 on 2026-08-27. No migration was written.**

The brief states that "DELETE is blocked after posting on three tables, but UPDATE is still open on
all three." That was true when it was written. It is not true of this database now.

> **Scope: the TEST database only** (`afrakala` on `afrakala-lan-db`). Nothing here is a claim
> about production, which was not touched, read, or contacted.

Verified 2026-08-31. Every probe ran inside `BEGIN … ROLLBACK`; nothing was written and no posted
document was created.

---

## The three tables, and what actually guards them

`migration 20260827020000_400_lock_amount_and_party_after_posting.sql` — applied, and recorded in
`supabase_migrations.schema_migrations` as `20260827020000`.

Each table carries **two** triggers, not one:

| table | DELETE guard | UPDATE guard |
|---|---|---|
| `payment_receipts` | `trg_payment_receipts_block_delete_when_posted` (BEFORE D) | `trg_payment_receipts_lock_when_posted` (BEFORE U) |
| `payment_vouchers` | `trg_payment_vouchers_block_delete_when_posted` (BEFORE D) | `trg_payment_vouchers_lock_when_posted` (BEFORE U) |
| `dual_documents` | `trg_dual_documents_block_delete_when_posted` (BEFORE D) | `trg_dual_documents_lock_when_posted` (BEFORE U) |

All three UPDATE triggers call one shared, parameterised function,
`public.tg_lock_columns_when_posted`, whose locked-column list is passed per table in `TG_ARGV`.

## The question the brief said not to guess: which columns freeze

The brief was right that this must not be assumed, and 400 did not assume it either. The lock is
**per column, not per row**, and the "posted" predicate differs per table because the tables are
not uniform:

| table | "posted" means | locked columns |
|---|---|---|
| `payment_receipts` | `posting_status = 'posted'` | `amount`, `customer_id`, `customer_person_id`, `receiver_party_id`, `receiver_party_person_id`, `source_bank_account_id`, `destination_bank_account_id` |
| `payment_vouchers` | `status = 'approved'` | `amount`, `payee_supplier_id`, `payee_customer_id`, `payee_party_id`, `payee_person_id`, `source_bank_account_id` |
| `dual_documents` | `status = 'approved'` | `amount`, `payer_customer_id`, `payer_supplier_id`, `payer_party_id`, `beneficiary_customer_id`, `beneficiary_supplier_id`, `beneficiary_party_id` |

**`status` is deliberately NOT locked** on any of them — the function's own `HINT` says so — because
a document's lifecycle continues after posting: a posted receipt can still be rejected.

Two details in that function are worth keeping visible, because both are the kind of thing that is
easy to get subtly wrong:

```sql
-- Only a row that is ALREADY posted is protected. A row being posted right now is still
-- editable in that same statement, which is what lets the posting flow stamp its own state.
IF v_old ->> v_state_col IS DISTINCT FROM v_posted_val THEN RETURN NEW; END IF;
…
-- IS DISTINCT FROM, never `<>`: a column moving to or from NULL is a real change, and `<>`
-- returns NULL for it, which reads as "no change" and would let a counterparty be cleared.
```

The second one matters: with `<>` a posted receipt's counterparty could have been set to NULL and
the guard would have read that as no change at all.

## Live evidence — 7 assertions, all inside `BEGIN … ROLLBACK`

Fixtures available: 22 posted receipts, 12 approved vouchers, 7 approved dual documents.

```
R1 PASS  posted receipt amount REJECTED (سند ثبت‌شده است؛ تغییر amount مجاز نیست …)
R2 PASS  status change on a posted receipt still ACCEPTED
R3 PASS  posted receipt DELETE rejected
V1 PASS  approved voucher amount REJECTED
V2 PASS  a non-locked column on an approved voucher still ACCEPTED
D1 PASS  approved dual amount REJECTED
J1 PASS  posted journal entry is fully immutable (whole row, not per column)
---- OG-23 LIVE: 7 passed, 0 failed ----
```

R1, V1 and D1 all raise `SQLSTATE 42501`. R2 and V2 are the other half of the exit condition — a
legitimate post-posting change is still accepted, so the lock freezes the right things and not the
document itself.

J1 records a difference worth knowing: `journal_entries` and `journal_lines` are locked
**whole-row** by `tg_journal_entry_immutable` / `tg_journal_line_immutable`, not per column. The
ledger is stricter than the documents that feed it, which is the correct asymmetry.

## Forced disturbance

Dropped `trg_payment_receipts_lock_when_posted` inside the transaction and repeated R1:

```
R1 RED    without the trigger the posted amount moved 10000.00 -> 10001.00
R3 still green: DELETE is a separate trigger and still blocks
---- DISTURBED: 1 red (want exactly R1) ----
```

The disturbance is **specific**: removing the UPDATE lock breaks exactly the UPDATE assertion and
leaves the DELETE assertion standing, which shows the two guards are independent and that R1 was
measuring the trigger rather than some other mechanism. Trigger confirmed present again after
rollback.

## Not verified

- **Enforcement through PostgREST.** All probes are at the SQL layer. Since these are `BEFORE`
  triggers rather than RPC-side checks, a `PATCH /payment_receipts` cannot route around them — that
  is 400's stated design — but no HTTP request was actually issued.
- **The other tables.** Only the three OG-23 tables plus the two ledger tables were examined. Other
  tables may have posting-like semantics with no lock; that was not in scope and was not surveyed.
- **Production.** Not touched. Nothing here describes it.
