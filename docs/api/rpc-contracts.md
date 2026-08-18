# RPC contracts

Every function here is `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'public'`, and
does all of its work in **one transaction**. A failure at any point leaves zero rows — there is no
partial creation and no compensating delete. (The current code's compensating delete is a no-op
because `payment_receipts` has no DELETE policy; that is exactly the defect these contracts remove.)

## Conventions

**Amounts are Toman.** Never convert to Rial in SQL; that happens once, in
`src/lib/asan/amounts.ts`. Fractional amounts are rejected at creation, because the ×10 conversion
must be exact and the Asan export blocks on fractions anyway.

**Error codes.**

| SQLSTATE | Meaning | Front-end behaviour |
|---|---|---|
| `22023` | Invalid argument (bad date, non-positive amount, fraction) | Field-level message |
| `23505` | Idempotent replay — the document already exists | Treat as success; return the existing document |
| `42501` | Caller lacks the required role | Generic "no permission" message |
| `P0001` | Business rule violated (no Asan code, imbalance, missing account code) | Show the Persian message verbatim — it is written for the user |

**Persian messages are part of the contract.** They surface directly in the UI. Never let a raw
database error reach the user.

**Idempotency.** Each function honours `UNIQUE (source_type, source_id)` on `journal_entries`. A
retry with the same source row returns the existing document rather than creating a second entry.
Callers should retry safely on network failure.

**Role gate.** `admin`, `accountant`, `manager` may create. Enforced with `public.has_any_role`
inside SQL — **never** via `supabase.rpc('has_any_role', …)`, which throws `PGRST203` because both
overloads match. Failure must `RAISE`, never return zero rows: an unauthorised caller receiving an
empty result is read upstream as "there is nothing here".

**`auth.uid()` is NULL in psql**, so these functions cannot be called from a shell. To verify them
manually, replicate the body without the role guard. Never invoke.

---

# 1. `create_receipt`

Creates a receipt and posts it in one step. Replaces the four client-side inserts.

```sql
create_receipt(
  p_channel                      text,      -- 'bank' | 'cash' | 'cheque'
  p_customer_id                  uuid,      -- payer; the counterparty is always us
  p_amount                       numeric,   -- Toman, > 0, integral
  p_payment_date                 date,
  p_payment_time                 time,      -- required: the column has no default
  p_destination_bank_account_id  uuid    DEFAULT NULL,  -- required when channel='bank'
  p_tracking_number              text    DEFAULT NULL,  -- required for 'bank'; minted for others
  p_source_bank                  text    DEFAULT NULL,
  p_cheque_number                text    DEFAULT NULL,  -- required when channel='cheque'
  p_cheque_due_date              date    DEFAULT NULL,  -- required when channel='cheque'
  p_cheque_bank                  text    DEFAULT NULL,
  p_description                  text    DEFAULT NULL,
  p_allocations                  jsonb   DEFAULT '[]'::jsonb,  -- [{quote_id, amount}]
  p_attachment_ids               uuid[]  DEFAULT NULL
) RETURNS TABLE (
  receipt_id       uuid,
  document_number  text,
  journal_entry_id uuid,
  new_balance      numeric
)
```

## Order of operations

1. Role gate → `42501`.
2. Argument validation → `22023`: amount > 0 and `= trunc(amount)`; date not null; per-channel
   requirements above.
3. `require_asan_code(customers.person_id)` → `P0001` naming the customer.
4. If `p_channel <> 'bank'`, mint `p_tracking_number` as `INT-<doc_number>` — the column is
   `NOT NULL` with no default and cash has no bank reference.
5. `assign_document_number('receipt', <new uuid>)`.
6. Insert `payment_receipts` with `status='posted'` (T1 removed approval) and
   `receipt_type` set to its fixed default (T5 removed the field but the column stays `NOT NULL`).
7. Insert `payment_receipt_links` from `p_allocations`. Sum of allocations must be ≤ amount →
   `P0001`. Any failure here aborts the whole transaction, so no orphan can exist.
