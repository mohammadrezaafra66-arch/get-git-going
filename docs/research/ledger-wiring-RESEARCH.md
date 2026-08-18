# Ledger wiring research — 2026-08-16 — commit 99f6bd58

Read-only investigation. No writes were performed against the database, the repo, or the
containers. Live source: `afrakala-lan-db` / database `afrakala`, queried as `supabase_admin`
via `docker cp` + `psql -f`, output captured to a file inside the container and copied back.

---

## Verdict on each suspicion

| # | Suspicion | Verdict | Evidence |
|---|---|---|---|
| 1 | `post_receipt_journal` was neutralised by migration 149, so `payment_receipts.beneficiary_accounting_code` never reaches the ledger even though the create-receipt form previews it | **CONFIRMED** (both halves, but the mechanism is not the one assumed — see note) | A4, A5, A6, S4, S10, B2 |
| 2 | Nothing debits `customer_credit` on a sale and nothing credits `supplier_payable` on a purchase, so `person_settlement_position` returns meaningless numbers | **CONFIRMED for the sale side. REFUTED as stated for the purchase side** — see below | A1, A3, S1, S2, S5, S6, S12, S13, A11 |
| 3 | A standalone `payment_vouchers` row created through the UI produces no `journal_entries` row; only `pay_purchase_with_voucher` writes one | **CONFIRMED** | A9, S7, S17, B-vouchers, A3/S1 |

### Note on suspicion 1

The neutralisation is real and total: `post_receipt_journal` is a 618-character function whose
entire body is `RETURN NULL;` (A5). But the *reason* `beneficiary_accounting_code` never reaches
the ledger is not only that. The live authoritative path, `post_receipt_accounting`, **does not
reference `beneficiary_accounting_code` at all** (S4: `refs_beneficiary = f`). It resolves the
receiver code from `receipt.receiver_accounting_code`, then `external_parties.accounting_code`,
then `bank_accounts.accounting_code` (S5, lines "Resolve receiver accounting code"). So even if
149 were reverted, the beneficiary column would still be dropped by the surviving path.

### Note on suspicion 2 — purchase side is wired, sale side is not

- **Purchase side: REFUTED as stated.** `pay_purchase_with_voucher` writes
  `('supplier_payable', purchase.supplier_id, _amt, 0)` (S6). `supplier_payable` is a legal
  `account_kind` in the live CHECK (A14). So a purchase *paid through that RPC* does credit-side
  wire the supplier. What is missing is the **accrual**: nothing writes `supplier_payable` when
  the purchase is *created* — only when it is *paid*. And the paid line is a **debit**, not a
  credit, so `person_settlement_position` (which computes payable as `SUM(credit - debit)`, S12)
  would read a paid-only supplier as **negative payable**.
- **Sale side: CONFIRMED.** The only function that writes `customer_credit` as a **credit** is
  `post_receipt_accounting` (S2, S5) — i.e. money received. Nothing anywhere debits
  `customer_credit` for a sale. There is no `sales_invoices` table at all (S13/S14); sales live
  in `sales_quotes` (57 rows) and no function touching `journal_lines` mentions it (A3).
- **Net effect on تهاتر:** `person_settlement_position` computes receivable as
  `SUM(debit − credit)` over `customer_credit`. With only receipts posting, and receipts always
  writing `customer_credit` on the **credit** side, receivable can only ever be **≤ 0**. A
  customer who owes money shows as owing nothing. Confirmed empirically at A11 (the one dual-role
  person returns `receivable = 0, payable = 0`) — though with 1 journal entry in the whole
  database that number is uninformative on its own; the structural argument above is the evidence.

---

## A. Live database findings

### A1 — `journal_lines` by `account_kind`

| account_kind | lines | entries | total_debit | total_credit |
|---|---|---|---|---|
| bank | 1 | 1 | 10,100,000,000.00 | 0 |
| customer_credit | 1 | 1 | 0 | 10,100,000,000.00 |

Two lines total. No `supplier_payable`, `external_party`, `invoice_ar`, `clearing`, or `other`
line has ever been written.

### A2 — `journal_entries` by `source_type` / `status`

