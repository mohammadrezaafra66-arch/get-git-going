# Safe defaults — decisions taken without the owner

`ledger-decisions.md` carries the binding decisions. This file records every **ambiguity resolved by
the executing architect** so no task stalls waiting for an answer. Each has a default, a reason, and
what would overturn it.

**These are reversible.** If the owner disagrees with any one, say so and it changes.

---

## D1 — `receipt_type` is kept in the schema, removed from the UI
The column is `NOT NULL` with a default. The RPC sends the fixed default so existing rows and any
remaining reader keep working. **Dropping a column is irreversible; hiding a field is not.**
*Overturned by:* the owner asking for a clean schema, in which case it drops after phase 8.

## D2 — Cash uses `account_kind='bank'`
A cash box is already a `bank_accounts` row with `account_type='cash'`. Introducing a `cash` account
kind would mean a new CHECK value, a new `validate_journal_line_ref` branch, and a new Asan
resolution path — for a distinction the data already makes.
*Overturned by:* Asan requiring a different account code shape for cash.

## D3 — Document number format `<PREFIX>-<jalali year>-<6 digits>`
`RCP-1405-000042`, `PAY-1405-000007`, `DUAL-1405-000003`. A separate series per type, mirroring
Asan's separate registers. Jalali year because the accountant reads it.
*Overturned by:* an Asan constraint on number format.

## D4 — `max+1` under an advisory lock, never a sequence
A sequence burns a value on any rolled-back transaction, producing gaps nobody can explain.
`max+1` under a lock leaves no trace when it rolls back. This mirrors `asan_assign_document_number`,
which already works.
*Overturned by:* nothing. Contention at this volume is negligible.

## D5 — Fractional amounts rejected at creation
The Asan export blocks fractional Toman, so a fractional document would be created and then silently
withheld. Better to refuse at the door with a readable message.
*Overturned by:* nothing.

## D6 — `require_asan_code` reads only `person_identifiers`
It never falls back to `customers.accounting_code`. That mirror can disagree — one test customer has
a mirror value and no identifier row — and the export reads the identifier. Two sources of truth for
an account code is how they drift. Migration 295 already carries an explicit gate to this effect.
*Overturned by:* nothing.

## D7 — A cheque posts on receipt, to `cheque_receivable`
Answers open question Q3. Receiving a cheque changes what the customer owes us the moment we accept
it, so it posts then. Clearing and bouncing are lifecycle events for a later programme — see
`deferred.md`.
*Overturned by:* the accountant preferring cheques off-ledger until cleared, which would mean cheque
branches record without posting.

## D8 — Cheque documents are **excluded** from the Asan export (amended 2026-08-19)
Originally (phase 0): cheque lines were to be *skipped* rather than blocking the document, because
`cheque_receivable` / `cheque_payable` had no Asan account code yet.

**Owner 2026-08-19:** cheques are entered into Asan **by hand**, like cash. They do not appear in
the export at all — not as a skipped line, not as a blocked row, not as a zero-toman empty
document (Gate A M3). Migration **367** drops the whole document. Cash remains excluded from the
bank-deposit export (350). Reversals follow the same manual path (T15).

*Overturned by:* the owner supplying Asan codes for cheque accounts *and* asking for them to go
through the automatic file, which would restore a skip-or-resolve behaviour.

## D9 — `create_dual_document` takes one amount, not two
The two sides must be equal or the entry does not balance, and an unbalanced document is dropped
from the export entirely. The UI may show two fields; the contract takes one.
*Confirmed by the owner 2026-08-18:* the two sides of a dual document are always equal. If 100 is owed
and only 60 goes to the creditor while 40 comes to us, that is **two documents** — one dual document
for 60 and one ordinary receipt for 40 — never one dual document with unequal sides.
*Overturned by:* a real case of an unequal dual document, which would be a different document type.

## D10 — The dual document gets its own source table if `mutual_settlements` does not fit
Task 4.2 reads `mutual_settlements` first and decides. It was built for netting a customer against a
supplier, which is a related but distinct operation. **Read before deciding, and record the choice.**
*Overturned by:* the shapes turning out identical, in which case reuse it.