8. Bind `p_attachment_ids` to `document_attachments` (`document_type='receipt'`).
9. Post the entry — see below.
10. Insert the audit row per `audit-trigger-spec.md`.

## The journal entry

| | account_kind | account_ref_id | source |
|---|---|---|---|
| Debit | `bank` (channel bank/cash) or `cheque_receivable` (cheque) | `p_destination_bank_account_id`, or the cheque register row | money arrives |
| Credit | `customer_credit` | `p_customer_id` | the customer's credit rises |

`journal_entries`: `source_type='payment_receipt'`, `source_id=receipt_id`, `doc_kind='receipt'`,
`status='posted'`, `entry_date=p_payment_date`, `posted_by=auth.uid()`.

**Cash is still `bank`** — a cash box is a row in `bank_accounts` with `account_type='cash'`. Do not
invent a `cash` account kind.

**Before posting**, verify the debit account resolves to an `accounting_code`; if not, raise `P0001`
naming the account. Discovering this at export time means silently withholding the document.

---

# 2. `create_payment`

Mirrors `create_receipt` in the opposite direction. **This is wiring, not building:**
`payment_vouchers` already carries `payee_party_id`, `payee_name`, `tracking_number` and the
`payment_vouchers_payee_matches_type_chk` XOR constraint. `pay_purchase_with_voucher` already posts
a balanced entry using `supplier_payable` — read it before writing this.

```sql
create_payment(
  p_channel              text,      -- 'bank' | 'cash' | 'cheque'
  p_payee_type           text,      -- 'supplier' | 'external_party' | 'customer' | 'other'
  p_payee_id             uuid,      -- matched against payee_type by the existing CHECK
  p_amount               numeric,   -- Toman, > 0, integral
  p_payment_date         date,
  p_source_account_id    uuid,      -- always required: money leaves an account of ours
  p_tracking_number      text    DEFAULT NULL,  -- required for 'bank'; minted otherwise
  p_cheque_kind          text    DEFAULT NULL,  -- 'own' | 'endorsed'; required when cheque
  p_cheque_number        text    DEFAULT NULL,  -- required when cheque_kind='own'
  p_cheque_due_date      date    DEFAULT NULL,
  p_endorsed_cheque_id   uuid    DEFAULT NULL,  -- required when cheque_kind='endorsed'
  p_purchase_id          uuid    DEFAULT NULL,  -- optional link to a purchase
  p_description          text    DEFAULT NULL,
  p_attachment_ids       uuid[]  DEFAULT NULL
) RETURNS TABLE (
  voucher_id       uuid,
  document_number  text,
  journal_entry_id uuid,
  new_balance      numeric
)
```

## The journal entry

| | account_kind | account_ref_id |
|---|---|---|
| Debit | `supplier_payable` | the payee — what we owe falls |
| Credit | `bank` (bank/cash), `cheque_payable` (own cheque), `cheque_receivable` (endorsed) | source of funds |

`doc_kind='payment'`, `source_type='payment_voucher'`, `status='posted'`.

## Sign-convention warning

`person_settlement_position` computes payable as `SUM(credit − debit)` on `supplier_payable`, but
the only existing writer **debits** it. A paid supplier therefore reads **negative**. Fix the
convention in phase 3 and record which direction was chosen in the phase progress file. Leaving this
inconsistent inverts the direction of every future settlement.

## Endorsed cheque

`p_endorsed_cheque_id` must reference a cheque we hold that has not already been endorsed or
cleared. A second endorsement raises `P0001`. The user selects the cheque from a list; they never
retype its details.

---

# 3. `create_dual_document`

One document, two parties, both balances move. Money never touches our accounts — we only record it.

