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
| `23505` | A real unique violation. **Not** a success path — see Idempotency below | Show an error; do not treat as "already done" |
| `42501` | Caller lacks the required role | Generic "no permission" message |
| `0A000` | The feature exists in the signature but is not wired yet (today: `p_attachment_ids`) | Show the Persian message; do not retry |
| `P0001` | Business rule violated (no Asan code, imbalance, missing account code, wrong account type) | Show the Persian message verbatim — it is written for the user |

**Persian messages are part of the contract.** They surface directly in the UI. Never let a raw
database error reach the user.

**Idempotency — RETRY IS NOT SAFE. Read this before writing a caller.**

> Corrected 2026-08-19 (Gate A phase 2, defect M2). This section previously said a retry returns
> the existing document and that callers "should retry safely on network failure". That was false,
> and §1 already said the opposite, so the document contradicted itself. Phase 6 would have built
> the retry.

These functions have **no request-level idempotency key**. Each call mints a fresh `source_id`
internally, so two identical calls produce **two independent documents**: two source rows, two
document numbers, two posted journal entries, and two balance movements. Measured:

```
B7 identical call submitted twice | doc1=RCP-1405-000054 doc2=RCP-1405-000055
   receipts_with_that_tracking_number=2 -> two immutable posted documents, two credit increases
```

`UNIQUE (source_type, source_id)` on `journal_entries` guarantees that **one source row can never
carry two journal entries**. That is all it guarantees. It is not a deduplication key for "the same
receipt submitted twice", and there is no natural key for that — inventing one would silently
swallow a genuine second payment of the same amount on the same day.

The duplicate cannot be cleaned up afterwards. The journal entry is immutable (migration 343),
`reverse_document` does not exist (OG-14), and migration 353 refuses to delete a receipt that has
posted. A double submission is permanent.

**What the front end must do instead:**

1. **Disable the submit control on first click** and keep it disabled until the call settles.
   Do not rely on a debounce.
2. **On a network timeout, do NOT retry automatically.** The call may well have committed. Tell
   the user the outcome is unknown and send them to the document list to check.
3. **Offer an explicit "I checked, create it again" path** rather than a silent retry, so a second
   document is only ever created by a deliberate human action.
4. If true retry safety is needed later, it requires a caller-supplied idempotency key stored on
   the source row with a unique index. That is a design change, not a client-side fix.

**Role gate.** `admin`, `accountant`, `manager` may create. Enforced with `public.has_any_role`
inside SQL — **never** via `supabase.rpc('has_any_role', …)`, which throws `PGRST203` because both
overloads match. Failure must `RAISE`, never return zero rows: an unauthorised caller receiving an
empty result is read upstream as "there is nothing here".

**Verifying these functions from psql — invoke them, do not replicate them.**

> Corrected 2026-08-19 (Gate A phase 2, defect m6). This section previously read: "`auth.uid()` is
> NULL in psql, so these functions cannot be called from a shell. To verify them manually,
> replicate the body without the role guard. Never invoke." Both halves were wrong. `auth.uid()`
> reads `request.jwt.claims`, which any session can set, and the Gate A review invoked
> `create_receipt` dozens of times from psql this way. The advice it gave instead — test a copy of
> the body — is the anti-pattern that let phase 1's BLOCKER through three reviewers: a replicated
> body passes while the real function fails.

Simulate the caller's JWT, exactly as CLAUDE.md rule 7 prescribes, and call the real object inside
`BEGIN … ROLLBACK` so nothing is written:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"<user-uuid>","role":"authenticated"}', true);

SELECT * FROM public.create_receipt(
  p_channel := 'bank', p_customer_id := '<customer-uuid>', p_amount := 1000000,
  p_payment_date := current_date, p_payment_time := '10:00'::time,
  p_destination_bank_account_id := '<bank-account-uuid>', p_tracking_number := 'PROBE-1');

