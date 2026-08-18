# Ground truth — the system as it actually is

Every claim here was measured on the **test** database (`afrakala` on `afrakala-lan-db`) at code
`99f6bd58`, branch `staging`. Items that are inferred rather than measured are marked `INFERRED`;
unknowns are marked `UNKNOWN` and repeated in Open Questions.

**Re-verify before relying on any of this.** A verification command is given for each item. If a
command returns something other than what is written here, that is a stop-the-line event: record the
contradiction in the phase progress file and move to the next independent task. Do not adapt silently.

---

## 1. The ledger is empty and nothing fills it

| Fact | Verify with |
|---|---|
| `journal_entries` holds 1 row, `journal_lines` 2 rows | `SELECT count(*) FROM journal_entries;` |
| The only entry has `source_type='payment_receipt'` | `SELECT source_type, status, count(*) FROM journal_entries GROUP BY 1,2;` |
| Of 7 `account_kind` values, only 2 were ever written | `SELECT account_kind, count(*) FROM journal_lines GROUP BY 1;` |
| The receipt create page calls **no RPC** — four plain PostgREST inserts | `src/shared/components/PaymentReceiptForm.tsx` |
| `createPaymentVoucher` is a bare insert with `status:"approved"`, no ledger write | `src/lib/treasury/queries.ts:189` |
| `payment_vouchers` holds 0 rows | `SELECT count(*) FROM payment_vouchers;` |
| `mutual_settlements` holds 0 rows | `SELECT count(*) FROM mutual_settlements;` |

**Consequence:** party balances in AfraKala are not real. Only an approved receipt moves anything,
and only through a manual second step on the detail page.

---

## 2. The one posting function that works

`post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)` — `SECURITY DEFINER`, exists, correct.

- Called from exactly one place: `src/routes/_app.accounting.receipts.$receiptId.tsx:335`.
- Refuses any receipt not already `status='approved'`.
- Idempotent via `UNIQUE (source_type, source_id)` on `journal_entries`.
- Reads **8** of the receipt's 33 fields: `customer_id`, `amount`, `destination_bank_account_id`,
  `receiver_party_id`, `payer_accounting_code`, `receiver_accounting_code`, `payment_date`,
  `tracking_number`.
- The **only** branch choosing the debit side is `destination_bank_account_id IS NOT NULL`
  → debit `bank`; otherwise debit `external_party`. Credit is always `customer_credit` by
  `customer_id`.
- Receiver-code resolution order: `receiver_accounting_code` → `receiver_party_id` →
  `destination_bank_account_id`. The first non-null wins and **overrides** the rest.
- Raises if the destination bank account has no `accounting_code`.