## D11 — Reversal, not editing
Posted entries are immutable, so correction creates a reversing entry. Simpler than partial-edit
rules and leaves an audit trail an accountant can follow.
*Overturned by:* nothing.

## D12 — The old create path survives until task 6.9
Phases 2–5 add RPCs without removing the existing form, so a failure in a new RPC does not stop the
business. Removal happens once the wizard replaces it.
*Overturned by:* nothing.

## D13 — Both halves of the Asan-code rule are required
Form and database. A form-only check is bypassed by a direct PostgREST call; a database-only check
gives the user a raw error. Both, always.
*Overturned by:* nothing.

## D14 — 70 typecheck errors remain the baseline
Documented, across 6 files, caused by the Supabase CLI not being installed. New columns are worked
around with casts. **Not a regression — do not "fix" them.** A count above 70 is a real failure.
*Overturned by:* installing the CLI and regenerating types, which is out of scope.

## D15 — Stress tests use 50 concurrent operations
Enough to expose an advisory-lock or transaction-boundary defect; small enough to run in seconds on
the test machine.
*Overturned by:* a real concurrency defect appearing at higher volume.

## D16 — Persian error messages are part of the API contract
`P0001` messages surface directly in the UI. They are written for the user, not the developer, and
are covered by acceptance tests.
*Overturned by:* nothing.

## D17 — `_filter` values (amended 2026-08-19)
Originally: `all|receipt|payment|third_party` so the front end would not break when 5.1 rewired
the classifier.

**Owner 2026-08-19:** a fourth menu for `purchase_payment` and `settlement`. Live values are
`all|receipt|payment|third_party|settlement|purchase_and_settlement`. `settlement` alone remains
accepted for callers that already passed it; the page uses `purchase_and_settlement`.
*Overturned by:* nothing further.

## D18 — Test data is not repaired as part of this programme
13 of 23 customers lack an Asan code. That is data entry on production data (phase 9.6), not
infrastructure. Phase 8 seeds only the few complete records the tests need.
*Overturned by:* nothing — the owner has confirmed incomplete test data is acceptable.

## D19 — The legacy payment-voucher path is closed in **both** halves (2026-08-21)
This is not a new principle. It is **D13 applied to the payment side**: "a form-only check is
bypassed by a direct PostgREST call." Ground truth §13.4 measured exactly that — a logged-in `admin`
or `accountant` can `INSERT` straight into `payment_vouchers` today and produce no journal entry.
Deleting the page alone would leave that open, so D12's frontend-only retirement of
`PaymentReceiptForm` (§13.5, commit `e7dc789`) is the right *style* and the wrong *scope*.

**Database half.** Drop `payment_vouchers_insert_finance` and do **not** replace it. This mirrors
A4/G6 — `journal_entries` and `journal_lines` carry no INSERT policy at all, and their
`SECURITY DEFINER` writers reach them as the table owner. Ground truth §13.6 proves the three
legitimate writers (`create_payment`, `pay_purchase_with_voucher`, `reverse_document`) are all
`prosecdef=true`, and §13.4 proves `relforcerowsecurity=false`, so the owner bypasses RLS. Dropping
the policy therefore closes the raw path **without** touching any legitimate writer.

**Frontend half.** Full deletion, D12's style:
- delete `src/routes/_app.accounting.payment-vouchers.tsx`
- delete `createPaymentVoucher` from `src/lib/treasury/queries.ts` (lines 189–218)
- remove `src/lib/navigation/registry.ts:481` (route entry) and `:1215` (role gate)
- remove `src/components/layout/primary-modules.ts:142`

`fetchPaymentVouchers` (`queries.ts:124`) is **kept** — it only reads.
*Overturned by:* **D22, in its frontend half only.** The database half stands exactly as written and
is applied as migration 368. (Correction to this entry: it claimed
`_app.accounting.purchase-payments.tsx` needs the voucher list. It does not — it never calls
`fetchPaymentVouchers`. The page itself is the only consumer, which is precisely what forced D22.)

