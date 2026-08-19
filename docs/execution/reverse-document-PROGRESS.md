# reverse_document — OG-14 — PROGRESS

Not a numbered phase. Owner schedule: after phase 4, before phase 6. Phase 5 was not started.

## HANDOFF STATE

```
Mission:              BUILD reverse_document (OG-14)
Status:               complete — awaiting independent Gate A
Branch:               feature/reverse-document
Base:                 staging @ b25072b6
Blocked by:           OG-22 open (role width) — implemented on the wider gate
Migrations applied:   363, 364
REST restarted after: yes after each
Backup taken:         D:\AfraKalaBackups\pre-reverse-document-20260819.dump (16,932,895 bytes)
Typecheck:            70 / 70 baseline (D14)
Last commit:          —
PR:                   —
Leftover test data:   payment_receipts tracking OG14-CONC (reversed); journal_entries 1→3
                      (original seed + conc pair). Bank export does not list OG14-CONC.
                      Credit for that customer 0.00. Cannot delete posted journals (343).
```

## Pre-flight

- [x] `git fetch` / `git switch staging` / `git pull --ff-only origin staging` → `b25072b6`
- [x] `git switch -c feature/reverse-document`
- [x] Backup taken and path recorded above
- [x] Live catalogue measured (never repo files) for create_receipt / create_payment /
      create_dual_document, the three delete guards, both immutability triggers
- [x] Rollback files written before each forward migration

## Design answers — recorded before any CREATE

Measured 2026-08-19 on `afrakala`. Census: dual_documents=0, journal_entries=1,
journal_lines=2, payment_receipts=7, payment_vouchers=0, public_functions=840,
reverse_document=0.

### What is reversible, and in A4's terms

A4 is "one RPC per branch, in one transaction" for **creation**, so a client cannot
half-complete a document. Reversal is one operation on one already-posted document.
**One function** `reverse_document(p_doc_kind, p_source_id, p_reason)` with internal
dispatch on `receipt | payment | dual`. Three public RPCs would be three doors onto
the same rule; the audit spec and the existing contract already name one function and
one action `document_reversed`.

### What the reversal document looks like

A **new** `journal_entries` row, `status='posted'`, debits and credits swapped from the
original lines, **same `account_kind` / `account_ref_id`** (T13 constraint 1 — no new
kind→table mapping). Own document number via `assign_document_number` on a **new**
`source_id` (UNIQUE `(source_type, source_id)` forbids reusing the original). Original
journal row is not touched (343).

**`doc_kind` of the new row = the original's `doc_kind`** (`receipt` / `payment` /
`dual`). Not `other`: A1 dropped the DEFAULT so an unclassifiable value vanishes from
every export menu; phase 5's journal export reads `doc_kind` and an `other` reversal
would be a document the accountant never sees. Same kind means the pair is visible
together. Recorded as a technical reading of A1, not an owner decision.

Link: `journal_entries.reverses_entry_id` on the **new** row, UNIQUE, FK to the original.

### Side effects

| Effect | Measurement | Reversal |
|---|---|---|
| Receipt `increase_credit` | amount `<= 0` refused; no `decrease_credit` exists; ledger CHECK allows `adjustment` | Subtract the receipt amount from `customer_credit_balance` under `FOR UPDATE`; ledger row `transaction_type='adjustment'` |
| `payment_receipt_links` | `vw` / `get_receivable_detail` subtract allocations from proforma outstanding | `DELETE` the links for that receipt (not the receipt). Outstanding restored. |
| Endorsement / B1 | UNIQUE `payment_vouchers (endorsed_receipt_id) WHERE IS NOT NULL` is unconditional; `create_payment` EXISTS matches it. 0 endorsed rows today. | `payment_vouchers.reversed_at` set; unique index and EXISTS both require `reversed_at IS NULL`. `endorsed_receipt_id` is **kept** on the original voucher (audit of which cheque). Cheque is usable again. If this failed the mission would have failed. |
| `document_numbers` | original number identifies the original document | Original **left**. Reversal mints a new number. Not burned (burn is for delete). |
| Bank cash readers | `vw_account_balances`, `get_account_ledger`, `asan_list_bank_deposit_export` read **source tables**, not journal_lines | Exclude `reversed_at IS NOT NULL`. A journal-only reversal would leave those readers confidently wrong. **`asan_list_journal_export` is not modified** (phase 5). It already selects journal rows by `doc_kind`, so the pair appears. |

### Can a reversal be reversed?

**No.** There is no source row for the reversing journal (`source_id` is a numbering uuid,
not a receipt/voucher/dual id). A second call on the original sees `reversed_at` and
raises `P0001`. Concurrent seconds: `FOR UPDATE` on the source row.

### Who may reverse?

Same creation gate: `admin, accountant, manager` (OG-13 answer (a)). Reversal is stronger.
**OG-22 raised** — should manager be excluded? Not decided here. Continues on the wider
gate. `sales` → `42501`.

### Reason mandatory?