| source_type | status | n | first | last |
|---|---|---|---|---|
| payment_receipt | posted | 1 | 2026-07-25 | 2026-07-25 |

One entry in the entire ledger.

### A3 — functions whose body mentions `journal_lines`

The query as written in the mission brief **failed** (`ERROR: "array_agg" is an aggregate
function` — `pg_get_functiondef` rejects aggregates). Re-run with `prokind IN ('f','p')`:

| proname | writes `journal_lines` | def_len |
|---|---|---|
| `pay_purchase_with_voucher` | **yes** | 8178 |
| `post_mutual_settlement` | **yes** | 7064 |
| `post_receipt_accounting` | **yes** | 8134 |
| `asan_list_journal_export` | no (reads) | 10262 |
| `list_mutual_settlement_candidates` | no (reads) | 2245 |
| `person_settlement_position` | no (reads) | 2345 |
| `polymorphic_ref_orphan_report` | no (reads) | 2175 |
| `post_receipt_journal` | no | 618 |
| `validate_journal_entry_balance` | no (reads) | 545 |

Exactly **three** functions write ledger lines. (S1 confirms the same three are the only ones
that `INSERT INTO journal_entries`.)

### A4 — is `post_receipt_journal` a no-op?

| proname | has_insert | def_len |
|---|---|---|
| `post_receipt_accounting` | t | 8134 |
| `post_receipt_journal` | **f** | **618** |

### A5 — live body of `post_receipt_journal`

```sql
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. This former Path A wrote
  -- account_kind='accounting_code', which the journal_lines CHECK forbids, and
  -- it duplicated posting. Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
$function$
```

The live definition matches the migration-149 hypothesis exactly.

### A6 — triggers on `payment_receipts` (6, all enabled `O`)

| tgname | function |
|---|---|
| `trg_normalize_phone` | `tg_normalize_phone_columns` |
| `trg_payment_receipts_derive_person` | `tg_payment_receipts_derive_person` |
| `trg_payment_receipts_enforce_allocation_on_approve` | `enforce_receipt_approval_allocation_limits` |
| `trg_payment_receipts_post_journal` | `trg_post_receipt_on_approve` |
| `trg_payment_receipts_recompute_employee_score` | `recompute_employee_scores_on_receipt` |
| `trg_payment_receipts_updated_at` | `set_updated_at_now` |

`trg_payment_receipts_post_journal` is still attached and still fires; it calls the dead function.

### A7 — does beneficiary ever differ from receiver?

| with_beneficiary | differs_from_receiver | total_receipts |
|---|---|---|
| 5 | **4** | 7 |

Four real receipts carry a beneficiary code that is *not* the receiver code. This is the field
the ledger path ignores.

### A8 — receipts whose posted entry ignored the beneficiary

`mismatched_entries = 0`.

**This zero is not exoneration.** Only 1 of the 7 receipts has ever been posted (A2), and the
join requires a posted entry to exist. Of the 4 receipts where beneficiary ≠ receiver, none is
posted, so none can appear in this count. The query cannot detect the problem on this dataset.

### A9 — vouchers with and without a ledger entry

| vouchers | from_purchase | with_journal_entry |
|---|---|---|
| **0** | 0 | 0 |

`payment_vouchers` is empty, so suspicion 3 cannot be confirmed from data. It is confirmed from
code instead (S7 + S17 + B: no trigger and no direct-insert path writes a journal entry).

### A10 — dual-role persons

`dual_role_persons = 1`.

### A11 — settlement position, RPC body replicated

| person_id | receivable | payable |
|---|---|---|
| `23b44c71-8cfc-4329-bebb-a04170969664` | 0 | 0 |

### A12 — purchases and payment state

| purchases | unpaid | paid |
|---|---|---|
| 101 | **101** | **0** |

Not one purchase has been paid. `purchases.paid_at` is a single nullable timestamp — there is no
partial-payment representation on the purchase row; it is paid or it is not. (S22: 101 purchases,
**9** have a `supplier_id`, 101 have a `total_amount`.)

### A13 — `tracking_number` and `payment_receipts` constraints

`tracking_number`: `attnotnull = t` (**NOT NULL**).