```sql
create_dual_document(
  p_payer_id           uuid,     -- owed us; they paid
  p_beneficiary_id     uuid,     -- we owed them; they were paid
  p_amount             numeric,  -- Toman, > 0, integral. One amount, both sides.
  p_document_date      date,
  p_tracking_number    text,     -- from the transfer slip
  p_source_bank        text    DEFAULT NULL,
  p_destination_bank   text    DEFAULT NULL,
  p_intermediary_id    uuid    DEFAULT NULL,  -- صراف, optional
  p_intermediary_fee   numeric DEFAULT 0,     -- Toman; > 0 adds a third line
  p_fee_borne_by       text    DEFAULT NULL,  -- 'us' | 'payer' | 'beneficiary'
  p_description        text,                  -- REQUIRED, see below
  p_attachment_ids     uuid[]  DEFAULT NULL
) RETURNS TABLE (
  document_id      uuid,
  document_number  text,
  journal_entry_id uuid
)
```

**`p_description` is mandatory here and optional elsewhere.** In the accounting-document layout the
tracking number and payer name are buried inside the شرح column, so the description is the only
context an accountant sees in Asan for this document.

**One amount, not two.** The roadmap's wizard shows an allocated amount per party; the contract takes
a single amount because the two must be equal for the entry to balance, and an unbalanced document is
dropped from the Asan export entirely. The UI may present two fields, but it must reconcile them
before calling, and the RPC rejects any attempt to do otherwise.

## The journal entry

| | account_kind | account_ref_id |
|---|---|---|
| Debit | `supplier_payable` | beneficiary — what we owe falls |
| Credit | `customer_credit` | payer — what they owe us falls |
| Third line (only when fee > 0) | per `p_fee_borne_by` | see below |

`doc_kind='dual'`, `source_type='dual_document'`, `status='posted'`.

Fee handling: `'us'` debits an expense-bearing account and credits the intermediary; `'payer'` /
`'beneficiary'` adjust that party's line instead. **Whichever is chosen, `sum(debit)` must still
equal `sum(credit)`** — verify before insert and raise `P0001` on any mismatch.

When the fee is zero the intermediary is metadata only: recorded on the source row, no journal line,
no balance effect.

---

# 4. Helper functions

## `assign_document_number(p_doc_type text, p_source_id uuid) RETURNS text`

Mirrors `asan_assign_document_number`. Idempotent, advisory-lock + `max+1`, never reuses a number,
burns on delete. `p_doc_type` ∈ `receipt | payment | dual`. Returns
`<PREFIX>-<jalali year>-<6-digit serial>` where the prefix is `RCP` / `PAY` / `DUAL`.

**Do not use a sequence.** A sequence burns a value on any rolled-back transaction, creating gaps
nobody can explain. `max+1` under an advisory lock leaves no trace when it rolls back.

## `require_asan_code(p_person_id uuid) RETURNS text`

Returns `person_identifiers.value_normalized` where `kind='asan_person_code'`. Raises `P0001` with a
Persian message naming the person when absent. This is the database half of T3; the form is the
other half, and both are required — a form-only check is bypassed by a direct PostgREST call.

Does **not** filter on identifier status: all existing codes are `provisional` and the Asan export
does not filter on status either, so existence is the criterion.

**Never** fall back to `customers.accounting_code`. That mirror can disagree with the identifier —
one customer on the test database has a mirror value and no identifier row — and the export reads
the identifier. Two sources of truth for an account code is how they drift.

## `reverse_document(p_doc_kind text, p_source_id uuid, p_reason text) RETURNS uuid`

Because posted entries are immutable (task 1.6), correction is by reversal: a new entry with debit
and credit swapped, linked to the original. Required for phase 8 negative tests and for any real
correction workflow.

---

# 5. What the front end must handle

1. **`23505` is success**, not an error — the document already exists; show it.
2. **`P0001` messages are for the user.** Display verbatim; they are written in Persian for that.
3. **`42501` never means "empty"** — it means no permission. Do not render an empty state.
4. **Fractional amounts** are rejected server-side; also block them in the form so the user learns
   before submitting.
5. **Retry is safe.** On timeout, retry the same call rather than creating a second document.