## D20 — No existing-data remediation is needed (2026-08-21)
T-0.2 measured it rather than assuming it:

```
SELECT count(*) FROM payment_vouchers pv WHERE NOT EXISTS
  (SELECT 1 FROM journal_entries je WHERE je.source_type='payment_voucher' AND je.source_id=pv.id);
COUNT = 0
```

`payment_vouchers` holds one row and it has its journal entry. G7 is resolved and the conditional
Owner-Gate at T-1.2 (execution document section ۹, item 8) **does not trigger** — there is no data
for the owner to decide about. If a future measurement finds a non-zero count, this decision is void
and the gate reopens.
*Overturned by:* nothing.

## D21 — The bank figure a user sees comes from `journal_lines` (2026-08-21)
Ground truth §13.3 confirmed both readers live: `vw_account_balances references journal_lines: false`
and `get_account_ledger references journal_lines: false`. Both are re-pointed at the ledger.

**Why this cannot reintroduce the cheque defect (OG-18 / migration 359).** The current readers
exclude cheques with an explicit `document_channel IS DISTINCT FROM 'cheque'` filter. The ledger
needs no such filter, because a cheque never posts to `account_kind='bank'` — `create_receipt`
debits `cheque_receivable` and `create_payment` credits `cheque_payable`. Measured, not assumed:

```
journal lines with account_kind=bank belonging to a cheque-channel receipt = 0
journal lines with account_kind=bank belonging to a cheque-channel voucher = 0
```

Reading from the ledger is therefore *stronger* than the 359 filter: a cheque is excluded by where
it posts, not by a label that a writer could get wrong.

**Reversal handling mirrors 367 exactly** — the same two-line predicate the Asan export already
uses, not a new invention:

```sql
AND je.reverses_entry_id IS NULL
AND NOT EXISTS (SELECT 1 FROM public.journal_entries r WHERE r.reverses_entry_id = je.id)
```

### Drafted body — `vw_account_balances`
Minimal diff. The outer `SELECT`, the column list, `opening_balance`, and the
`WHERE NOT is_viewer_only(uid())` wrapper are unchanged; only the two CTEs move to the ledger.

```sql
CREATE OR REPLACE VIEW public.vw_account_balances AS
  SELECT src.account_id, src.title, src.bank_name, src.account_type, src.currency,
         src.is_active, src.opening_balance, src.total_in, src.total_out,
         src.current_balance, src.in_count, src.out_count
  FROM (
    -- D21: money now comes from the ledger, not from payment_receipts/payment_vouchers.
    -- One CTE replaces the old inflow/outflow pair: a bank line's debit is money in and its
    -- credit is money out, so both directions come from the same rows.
    -- No document_channel filter: a cheque never posts to account_kind='bank' (359 verified).
    WITH bank_moves AS (
      SELECT jl.account_ref_id                            AS account_id,
             COALESCE(SUM(jl.debit),  0::numeric)         AS total_in,
             COALESCE(SUM(jl.credit), 0::numeric)         AS total_out,
             count(*) FILTER (WHERE jl.debit  > 0)        AS in_count,
             count(*) FILTER (WHERE jl.credit > 0)        AS out_count
        FROM public.journal_lines   jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_kind = 'bank'
         AND je.status       = 'posted'
         AND je.reverses_entry_id IS NULL                                    -- 367 / T15
         AND NOT EXISTS (SELECT 1 FROM public.journal_entries r
                          WHERE r.reverses_entry_id = je.id)                 -- 367 / T15
       GROUP BY jl.account_ref_id
    )
    SELECT ba.id AS account_id, ba.title, ba.bank_name, ba.account_type, ba.currency,
           ba.is_active, ba.opening_balance,
           COALESCE(m.total_in,  0::numeric) AS total_in,
           COALESCE(m.total_out, 0::numeric) AS total_out,
           ba.opening_balance + COALESCE(m.total_in, 0::numeric)
                              - COALESCE(m.total_out, 0::numeric) AS current_balance,
           COALESCE(m.in_count,  0::bigint)  AS in_count,
           COALESCE(m.out_count, 0::bigint)  AS out_count
      FROM public.bank_accounts ba
      LEFT JOIN bank_moves m ON m.account_id = ba.id
  ) src
  WHERE NOT public.is_viewer_only(public.uid());
```