16 constraints, notably:
- `payment_receipts_receiver_exclusive_chk` — exactly one of `destination_bank_account_id` /
  `receiver_party_id`, unless `status = 'pending_review'` and both are null.
- `payment_receipts_posting_status_check` — `unposted` | `posted`.
- `payment_receipts_status_check` — `pending_review` | `approved` | `rejected`.
- `payment_receipts_document_channel_check` — `card_to_card`, `paya`, `pol`, `satna`, `cash`, `cheque`, `other`.
- `payment_receipts_receipt_type_check` — `invoice_payment`, `debt_payment`, `prepayment`, `positive_credit`.
- `payment_receipts_cheque_fields_chk`, `payment_receipts_receipt_time_format_check`,
  `payment_receipts_amount_check` (`amount > 0`).
- **No constraint mentions `beneficiary_accounting_code`.** The column exists and is nullable (S21).

### A14 — live `account_kind` CHECK

```
journal_lines_account_kind_chk
  CHECK (account_kind = ANY (ARRAY['customer_credit','bank','external_party',
                                   'invoice_ar','clearing','other','supplier_payable']))
```

Plus `journal_lines_credit_nonneg`, `journal_lines_debit_nonneg`, and `journal_lines_one_side`
(exactly one of debit/credit non-zero). `supplier_payable` **is** permitted — the value
migration 149 complained about (`accounting_code`) is not.

### A15 — `mutual_settlements` rows

`settlements = 0`.

### Supplementary queries (needed to test suspicions 2 and 3)

- **S1** — only three functions `INSERT INTO journal_entries`: `pay_purchase_with_voucher`,
  `post_mutual_settlement`, `post_receipt_accounting`.
- **S2** — `account_kind` literals per function: `post_receipt_accounting` uses
  `bank`, `customer_credit`, `external_party`. `pay_purchase_with_voucher` uses `bank`,
  `external_party`, `other`, `supplier_payable`. `post_mutual_settlement` uses `bank`,
  `customer_credit`, `supplier_payable`.
- **S3 / S15** — `journal_entries` has **no CHECK on `source_type`** (only
  `journal_entries_status_chk` on status). It does have
  `journal_entries_source_unique UNIQUE (source_type, source_id)`, which is what makes all three
  posting functions idempotent.
- **S4** — `refs_beneficiary`: true only for `pay_purchase_with_voucher` (in a comment).
  `post_receipt_accounting` → `refs_beneficiary = f`, `refs_receiver = t`.
- **S5** — `post_receipt_accounting` body. Receiver code resolution order:
  `receipt.receiver_accounting_code` → `external_parties.accounting_code` →
  `bank_accounts.accounting_code` (raises 23514 if the bank code is blank). Lines written:
  `(1, bank|external_party, ref, amount, 0)` and `(2, 'customer_credit', customer_id, 0, amount)`.
  It also calls `increase_credit(...)`. Migration 327 removed the invoice-allocation loop.
- **S6** — `pay_purchase_with_voucher` body. Inserts the voucher, sets `purchases.paid_at`, then
  writes `(1,'supplier_payable', purchase.supplier_id, _amt, 0)` and `(2,'bank', source_account,
  0, _amt)`, asserts balance, and writes an `audit_logs` row. Note the `supplier_payable` line
  uses `_purchase.supplier_id` **even when the payee is an external party or 'other'** — in the
  `other` branch `supplier_id` is NULL, producing a `supplier_payable` line with a NULL
  `account_ref_id`.
- **S7** — triggers on `payment_vouchers`: `trg_payment_vouchers_derive_person`,
  `trg_payment_vouchers_number`, `trg_payment_vouchers_updated_at`. **None posts to the ledger.**
  `purchases` has 7 triggers, none ledger-related. `sales_invoices` / `invoices` / `pre_invoices`
  **do not exist**.
- **S10** — `trg_post_receipt_on_approve` still guards on
  `COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL` before
  calling the dead `post_receipt_journal`. The beneficiary column is read here and nowhere else
  in the posting chain.
- **S11** — approved receipts: 1; of those, `posting_status='posted'`: 1.
- **S12** — `person_settlement_position` and `list_mutual_settlement_candidates` bodies confirm
  receivable = `SUM(debit − credit)` over `customer_credit`, payable = `SUM(credit − debit)` over
  `supplier_payable`, both filtered to `je.status='posted'`.