**Yes.** D11's audit trail without a why is incomplete. Empty/whitespace → `22023`. Stored
on the source row (`reversal_reason`) and in `audit_logs.diff`. Never in a Persian message
as an English identifier; never Asan / national id / phone.

### What the new rule permits that it should not (tried)

Reverse twice; reverse a reversal (no source row); two sessions; reverse using **posted
lines** even if the party columns were later edited (we copy `journal_lines`, not live
party FKs). Do not `SET session_replication_role`. Do not disable 343 or the delete guards.

## Contract contradictions (`rpc-contracts.md` §4 vs live)

| # | Contract | Live | Decision |
|---|---|---|---|
| R1 | `reverse_document(p_doc_kind text, p_source_id uuid, p_reason text) RETURNS uuid` | function count=0 | Implement this signature. Return the **new** journal entry id. |
| R2 | "linked to the original" | no `reverses_entry_id` column | Add the column on `journal_entries` (new row only). |
| R3 | silent on side effects | credit, links, B1 unique index, bank views all exist | Behaviour specified in the table above. |
| R4 | silent on `doc_kind` of the reversing entry | CHECK is receipt/payment/dual/purchase_payment/settlement/other | Same as original; never `other`. |
| R5 | `assign_document_number` `p_doc_type ∈ receipt\|payment\|dual` | matches | Reversal numbers use those three; no fourth type. |
| R6 | create RPCs: retry is not safe | each call mints a new source_id | Same for reverse: no idempotency key. A second call is a refusal, not a replay. |

## Owner-Gate

**OG-22** — 2026-08-19 — OPEN. May `manager` reverse a posted document, or only
`admin`+`accountant`? Continued with OG-13's wider gate (`admin, accountant, manager`).
Does not block implementation.

## §H before 363

1. **What writes or depends?** `journal_entries` writers: create_receipt, create_payment,
   create_dual_document, plus older `post_receipt_accounting` / `post_mutual_settlement` /
   `pay_purchase_with_voucher`. Adding a nullable `reverses_entry_id` does not change their
   INSERT lists. Unique endorsement index: only `create_payment` reads `endorsed_receipt_id`.
   0 vouchers today, so the stricter-then-looser predicate (unconditional → "not reversed")
   migrates nothing.
2. **What will read the new rows?** Listed in Side effects. Journal export untouched.
3. **What does the rule permit that it should not?** A reversed voucher with `endorsed_receipt_id`
   still set would keep the cheque locked if the unique index stayed unconditional — that is
   why the index moves with the column.

## §H before 364

1. **What writes or depends?** Replacing `create_payment` (live = 356 body): one EXISTS
   predicate and the Persian sentence that currently says reversal does not exist (a lie the
   moment 364 lands). Views `vw_account_balances` and `get_account_ledger` (live = 359).
   `asan_list_bank_deposit_export` (live = 350).
2. **Readers of a reversal pair:** journal-line sums net to zero; source-table bank readers
   ignore the reversed original; credit ledger has the adjustment; proforma outstanding has
   no links.
3. **Break attempts:** double reverse, reverse of reversal, concurrent reverse, sales role.

## Task log

### Task RD-1 — schema (363)
```
Scope:      supabase/migrations/20260819150000_363_reverse_document_schema.sql
            docs/verification/363-down.sql
Effort:     M
Started:    2026-08-19
Finished:   2026-08-19
Verdict:    PASS
Dry-run:    rollback-dryrun 840→840 before and after apply. After 364, 363-down raises P0001
            telling the operator to run 364-down first.
REST:       restarted
Reviewers:  Observer PASS; Software Engineer PASS; Security Engineer PASS
            (nullable columns; 343 untouched; unique index still one-live-endorsement)
```

### Task RD-2 — RPC + readers (364)
```
Scope:      supabase/migrations/20260819151000_364_reverse_document.sql
            docs/verification/364-down.sql
            docs/api/rpc-contracts.md (§4)
            docs/verification/og14-accept.sql
Effort:     M
Started:    2026-08-19
Finished:   2026-08-19
Verdict:    PASS
Dry-run:    rollback-dryrun 841→841
REST:       restarted
Reviewers:  Observer PASS — cheque freed (END_FREE succeeded after reverse).
            Software Engineer PASS — credit 0→1000000→0; links 0→1000000→0; dual 2 lines.
            Security Engineer PASS — sales 42501; 343 still P0001 on original; no
            session_replication_role; reason required; audit document_reversed.
```

Acceptance (BEGIN…ROLLBACK except concurrency), real JWT:

1. Receipt: original stays posted; new balanced 2-line entry; credit restored; links restored.
2. Payment: marked reversed.
3. Dual: 2 lines, balanced.
4. Endorsement reversed then same cheque endorsed again — succeeded.
5. Second reverse → P0001.
6. UPDATE original journal → P0001.
7. sales 42501; accountant and manager each created+reversed.
8. Two sessions: one `51e00e30-…` succeeded; the other P0001 already reversed.

Phase 5 not started. `asan_list_journal_export` not modified.