ROLLBACK;
```

To exercise RLS as well as the role gate, add `SET LOCAL ROLE authenticated` — the `SECURITY
DEFINER` functions still run as their owner, but direct table reads then obey the caller's
policies. Persian output goes to a file with `\o` and is read with a file reader; it is never
printed to a terminal (README-EXECUTION §2 rule 2).

---

# 1. `create_receipt`

Creates a receipt and posts it in one step. Replaces the four client-side inserts.

> **Reconciled against the live schema on 2026-08-18 (task 2.1).** Four statements in the original
> draft of this section were contradicted by the database and have been corrected in place: the
> source row's `status` (C3), the cheque debit's `account_ref_id` (C1), when
> `p_destination_bank_account_id` is required (C5), and how `p_channel` is stored (C6). Each
> correction is marked below and the evidence is in `docs/execution/phase-2-PROGRESS.md`
> § *Contradictions found*. Implemented by migrations 348 and 349.

```sql
create_receipt(
  p_channel                      text,      -- 'bank' | 'cash' | 'cheque'
  p_customer_id                  uuid,      -- payer; the counterparty is always us
  p_amount                       numeric,   -- Toman, > 0, integral
  p_payment_date                 date,
  p_payment_time                 time,      -- required: the column has no default
  p_destination_bank_account_id  uuid    DEFAULT NULL,  -- required for 'bank' AND 'cash'  (C5)
  p_tracking_number              text    DEFAULT NULL,  -- required for 'bank'; minted only when not supplied (m5)
  p_source_bank                  text    DEFAULT NULL,
  p_cheque_number                text    DEFAULT NULL,  -- required when channel='cheque'
  p_cheque_due_date              date    DEFAULT NULL,  -- required when channel='cheque'
  p_cheque_bank                  text    DEFAULT NULL,
  p_description                  text    DEFAULT NULL,
  p_allocations                  jsonb   DEFAULT '[]'::jsonb,  -- [{quote_id, amount}]
  p_attachment_ids               uuid[]  DEFAULT NULL   -- NOT WIRED: a non-empty array raises 0A000 (m4)
) RETURNS TABLE (
  receipt_id       uuid,
  document_number  text,
  journal_entry_id uuid,
  new_balance      numeric
)
```

## Order of operations

1. Role gate → `42501`. `public.has_any_role(auth.uid(), ARRAY['admin','accountant','manager']::app_role[])`,
   the same boundary `assign_document_number` uses since migration 346 (OG-13, answer (a)).
2. Argument validation → `22023`: amount > 0 and `= trunc(amount)`; date not null; per-channel
   requirements above; **and the date bounds** — `p_payment_date` may not be in the future, and
   its Jalali year may not be older than the previous one (migration 351, Gate A M6). The two are
   refused separately so the message tells the user which rule they hit. Rationale: a backdated
   entry lands in an Asan export window that may already have been submitted, and it can never be
   moved or withdrawn afterwards (343 immutability, and no `reverse_document` — OG-14). The
   one-year window exists so an accountant entering a 29 Esfand receipt on 2 Farvardin is not
   pushed back onto the legacy form.
3. `require_asan_code(customers.person_id)` → `P0001` naming the customer. It is `SECURITY INVOKER`
   since migration 346 and runs as the owner inside this `SECURITY DEFINER` function.
4. Resolve the destination account and **check that its `account_type` matches the channel** →
   `P0001` naming the account (migration 351, Gate A B1). `cash` requires a `bank_accounts` row
   with `account_type='cash'`; `bank` requires `account_type='bank'`. Without this, a cash receipt
   debited a real bank account and inflated it in `vw_account_balances` and `get_account_ledger`.
   **On the test database no `account_type='cash'` row exists yet, so cash receipts are refused
   until the owner creates the صندوق.** That is the intended behaviour, not a defect.

   Then mint `p_tracking_number` as `INT-<doc_number>` **if the caller did not supply one** — the
   column is `NOT NULL` with no default and cash has no bank reference.

   > **Corrected 2026-08-19 (Gate A m5).** This step originally read "If `p_channel <> 'bank'`,
   > mint `p_tracking_number`", i.e. unconditionally for non-bank channels. The implementation
   > honours a caller-supplied value instead and mints only as a fallback, because discarding a
   > value the caller sent is a swallowed input and a cheque in particular may carry a real
   > reference. The behaviour is right; the contract was stale.
5. `assign_document_number('receipt', <new uuid>)`.
6. Insert `payment_receipts` with `status='approved'`, `posting_status='posted'`, `posted_at=now()`,
   and `receipt_type` set to its fixed default (T5 removed the field but the column stays
   `NOT NULL`).

   > **C3 — corrected.** This step originally read `status='posted'`. That value does not exist:
   > `payment_receipts_status_check` admits only `pending_review | approved | rejected`. More
   > importantly, `enforce_payment_receipt_link_limits` caps a proforma's remaining balance counting
   > **only** receipts with `status='approved'`, so a fourth status value would have silently
   > disabled the over-allocation cap for every receipt this RPC creates. T1 is satisfied as written:
   > there is no approval **step** — the row is born approved and posted inside one transaction.
   > `posting_status='posted'` additionally makes the legacy `post_receipt_accounting` button
   > short-circuit on `already_posted` instead of double-posting.

   `document_channel` stores `'cash'` for cash and `'cheque'` for cheque; for `'bank'` it is left
   `NULL`, because the column's CHECK has no `bank` value and its real sub-channel
   (`paya`/`satna`/`pol`/`card_to_card`) is not known until the phase-6 wizard collects it. **(C6)**
7. Insert `payment_receipt_links` from `p_allocations` (`quote_id` only — the `invoice_id` branch is
   retired). The existing `trg_payment_receipt_links_enforce_limits` trigger enforces both caps: sum
   of this receipt's allocations ≤ the receipt amount, and each allocation ≤ the proforma's remaining
   balance. Do **not** re-implement those checks in the RPC. Any failure here aborts the whole
   transaction, so no orphan can exist.
8. `p_attachment_ids` — **not wired. A non-empty array raises `0A000`.**

   > **C8 — corrected.** This step originally read "Bind `p_attachment_ids` to
   > `document_attachments` (`document_type='receipt'`)". That cannot be done in this order:
   > `document_attachments.document_id` is `NOT NULL` and `validate_document_attachment_ref` is a
   > `BEFORE INSERT OR UPDATE` existence trigger, so an attachment row cannot exist before the
   > document it belongs to. There is no id this parameter could legitimately carry today, and
   > accepting one would either be a silent no-op or a way to re-point another document's
   > attachment onto this receipt. The function refuses loudly instead, exactly as
   > `validate_document_attachment_ref` already does for `document_type='dual'`.
   >
   > `NULL` and an empty array are both accepted and mean "no attachments".
   >
   > **Phase 6 owns the decision** this leaves open: either create-then-attach as a second call,
   > or a nullable `document_id` with a completion step. The parameter stays in the signature so
   > wiring it later does not change the signature — adding a parameter to a defaulted-argument
   > function creates an overload rather than replacing it (CLAUDE.md rule 5), and this project
   > has already been bitten by that.
9. Post the entry — see below.
10. Insert the audit row per `audit-trigger-spec.md`. `audit_logs` has no dedicated
    `journal_entry_id` / `document_number` / `amount` / `counterparty_*` columns, so those fields go
    into `diff jsonb`; `entity_type='payment_receipt'`, `entity_id=receipt_id::text`,
    `action='receipt_created'`, `actor_id=auth.uid()`.

## The journal entry

| | account_kind | account_ref_id | source |
|---|---|---|---|
| Debit | `bank` (channel bank/cash) or `cheque_receivable` (cheque) | `p_destination_bank_account_id`, or **`p_customer_id`** for a cheque (C1) | money arrives |
| Credit | `customer_credit` | `p_customer_id` | the customer's credit rises |

> **C1 — corrected.** This table originally gave the cheque debit's `account_ref_id` as "the cheque
> register row". **There is no cheque register**: A2 explicitly defers the cheque lifecycle, and the
> live `validate_journal_line_ref` accepts `cheque_receivable` only against `customers` or
> `external_parties` (migration 341, widened by 347 for OG-10). The drawer is therefore the
> reference, and for the customer path that is `p_customer_id`.

`journal_entries`: `source_type='payment_receipt'`, `source_id=receipt_id`, `doc_kind='receipt'`,
`status='posted'`, `entry_date=p_payment_date`, `posted_by=auth.uid()`. `doc_kind` is passed
explicitly — migration 341 dropped its DEFAULT on purpose so an omission fails loudly.

**Cash is still `bank`** — a cash box is a row in `bank_accounts` with `account_type='cash'`. Do not
invent a `cash` account kind. It follows that **cash also requires `p_destination_bank_account_id`**
(the cash box account): the debit line needs a reference, and
`payment_receipts_receiver_exclusive_chk` requires a receiver on any non-`pending_review` row. **(C5)**

**Before posting**, verify the debit account resolves to an `accounting_code`; if not, raise `P0001`
naming the account. Discovering this at export time means silently withholding the document. For the
cheque branch there is nothing to verify — `cheque_receivable` has no Asan code by design (D8), and
the export skips those lines rather than blocking the document (task 5.2).

**Idempotency.** A retry with the same `p_channel`/`p_customer_id`/`p_amount`/… does **not**
deduplicate — every call is a new receipt with a new `source_id`. The `UNIQUE (source_type,
source_id)` guarantee is that one receipt can never carry two entries; it is not a request-level
idempotency key. There is no natural key for "the same receipt submitted twice", and inventing one
would silently swallow a genuine second payment of the same amount on the same day.

---

# 2. `create_payment`

Mirrors `create_receipt` in the opposite direction. Implemented by migrations **354** (the
endorsed-cheque reference) and **355** (the function).

> **Reconciled against the live schema on 2026-08-19 (task 3.1).** This section was written before
> the function existed and **ten** of its statements were contradicted by the database or by owner
> decisions T9–T13. Each correction is marked **P3-Cn** below and the evidence is in
> `docs/execution/phase-3-PROGRESS.md` § *Contradictions found*. The description "this is wiring,
> not building" held: no new table, no new `account_kind`, no new `account_kind` → table mapping.

```sql
create_payment(
  p_channel              text,      -- 'bank' | 'cash' | 'cheque'
  p_payee_type           text,      -- 'supplier' | 'external_party' | 'customer'   (P3-C2)
  p_payee_id             uuid,      -- matched against payee_type by the existing CHECK
  p_amount               numeric,   -- Toman, > 0, integral
  p_payment_date         date,      -- not future, not older than the previous Jalali year (P3-C8)
  p_source_account_id    uuid,      -- always required: the column is NOT NULL              (P3-C3)
  p_tracking_number      text    DEFAULT NULL,  -- required for 'bank'; minted only if absent
  p_cheque_kind          text    DEFAULT NULL,  -- 'own' | 'endorsed'; required when cheque
  p_cheque_number        text    DEFAULT NULL,  -- required when cheque_kind='own'
  p_cheque_due_date      date    DEFAULT NULL,
  p_endorsed_cheque_id   uuid    DEFAULT NULL,  -- a payment_receipts row, channel='cheque' (P3-C9)
  p_purchase_id          uuid    DEFAULT NULL,  -- optional link to a purchase
  p_description          text    DEFAULT NULL,
  p_attachment_ids       uuid[]  DEFAULT NULL   -- NOT WIRED: a non-empty array raises 0A000
) RETURNS TABLE (
  voucher_id       uuid,
  document_number  text,
  journal_entry_id uuid,
  new_balance      numeric
)
```

## The journal entry

**The debit `account_kind` is chosen from `payee_type`.** This is the most important line in the
contract and it replaces what this section originally said.

| `payee_type` | Debit `account_kind` | `account_ref_id` | `validate_journal_line_ref` target |
|---|---|---|---|
| `supplier` | `supplier_payable` | the supplier | `ARRAY['suppliers']` |
| `external_party` | `external_party` | the party | `ARRAY['external_parties']` |
| `customer` | `customer_credit` | the customer | `ARRAY['customers']` |
| `other` | **refused** — see P3-C2 | — | — |

> **P3-C1 — corrected.** This table originally read: *Debit `supplier_payable` — the payee*. That is
> true only when the payee is a supplier. `payment_vouchers.payee_type` admits four values and
> `supplier_payable` maps to `suppliers` alone, so for any other payee the line would either be
> refused by `validate_journal_line_ref` (`23503`) or — following `pay_purchase_with_voucher`'s
> precedent — be keyed to a **supplier who did not receive the money**. That precedent posts
> `('supplier_payable', _purchase.supplier_id)` unconditionally, including for an `external_party`
> payee and including when `supplier_id` is `NULL`, where the trigger returns early on the NULL ref
> and nothing checks it at all. **T10** forbids it: a payment has one counterparty and it moves
> *that* person's balance. **T13 constraint 3** names it explicitly. Selecting the kind from
> `payee_type` needs **zero** new mappings (**T13 constraint 1**).

The credit side — where the money comes from:

| Channel | Credit `account_kind` | `account_ref_id` |
|---|---|---|
| `bank` | `bank` | `p_source_account_id` |
| `cash` | `bank` | `p_source_account_id`, which must be `account_type='cash'` |
| `cheque`, `own` | `cheque_payable` | the payee (347: `suppliers` **or** `external_parties`) |
| `cheque`, `endorsed` | `cheque_receivable` | the endorsed cheque's drawer (its customer) |

`doc_kind='payment'`, `source_type='payment_voucher'`, `status='posted'`.

> **P3-C10 — the export does not read `doc_kind`.** `asan_list_journal_export` classifies by a
> **bank-sign heuristic**: `has_external` → `third_party`; `bank_net > 0` → `receipt`;
> `bank_net < 0` → `payment`; otherwise `unclassified`. So a payment to an `external_party`
> classifies as **`third_party`**, and a **cheque payment has no bank line at all** and classifies
> as **`unclassified`**, dropping out of every filtered export. `doc_kind='payment'` is still
> written — task 3.4 requires it and it is the only non-heuristic signal phase 5 will have — but
> writing it does **not** make the document appear under the `payment` filter today. Phase 5 owns
> the export.

## What changed against the original draft

| # | The contract said | The database or an owner decision says |
|---|---|---|
| **P3-C1** | Debit `supplier_payable` — the payee | The kind is chosen from `payee_type`; see above |
| **P3-C2** | `p_payee_type` admits `other` | **Refused.** T3 makes an Asan code a precondition and an Asan code lives on a person. `other` is free-text `payee_name` with no row behind it, and `payment_vouchers_payee_person_requires_payee_chk` forces `payee_person_id` to `NULL` for it. Admitting it would mean skipping T3 or inventing a person. The legacy path keeps its `other` fallback; this RPC does not. |
| **P3-C3** | `p_source_account_id` — "money leaves an account of ours" | Required on **every** channel because the column is `NOT NULL`, but for a cheque it records which account the cheque is drawn on — **no money moves**. The ledger credits a cheque account, never `bank`. |
| **P3-C4** | — | **Both cash views count a cheque voucher as money leaving the bank.** `vw_account_balances` and `get_account_ledger` filter on `status='approved'` with **no channel predicate**. Pre-existing (`pay_purchase_with_voucher` can already write a cheque voucher) and **not fixed here** — raised as **OG-18**. The ledger is right; those two views are not. |
| **P3-C5** | Fix the `supplier_payable` sign convention in phase 3 | **The convention is already correct and coherent.** See *Sign convention* below. |
| **P3-C6** | — | `payment_vouchers` already had its **own** numbering trigger minting `PV-YYYY-NNNNN` from a sequence — a second identity for one document. `create_payment` supplies the `PAY-…` number as `voucher_number`, which suppresses it (the trigger only fills a `NULL`). |
| **P3-C7** | `p_channel` is `bank｜cash｜cheque` | `payment_vouchers.document_channel` is `NOT NULL` and its CHECK has **no `bank` value** — only `card_to_card｜paya｜pol｜satna｜cash｜cheque｜other`. A bank payment is stored as `other` until the phase-6 wizard collects the real sub-channel. The mirror of the receipt side's C6. |
| **P3-C8** | — | Date bounds added, mirroring migration 351 (Gate A M6): not future, not older than the previous Jalali year. |
| **P3-C9** | `p_endorsed_cheque_id` must reference "a cheque we hold" | **There is no cheque register** — 0 tables match `cheque` (A2 defers the lifecycle). A cheque we hold **is** a `payment_receipts` row with `document_channel='cheque'`. Migration 354 adds `payment_vouchers.endorsed_receipt_id` and a partial UNIQUE index so a second endorsement raises. |
| **P3-C10** | `doc_kind='payment'` | Written, but the export ignores it — see above. |

## Sign-convention warning — measured, and **not** inverted

This section originally instructed phase 3 to fix the convention because
`person_settlement_position` computes payable as `SUM(credit − debit)` "while the only writer
debits it, so a paid supplier reads negative". Measured before acting, the premise does not hold:

```
person_settlement_position          receivable = SUM(debit − credit) on customer_credit
                                    payable    = SUM(credit − debit) on supplier_payable