- **S13** — row counts: purchases 101, payment_receipts 7, payment_vouchers 0, journal_entries 1,
  journal_lines 2, sales_quotes 57, customers 23, suppliers 15. `sales_invoices` **does not
  exist** (the mission's assumed table name is wrong).
- **S14** — no table named `invoices`/`sales_invoices`. Sales-side tables are `sales_quotes`,
  `sales_quote_items`, `sale_lists`, etc.
- **S16** — distinct `account_ref_id` per kind: `bank` 1, `customer_credit` 1, zero NULLs.
- **S18** — `payment_vouchers_insert_finance` (INSERT, `WITH CHECK has_any_role(admin,
  accountant)`) — an admin/accountant **can insert a voucher row directly**, bypassing any RPC.
- **S19** — `journal_entries` / `journal_lines` both have INSERT/UPDATE policies for
  admin+accountant and SELECT for admin+manager+accountant, plus a `viewer_restricted` ALL policy.
  **There is no DELETE policy on either table.**
- **S20** — `post_mutual_settlement` body: writes `supplier_payable` debit + `customer_credit`
  credit for the offset, plus bank/counterparty lines for the cash difference; asserts balance;
  audit-logs. It sources its numbers from `person_settlement_position`, so it inherits whatever
  that function reports.
- **S21** — `payment_receipts` has both `receiver_accounting_code` and
  `beneficiary_accounting_code`, both nullable text.

---

## B. Code findings

### B1 — imports of `PaymentReceiptForm`

Exactly **one** import:

- `src/routes/_app.accounting.receipts.create.tsx:7` → rendered at line 31, route
  `/_app/accounting/receipts/create`, guarded by `requireAnyRole(["admin","accountant"])`.

Reachability from `src/lib/navigation/registry.ts`: the route
**`/accounting/receipts/create` is NOT itself a registry entry.** The registry contains
`/accounting/receipts` (line 431) and `/accounting/receipts/training` (line 438). The create page
is reached by in-page links only:

- `src/routes/_app.accounting.receipts.tsx:344` — button on the receipts list page.
- `src/components/accounting/PaymentReceiptGuide.tsx:137`.

`registry.ts:1171` grants `/accounting/receipts` to `["accountant"]`; `registry.ts:1161` sets its
depth to 2. The only other mention of the component is a comment at `registry.ts:892`.

### B2 — the "پیش‌نمایش سند حسابداری خودکار" block

`src/shared/components/PaymentReceiptForm.tsx:1720–1768`.

The debit-side expression, **lines 1723–1724**:

```ts
const benefCode =
  form.watch("beneficiary_accounting_code") || form.watch("receiver_accounting_code");
```

Guard, line 1726: `if (!payerCode || !benefCode || amt <= 0) return null;`

The preview table renders (lines 1743–1763):
- **Debit** row: `ذینفع (طلبکار)` with code `benefCode` and amount `amt` (line 1748/1750).
- **Credit** row: `پرداخت‌کننده` with code `payerCode` and amount `amt` (line 1759/1762).

So the UI promises "پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود" (line 1731) with
`beneficiary_accounting_code` on the debit side. The live posting function
(`post_receipt_accounting`, S5) never reads that column, and the debit line it actually writes is
`account_kind='bank'` or `'external_party'` carrying `receiver_accounting_code`. **The preview
and the posted entry disagree whenever beneficiary ≠ receiver — which is true for 4 of 7
receipts (A7).**

### B3 — who calls `post_receipt_journal`?

- **Frontend: nobody.** The only `src/` hit is the generated type declaration at
  `src/integrations/supabase/types.ts:12158`. No `supabase.rpc("post_receipt_journal", …)`
  anywhere.
- **SQL: one caller** — `trg_post_receipt_on_approve` (S10), the function behind trigger
  `trg_payment_receipts_post_journal` on `payment_receipts` (A6). It calls the dead function, so
  approving a receipt does nothing ledger-wise via this path.
- The live path used by the UI is `post_receipt_accounting`, invoked explicitly at
  `src/routes/_app.accounting.receipts.$receiptId.tsx:335`
  (`supabase.rpc("post_receipt_accounting", …)`) — i.e. a **separate manual "post" action on the
  receipt detail page**, not an automatic consequence of approval as line 1731 of the form claims.

### B4 — anything writing `journal_entries` with another `source_type`?

**Nothing.** Across `supabase/migrations/` the only `source_type` string literals paired with
`journal_entries` are `'payment_receipt'`, `'payment_voucher'`, and `'mutual_settlement'`. The
ten `INSERT INTO public.journal_entries` sites in migrations are all successive versions of the
same three functions (78573527, fa57aaaf, 5a098d83, 5e17467e, 149, 155, 220, 313, 319, 327).

In `src/`, no code inserts into `journal_entries` or `journal_lines` at all — the only hits are
reads at `src/routes/_app.accounting.receipts.$receiptId.tsx:279` and `:296`, a comment in
`src/lib/asan/export-journal-rows.ts:57`, and generated types.

Note: the `'purchase'` and `'sales_quote'` literals that a naive grep surfaces belong to
`stock_movements.ref_type` and to `audit_logs` payloads, not to `journal_entries`.

**Voucher creation path (evidence for suspicion 3).** `src/lib/treasury/queries.ts:189–218`
`createPaymentVoucher()` does a **direct `supabase.from("payment_vouchers").insert({… status:
"approved" …})`** — no RPC, no journal. Its only caller is
`src/routes/_app.accounting.payment-vouchers.tsx:179`, a page that **is** in the navigation
registry (`registry.ts:481`, roles `["admin","manager","accountant"]` at `registry.ts:1215`).
RLS permits it (S18). No trigger compensates (S7). The RPC path
`payPurchaseWithVoucher()` (`queries.ts:248`) is called only from
`src/routes/_app.accounting.purchase-payments.tsx:169`.

So: **money can leave the treasury through `/accounting/payment-vouchers` with no ledger entry
whatsoever.** The table is currently empty (A9), so nothing has been lost yet.

### B5 — repo state

- `git rev-parse --short HEAD` → **`99f6bd58`** (branch `staging`)
- `git status --short` → **3 lines** (all untracked, pre-existing: `audit/`,
  `docs/audits/7-eg-checklist-mission.md`,
  `docs/execution/production-gap-analysis-mission.md`)

Nothing was committed, stashed, checked out, or branched. Writing this report adds a 4th
untracked path (`docs/research/ledger-wiring-RESEARCH.md`); it is left uncommitted.

---

## C. Contradictions between migration files and live database

1. **`schema_full_export.sql` still contains the pre-149 `post_receipt_journal`.** It is listed
   among the files matching `post_receipt_journal`. Per the mission's own rule this file is
   unreliable and was not used as evidence; recording it here because anyone grepping the repo
   will hit it and conclude the function still posts.
2. **Migration 149's stated justification no longer holds.** Its comment says Path A wrote
   `account_kind='accounting_code'`, "which the `journal_lines` CHECK forbids". True — but the
   live CHECK (A14) now also permits `supplier_payable`, added later. The comment is a frozen
   snapshot of a 2026-07-24 constraint, not the current one.
3. **The neutralised function's trigger was deliberately left attached.** The comment in A5 says
   the trigger is "kept … for history"; the live state (A6) confirms `tgenabled = 'O'`. So the
   database still evaluates `beneficiary_accounting_code` on every approve (S10) purely to decide
   whether to call a function that returns NULL.
4. **`post_receipt_accounting` comment vs. UI copy.** Migration 155's comment in the live body
   says the bank branch now resolves its code "exactly the way the external-party branch does".
   That is accurate. What no migration comment mentions is that `beneficiary_accounting_code` is
   never consulted — while the UI (B2, line 1731) states the previewed document is posted
   automatically on approval. Neither claim is annotated as wrong anywhere in SQL.
5. **The mission brief assumed a `sales_invoices` table.** It does not exist (S13/S14). Query A11
   and the suspicion-2 framing were written against a schema that is no longer current; sales are
   `sales_quotes`.
6. **Query A3 as specified cannot run** on this database (`pg_get_functiondef` on the `array_agg`
   aggregate). Reported result is from the corrected variant with `prokind IN ('f','p')`.

---

## D. Open questions

1. **Is `beneficiary_accounting_code` supposed to be the ledger's debit account, or is the UI
   preview simply wrong?** Both are one-line fixes in opposite directions. 4 of 7 existing
   receipts have a divergent value (A7), so this is a live data question, not hypothetical.
   Answering it requires the business owner, not the code.
2. **Should approving a receipt post automatically?** The form says it does (line 1731); in
   reality posting is a separate manual RPC call from the detail page (B3). Which behaviour is
   intended determines whether `trg_post_receipt_on_approve` should be repointed at
   `post_receipt_accounting` or the UI copy corrected. Note that repointing it would fail:
   `post_receipt_accounting` requires `auth.uid()` and a `p_user_id`, and its role gate would
   need re-examining inside a trigger context.
3. **Where should the sale-side accrual live?** There is no invoice table. Posting
   `customer_credit` as a debit would have to hang off `sales_quotes` (57 rows) or off a
   not-yet-existing document. This is an architecture decision, explicitly out of scope for a
   code change under CLAUDE.md rule 15.
4. **Where should the purchase-side accrual live?** `purchases` has 101 rows, of which only 9
   have a `supplier_id` (S22). Any `supplier_payable` accrual keyed on `supplier_id` would cover
   9% of purchases. What the other 92 rows represent needs establishing first.
5. **Sign convention on `supplier_payable`.** `pay_purchase_with_voucher` writes payment as a
   **debit**; `person_settlement_position` computes payable as `SUM(credit − debit)`. With no
   accrual ever writing the credit side, any paid purchase makes payable go negative. Is the
   intended model accrual-then-payment (needs the missing credit), or is the payable line itself
   the wrong sign? **UNCERTAIN** — cannot be settled from 2 journal lines.
6. **`pay_purchase_with_voucher` writes `supplier_payable` with `account_ref_id =
   _purchase.supplier_id` in all three payee branches** (S6), including the `other` branch where
   that value is NULL. Is a NULL-ref `supplier_payable` line acceptable? Never exercised (A1: no
   such line exists), so this is unverified against reality.
7. **Should `/accounting/payment-vouchers` be able to insert a voucher at all?** It is the only
   treasury outflow with no ledger consequence (B4). Closing it means either routing it through a
   posting RPC or removing the page. Both are product decisions.
8. **No DELETE policy exists on `journal_entries` / `journal_lines`** (S19), and `status` allows
   `'void'` (S3) — but no function sets it. How a wrong entry is meant to be reversed is
   undefined. **UNCERTAIN.**
9. **Does the single existing journal entry (10,100,000,000) correspond to a receipt whose
   beneficiary matched its receiver?** A8 says no mismatch, but with 1 posted row that is not
   evidence either way. Would need per-row inspection of Persian data, deliberately not dumped to
   the terminal.

---

## BLOCKED

Nothing was blocked by the read-only constraint. Two items could not be *verified* for reasons
other than write permission, and are recorded as UNCERTAIN rather than blocked:

- **Suspicion 3 has zero data behind it** — `payment_vouchers` holds 0 rows (A9). The verdict
  rests entirely on code + trigger + RLS inspection (B4, S7, S17, S18). Confirming it empirically
  would require creating a voucher, which is a write.
- **`list_mutual_settlement_candidates()` and `person_settlement_position()` were not called
  directly**, as instructed — `auth.uid()` is NULL in `psql` and both raise `42501`. Their inner
  queries were replicated by hand (A11) and their bodies read via `pg_get_functiondef` (S12).

---

```
PART A: done — A1, A2, A4..A15 ran as specified. A3 ran only after correction
        (as written it errors on pg_get_functiondef over the array_agg aggregate;
        re-run with prokind IN ('f','p')). Supplementary read-only queries S1..S22
        were added to test suspicions 2 and 3, which A1..A15 alone could not settle.
PART B: done — B1, B2, B3, B4, B5 all completed.
Writes performed: NONE
Container restarted: NO
Next mission: none until human review
```