Verify: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='post_receipt_accounting';`

This function is the reference implementation for phase 2. Read it before writing anything.

---

## 3. Dead paths — remove, do not work around

| Object | State |
|---|---|
| `post_receipt_journal` | `RETURN NULL` no-op. Neutered because it wrote `account_kind='accounting_code'`, which the CHECK forbids. |
| `trg_payment_receipts_post_journal` | Still attached to `payment_receipts`, still fires, does nothing. |
| `beneficiary_accounting_code` | Stored, displayed in the form's journal preview, **never reaches the ledger** — its only reader was the no-op above. |
| `is_mobile_bank_screenshot` | Passed to the warning evaluator, never read. |
| `receipt_image_url` | Never assigned; always inserted as `null`. |
| The form's journal preview | A hardcoded two-row table showing debit=beneficiary / credit=payer. **Materially false**: the real entry is debit=bank-or-external-party / credit=`customer_credit`. Its caption promising automatic posting on approval is false twice over. |

---

## 4. Two real defects in the create path

1. **The rollback is fictional.** On link-insert failure the page calls `.delete()` on
   `payment_receipts`, but that table has **no DELETE policy**, so the delete matches 0 rows and
   returns 204. A failed link insert leaves an orphan `pending_review` receipt — with no audit row
   either, because the audit write happens *after* the link insert.
   Verify: `SELECT cmd, policyname FROM pg_policies WHERE tablename='payment_receipts';`
2. **Confirmed security warnings can be discarded** when the duplicate dialog follows the warnings
   dialog; the column persists as `[]` and the confirmation audit row is never written.

Both vanish when creation becomes a single RPC (phase 2). Neither is worth patching separately.

---

## 5. Schema constraints that will bite

| Constraint | Consequence |
|---|---|
| `payment_receipts.tracking_number` `NOT NULL`, no default | A cash receipt has no bank tracking number. Phase 1 must mint an internal one or creation fails. |
| `payment_receipts.payment_time` required, no default | The new form must send it or the insert fails. |
| `journal_entries UNIQUE (source_type, source_id)` | One entry per source document. This *is* the idempotency mechanism — preserve it. |
| `journal_entries.source_id` is **not** an FK | Deleting a source document silently orphans its entry. |
| `journal_lines_one_side` CHECK | Exactly one of debit/credit is > 0 per line, so a zero-amount line cannot exist. The Asan export relies on this. |
| `account_kind` CHECK | `customer_credit, bank, external_party, invoice_ar, clearing, other, supplier_payable`. Nothing else is insertable until task 1.4 widens it. |
| `payment_vouchers_payee_matches_type_chk` | Already enforces the payee XOR by `payee_type`. Reuse it; do not replace it. |
| `person_id NOT NULL` on `customers` and `suppliers` | A customer or supplier with no person record is structurally impossible. |

---

## 6. Columns that already exist and are simply unused

Phase 3 is **wiring, not building**:

- `payment_vouchers.payee_party_id` (FK → `external_parties`), `payee_name`, `tracking_number`,
  `document_channel`, `purchase_id` — all present. `createPaymentVoucher` ignores most of them.
- `payment_vouchers.payee_type` accepts `supplier | external_party | customer | other`.
- `pay_purchase_with_voucher` already writes a balanced entry using `supplier_payable`. It is the
  working reference for phase 3.

---

## 7. The Asan export contract

Six options exist at `/admin/asan-export`. Three are the **same** six-column accounting-document
layout from one function, differing only by filter:

| Option (Persian) | Function | Reads from |
|---|---|---|
| فاکتورهای فروش | `asan_list_sales_export` | `sales_quotes` |
| فاکتورهای خرید | `asan_list_purchase_export` | `purchases` |
| دریافت‌ها و واریزها | `asan_list_journal_export(..., 'receipt')` | **`journal_entries`** |
| پرداخت‌ها و برداشت‌ها | `asan_list_journal_export(..., 'payment')` | **`journal_entries`** |
| اسناد شخص ثالث (دوبل) | `asan_list_journal_export(..., 'third_party')` | **`journal_entries`** |
| واریزی‌های بانکی (مسیر جایگزین) | `asan_list_bank_deposit_export` | `payment_receipts` |

**The owner imports the Persian-header accounting-document layout (بدهکار / بستانکار)** — one of the
three ledger-backed options. The ledger is therefore a hard prerequisite, not a later phase.

Rules already baked into `asan_list_journal_export`. The new RPCs must satisfy all of them or their
documents are silently withheld:

1. Only `status='posted'` entries are considered.
2. An unbalanced document (`sum(debit) <> sum(credit)`) is **excluded entirely**, not flagged.
3. **One unresolvable line blocks the whole document**, never just that line.
4. `invoice_ar`, `clearing` and `other` **never** resolve to a code and always block. The owner has
   stated there is no clearing/suspense account in Asan.
5. Fractional Toman amounts block — the ×10 conversion to Rial must be exact.
6. Code resolution: `customer_credit` → `customers.person_id` →
   `person_identifiers(kind='asan_person_code')`; `bank` → `bank_accounts.accounting_code`;
   `external_party` → `external_parties.accounting_code`.
7. `payer_accounting_code` is **deliberately not** an identity source. Migration 295 carries an
   explicit gate forbidding it: free text must never become a person code.
8. The classifier derives kind from line `account_kind`s: any `external_party` line →
   `third_party`; net bank debit > 0 → `receipt`; < 0 → `payment`; else `unclassified`.
   **A dual document with no bank line classifies as `unclassified` and appears in no menu option.**
   This is exactly why decision A1 introduces an explicit `doc_kind`.

Amounts leave SQL in **Toman**; the ×10 conversion to Rial happens once, in
`src/lib/asan/amounts.ts`. Never convert in SQL.

---

## 8. Document numbering already exists

`asan_export_numbers` + `asan_assign_document_number(doc_type, source_id)`: idempotent,
advisory-lock + `max+1`, never reused, burned on delete via triggers. `doc_type` CHECK allows
`sales_invoice | purchase_invoice | accounting_document`.

**This is the proven pattern for task 1.2.** Do not invent a second scheme. Note it deliberately
avoids a sequence, because a sequence burns a value on rollback and creates gaps nobody can explain.

---

## 9. Authorisation facts that break naive code

- `has_role` and `has_any_role` each have **two overloads** (`app_role` and `text`); neither can be
  dropped. Calling either through `supabase.rpc(...)` throws `PGRST203`. From the front end, read
  `user_roles` directly with `supabaseAdmin`.
- `user_roles.role` is **TEXT** on the live database, though many policies still compare against the
  `app_role` enum. Comparing without a cast throws `operator does not exist`. Inside SQL use
  `public.has_role`.
- `has_dynamic_permission` **grants access to all roles when a module has no `role_permissions`
  row.** Any new module must be seeded with an explicit row per role, or it is open by default.
- RLS SELECT violations do not error — they return zero rows, which upstream reads as "no data".
- A table with no DELETE policy accepts `DELETE` and returns 204 having deleted nothing.
- `auth.uid()` is NULL in `psql`, so role-gated `SECURITY DEFINER` functions raise `42501` there.
  To measure them, replicate the body without the guard; never invoke.

---

## 10. Environment facts

- Server timezone is UTC. Use `public.tehran_today()` for the calendar day.
- The site runs on **HTTP**. `getUserMedia`, `crypto.randomUUID` and `crypto.subtle` need a Secure
  Context, so file upload, voice and key generation do not work until HTTPS lands. `myafrakala.ir`
  is purchased; Let's Encrypt DNS-01 is the intended route. **This gates phase 7.**
- `npm run build` is broken on Windows; build inside Docker.
- `npm run typecheck` takes ~3 minutes and has a **70-error baseline** across 6 files. Not a
  regression. Run it once per phase, not repeatedly.
- Before any build: `$env:DISABLE_LOVABLE_MCP="1"`.
- Ollama at `192.168.170.8:11434`. `bge-m3` emits 1024-dim vectors while `message_embeddings` is
  declared 1536 — known mismatch, out of scope.

---

## 11. Column names that differ from the obvious guess

`persons.display_name` (not `full_name`) · `products.name` (not `title`) · customer credit lives in
`customer_credit_balance`, not on `customers`. **Discover names by querying
`information_schema.columns`, never by assuming.**

---

## 12. Data state on the test database

Anonymised 2026-08-14: names and phone numbers are synthetic; counts, amounts and structure are real.

- 13 of 23 customers have no `asan_person_code`. Under the new mandatory-code rule they could not
  have a document recorded until a code is entered.
- All 11 existing codes are `status='provisional'`; the export does not filter on status, so
  existence alone is sufficient.
- One customer shows `customers.accounting_code = 114067` but has **no** `person_identifiers` row.
  The export reads the identifier, not the mirror — the UI may display a code the export cannot use.
- Purchases lacking a supplier are overwhelmingly automated-test residue (notes containing `E2E_`,
  `PROBE_do_not_keep`, `C3_CONCURRENCY_PROBE`) at trivial amounts.

**Incomplete test data is not a blocker.** The goal is correct infrastructure, proven on test, then
used against production data in phase 9.

---

## Open questions

| # | Question | Status |
|---|---|---|
| Q1 | Exact Asan code for the `invoice_ar` control account | `UNKNOWN` → OG-3 |
| Q2 | Canonical phone format for `normalize_identifier` | `UNKNOWN` → OG-4 |
| Q3 | Should a cheque post on receipt or on clearing? | Safe default D7 in `decisions.md` |
| Q4 | Will the `other` account kind ever be defined? | `UNKNOWN`, deferred |
| Q5 | Does production ledger state match test? | `UNKNOWN` — production not contacted; phase 9 |