list_mutual_settlement_candidates   identical, both kinds
post_mutual_settlement              settles by DEBITing supplier_payable and CREDITing customer_credit
```

For a two-sided party account that is correct — a liability rises on credit and falls on debit — and
all three agree. A payment must debit `supplier_payable`, and under `credit − debit` that lowers
what we owe, which **is** the phase-3 exit criterion. Inverting the arithmetic would invert three
functions and turn every future settlement the wrong way round.

A paid supplier reads negative for a different reason: **nothing ever credits `supplier_payable`**,
because purchases are never posted to the ledger. It is the exact mirror of what the T9 research
found for `customer_credit` — nothing ever debits it because no sales posting exists. The cause is
an **absent counter-posting, not a sign**. Phase 3 does not build purchase posting and does not
claim to have fixed it. Raised as **OG-19**.

**The convention this programme uses**, stated once so phases 4 and 5 cannot invert it:

| Kind | Outstanding |
|---|---|
| `supplier_payable`, `cheque_payable` (liability side) | `SUM(credit − debit)` |
| `customer_credit`, `cheque_receivable`, `external_party` (party-receivable side) | `SUM(debit − credit)` |

`new_balance` is returned in this convention. On a database where no purchase has ever been posted
it comes back **negative** for a supplier — that is the OG-19 symptom, reported honestly rather than
clamped to zero.

## Endorsed cheque

`p_endorsed_cheque_id` references a `payment_receipts` row with `document_channel='cheque'` — that
is what "a cheque we hold" means, because no cheque register exists (P3-C9). The amount must equal
the cheque's amount: a partial endorsement would leave a remainder nothing tracks.

A second endorsement raises `P0001`. Two things enforce it: an explicit `EXISTS` check that produces
a Persian sentence, and `payment_vouchers_endorsed_receipt_unique_idx` from migration 354, which is
the real guarantee because it holds against a concurrent second endorsement the `EXISTS` would not
see. The index excludes `status='rejected'` only, so a mistaken endorsement can be corrected while a
`draft` one still holds the cheque.

## Role gate and grants

`admin`, `accountant`, `manager` (OG-13 answer (a)), via `public.has_any_role` with an explicit
`::app_role[]` cast — both overloads match an uncast array. `EXECUTE` is revoked from `PUBLIC` and
`anon`, granted to `authenticated` and `service_role`.

Proved end to end: `sales` → `42501`; `accountant` → succeeds; **`manager` → succeeds and can read
back the numbering row** (the surface phase 1's M3 broke and migration 352 closed).

---

# 3. `create_dual_document`

One document, **four roles**, two balances move. Money never touches our accounts — we only record
it (T12). Implemented by migrations **360** (the `dual_documents` table and its guards) and **361**
(the function).

> **Reconciled against the live schema on 2026-08-19 (task 4.1).** This section was written before
> T11 existed and before the function was built. **Seven** of its statements were contradicted by
> the database or by owner decisions T9–T14. Each is marked **P4-Cn** below and the evidence is in
> `docs/execution/phase-4-PROGRESS.md` § *Contradictions found*. Unlike phases 2 and 3, this phase
> was told to **extend** the signature — T11 requires two roles the contract had no fields for.

```sql
create_dual_document(
  p_payer_type             text,      -- 'customer' | 'supplier' | 'external_party'   (P4-C2)
  p_payer_id               uuid,      -- owed us; they paid
  p_beneficiary_type       text,      -- same three values                            (P4-C2)
  p_beneficiary_id         uuid,      -- we owed them; they were paid
  p_amount                 numeric,   -- Toman, > 0, integral. ONE amount (D9).
  p_document_date          date,      -- not future, not older than the previous Jalali year (P4-C5)
  p_tracking_number        text,      -- from the transfer slip; required
  p_description            text,      -- REQUIRED, see below
  p_source_bank            text    DEFAULT NULL,
  p_destination_bank       text    DEFAULT NULL,
  -- T11's record-only roles. New in phase 4 (P4-C1).
  p_transferrer_name       text    DEFAULT NULL,
  p_transferrer_account_no text    DEFAULT NULL,
  p_recipient_name         text    DEFAULT NULL,
  p_recipient_account_no   text    DEFAULT NULL,
  -- Intermediary (صراف).
  p_intermediary_id        uuid    DEFAULT NULL,  -- an external_parties row
  p_intermediary_fee       numeric DEFAULT 0,     -- > 0 adds a third line
  p_fee_borne_by           text    DEFAULT NULL,  -- 'payer' | 'beneficiary'; 'us' is REFUSED (P4-C4)
  p_attachment_ids         uuid[]  DEFAULT NULL   -- NOT WIRED: a non-empty array raises 0A000
) RETURNS TABLE (
  document_id      uuid,
  document_number  text,
  journal_entry_id uuid
)
```

## The four roles (T11)

| Role | Asan code | Journal line | Balance moves | Stored as |
|---|---|---|---|---|
| **payer** — owed us, paid | **required** | yes, credited | **yes** | type + one FK |
| **beneficiary** — we owed, was paid | **required** | yes, debited | **yes** | type + one FK |
| **transferrer** — actually made the transfer | **no** | **no** | **no** | name + account number, plain text |
| **recipient** — whose account received it | **no** | **no** | **no** | name + account number, plain text |

> **P4-C1 — the contract had no transferrer and no recipient.** §3 carried `p_source_bank`,
> `p_destination_bank` and `p_intermediary_id` — bank *names* and the صراف — but nothing for the two
> people T11 requires. Four parameters and four columns were added. They are **plain text with no
> foreign key and no `person_id`**, deliberately: T11 says these people need no file, and CLAUDE.md
> rule 9 makes every persons-referencing FK a registry obligation that would abort the DDL if missed.

The owner's worked example is the acceptance shape: Khan-Mohammadi (payer) and Zeinab (beneficiary)
are the account holders; the father is the transferrer, Mitra the recipient. **Four people, one
document, two journal lines.**

## The journal entry

**The account kind of each party is chosen from that party's TYPE**, using only mappings
`validate_journal_line_ref` already has — **zero new mappings** (T13 constraint 1).

| Party type | `account_kind` | `validate_journal_line_ref` target |
|---|---|---|
| `customer` | `customer_credit` | `ARRAY['customers']` |
| `supplier` | `supplier_payable` | `ARRAY['suppliers']` |
| `external_party` | `external_party` | `ARRAY['external_parties']` |

| Line | Side | Keyed to |
|---|---|---|
| 1 | **debit** the beneficiary's kind | the beneficiary — what we owe them falls |
| 2 | **credit** the payer's kind | the payer — what they owe us falls |
| 3 *(only when fee > 0)* | **debit** `external_party` | the intermediary — see below |

`doc_kind='dual'`, `source_type='dual_document'`, `status='posted'`.

> **P4-C3 — corrected.** This table originally read *debit `supplier_payable` (beneficiary), credit
> `customer_credit` (payer)*. That is true only when the beneficiary is a supplier and the payer is a
> customer. T10 and OG-16 establish that either party may be any person, and `supplier_payable` maps
> to `suppliers` alone — so for any other party the line would be refused by
> `validate_journal_line_ref` (`23503`) or mis-keyed to someone who was not involved. This is
> **exactly phase 3's C1**, and it takes phase 3's solution. **The direction, not the kind, is what
> makes a party the payer or the beneficiary.**

> **P4-C6 — the export does not know this document type.** `asan_list_journal_export` has branches
> for `payment_receipt`, `payment_voucher` and `mutual_settlement` and **none for `dual_document`**,
> so a dual document gets the plainer label and `description_quality = 'simple'`. Its **classifier**
> matters more: it is a bank-sign heuristic, and a dual document has **no bank line at all**, so
> `bank_net = 0` — the document classifies as `third_party` if either party is an `external_party`
> and `unclassified` otherwise. It still exports. **Phase 5 owns the export**; this is recorded, not
> fixed.

## The intermediary and the fee (P4-C4)

**T11, `MASTER-CHECKLIST` 4.6 and requirement 207 cannot all be true at once.** T11 makes the
record-only roles Asan-code-free; 4.6 wants a third journal line; a journal line needs an
`account_ref_id` the validator accepts; 207 made the صراف's Asan code optional.

**The reading adopted — raised as OG-21 for confirmation:**

* **Fee = 0** → the intermediary is **metadata only**. No line, no balance effect, **no code
  required**. Exactly T11 and requirement 207.
* **Fee > 0** → the intermediary is **a party we are paying**. Money is recorded against them, so
  under T10 they are a counterparty whose balance moves and under T3 they need a code — like any
  other paid party. The record-only class covers the transferrer and the recipient, who *receive
  nothing*; it need not cover someone we pay a fee to.

This needs no new `account_kind` (the صراف is an `external_parties` row), satisfies 4.6's Accept, and
keeps the document exportable.

| `p_fee_borne_by` | Effect | Balanced? |
|---|---|---|
| `'payer'` | payer is credited `amount + fee`; beneficiary debited `amount`; intermediary debited `fee` | yes |
| `'beneficiary'` | payer credited `amount`; beneficiary debited `amount − fee`; intermediary debited `fee` | yes — and `fee < amount` is enforced, or the beneficiary's line would be zero or negative and violate `journal_lines_one_side` |
| **`'us'`** | **REFUSED, `P0001`** | — |

> **`'us'` is unrepresentable, not merely unimplemented.** If we bear the fee, the entry needs a
> credit to the intermediary and a **debit to an expense of ours** — and there is **no expense
> `account_kind`**. The live CHECK admits only `customer_credit, bank, external_party, invoice_ar,
> clearing, other, supplier_payable, cheque_receivable, cheque_payable`. Posting to `other` or
> `clearing` would use a control account with no Asan code, which blocks the **whole document** from
> the export (Part 3 rule 2) — silently and permanently. Inventing a kind is forbidden by T13
> constraint 1. **OG-21 carries the question.**

## One amount, not two — D9, owner-confirmed

The contract takes a **single** amount. The owner confirmed on 2026-08-18 that the two sides of a
dual document are always equal, and that 100 owed with 60 to the creditor and 40 to us is **two
documents** — one dual for 60 and one ordinary receipt for 40 — never one dual with unequal sides.
**D9 is not reopenable.**

Task 4.4's *"unequal amounts raise `P0001`"* is therefore **unreachable through the parameter by
construction**, which is the point of D9. What remains reachable is an imbalance produced by the fee
arithmetic, and the balance assertion catches it: `sum(debit)` must equal `sum(credit)` before
anything is returned, or `P0001`.

## `p_description` is mandatory here and optional elsewhere

In the accounting-document layout the tracking number and the party name are buried inside the شرح
column, so the description is the only context an accountant sees in Asan for this document.

## What T14 forbids this function from checking

T14 records that the ledger holds **money movements only** — purchases and sales never post, so a
party's ledger position is **not** their balance. `create_dual_document` therefore does **not** refuse
a document because the payer's ledger position fails to show them owing us. It usually will not, and
that is evidence of nothing. **No such check exists, and none should be added.**

## Role gate and grants

`admin`, `accountant`, `manager` (OG-13 answer (a)), via `public.has_any_role` with an explicit
`::app_role[]` cast — both overloads match an uncast array. `EXECUTE` revoked from `PUBLIC` and
`anon`, granted to `authenticated` and `service_role`.

Proved end to end: `sales` → `42501`; `accountant` → succeeds; **`manager` → succeeds and can read
back the numbering row**.

Both parties' Asan codes are checked **before the number is minted**, so a document refused for a
missing code burns no serial. Measured: after nine refusal tests, `document_numbers` for `doc_type`
`dual` held exactly the 50 rows the successful stress run created.

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

> Items 1 and 5 were corrected on 2026-08-19 (Gate A phase 2, defect M2). They previously said
> `23505` was a success path and that retrying on timeout was safe. Both were false, and both
> would have produced duplicate permanent documents. If you are reading a cached copy of this
> file, re-read it.

1. **`23505` is a real error**, not a success. These functions cannot raise it as a "document
   already exists" replay — each call mints a fresh `source_id`, so the unique index on
   `journal_entries (source_type, source_id)` can never match a previous call. If you see it,
   something genuinely collided; surface it.
2. **`P0001` messages are for the user.** Display verbatim; they are written in Persian for that.
3. **`42501` never means "empty"** — it means no permission. Do not render an empty state.
4. **Fractional amounts** are rejected server-side; also block them in the form so the user learns
   before submitting.
5. **Retry is NOT safe.** There is no idempotency key: a second call creates a second permanent
   document, and it cannot be reversed or deleted. Disable the submit control on first click; on a
   timeout, tell the user the outcome is unknown and send them to check the list rather than
   retrying. See **Idempotency** in the Conventions section for the full rule and the measurement.
6. **`0A000` means "not built yet"**, not "you did something wrong". Today only
   `p_attachment_ids` raises it. Do not retry; do not show a validation error against a field.
7. **Dates are bounded.** `p_payment_date` may not be in the future, and may not be older than the
   previous Jalali year. Enforce the same bounds in the date picker so the user learns before
   submitting rather than after (migration 351, Gate A M6).