`opening_balance` stays in the formula. It is a `bank_accounts` column, not a ledger event; removing
it would change every displayed balance and is not this mission's decision to take.

### Drafted shape — `get_account_ledger`
Larger than the view, because the journal does not carry three of the ten returned columns in the
same shape. **The money and the ordering come from the ledger; three display-only columns are
resolved by joining back.** That separation is the design, and it is deliberate:

| Returned column | New source |
|---|---|
| `entry_id` | `je.source_id` — unchanged contract, so existing UI navigation keeps working |
| `entry_kind` | `'in'` when `jl.debit > 0`, else `'out'` |
| `entry_date` | `je.entry_date` |
| `amount` / `signed_amount` | `jl.debit + jl.credit` / `jl.debit - jl.credit` |
| `running_balance` | same window function, seeded from `opening_balance` + qualifying bank lines before `p_from_date` |
| `description` | `je.description` |
| `document_number` | `LEFT JOIN document_numbers dn ON dn.source_id = je.source_id` — **now a real document number, where the old body returned `tracking_number` for receipts** |
| `counterparty` | the *other* line of the same entry, resolved by `account_kind` using the authoritative map in `validate_journal_line_ref`: `customer_credit`→`customers`, `supplier_payable`→`suppliers`, `external_party`→`external_parties`, `cheque_receivable`→customers/external_parties, `cheque_payable`→suppliers/external_parties |
| `document_channel` | `LEFT JOIN` back to `payment_receipts`/`payment_vouchers` on `je.source_type`/`je.source_id` — a **display label only**; no money is read from the source row |

**One behavioural change is unavoidable and is called out here rather than discovered later.**
The old body returns `pr.tracking_number` as `document_number` for an inflow and
`pv.voucher_number` for an outflow. The new body returns the real minted document number
(`RCP-…` / `PAY-…`). That is a correction, not a regression — but it is user-visible, and T-2.3's
acceptance must show the before/after per row, not only the balance.

*Overturned by:* nothing.

## D22 — The payment-voucher page survives as read-only history (owner, 2026-08-21)
Overrides D19's frontend half. D19 specified full deletion, mirroring D12. Phase 2 then measured
something D19 did not know: `_app.accounting.payment-vouchers.tsx` is not only the create form, it is
the **only** list of payment vouchers in the application — شماره سند / تاریخ / دریافت‌کننده / نوع /
کانال / از حساب / مبلغ / چک, fed by `fetchPaymentVouchers`. No other route renders it;
`_app.accounting.treasury.tsx` only links to it and `_app.accounting.purchase-payments.tsx` does not
call it at all.

That makes this case unlike D12. There, the wizard **replaced** the deleted form's function. Here,
deleting the page would remove the only view of a payment document — including the one the wizard has
just created, since `DocumentWizard.tsx:294` navigates there on success. Execution-document §13 open
question ۱ named this exact fork and made it the owner's. **Owner chose read-only history.**

**What was removed:** `createPaymentVoucher` and `CreateVoucherInput` from
`src/lib/treasury/queries.ts`; and from the page, the create dialog, its mutation, its form state,
the four queries that only fed it (`accountsQ`, `suppliersQ`, `partiesQ`, `customersQ`), the
`PayeePicker` component, the header's create button, and the now-unused imports.

**What was kept, deliberately:** the page, its route, its date filters, its table, both
`registry.ts` entries and the `primary-modules.ts` entry. Keeping the route means the wizard's
success navigation and the treasury link keep working with no edit to either — the two references
the execution document's T-2.4 scope list did not name.

**Why this is not a weaker outcome than deletion.** The write path is closed in the database by 368,
not by the absence of a form. A restored form could not create a voucher; it would raise `42501`.
The page's empty-state copy now says a payment document is created in the wizard and appears here
afterwards.
*Overturned by:* nothing.
