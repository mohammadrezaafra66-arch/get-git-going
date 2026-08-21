# SUB-AGENT C — Wiring chain for `/accounting/receipts/create`

Read-only research. **No file under `src/`, `server/`, `supabase/`, `deploy/` was touched.
No DDL, no DML, no migration, no git operation.** The only file written is this one.

Date: 2026-08-17 · branch `staging` · HEAD `99f6bd58` · database `afrakala` on `afrakala-lan-db`.

Primary sources: `docs/research/_a_frontend.md` (agent A) and `docs/research/_b_database.md`
(agent B). Where I needed a fact neither of them nailed down, I ran five extra read-only
`psql` batches (`C-Q1` … `C-Q17`, method identical to B's: ASCII-only SQL file →
`docker cp` → `psql -f` → `\o` to a file → copied back). Those query ids are cited inline.

---

## C0 — The single most load-bearing fact in this report

`post_receipt_accounting` — the **only** function in the database that writes to
`journal_entries` / `journal_lines` — reads exactly **12 columns** of `payment_receipts`.
Measured directly by extracting every `v_receipt.<col>` reference from the live function
body (query `C-Q16`):

```
amount, customer_id, destination_bank_account_id, id, payer_accounting_code,
payment_date, posted_at, posting_status, receiver_accounting_code,
receiver_party_id, status, tracking_number
```

Of those, `id`, `status`, `posting_status` and `posted_at` are the function's own control
fields. **The ledger therefore depends on exactly 8 user-fillable values:**

| # | column | what it decides in the ledger |
|---|---|---|
| 1 | `customer_id` | `account_ref_id` of the **credit** line; the customer whose credit balance is increased |
| 2 | `amount` | debit and credit amount on both lines; the credit-ledger amount |
| 3 | `destination_bank_account_id` | **the only branch selector**: non-NULL ⇒ debit `account_kind='bank'` with this ref; NULL ⇒ debit `'external_party'` |
| 4 | `receiver_party_id` | `account_ref_id` of the debit line in the `external_party` branch; fallback source of `v_receiver_code` |
| 5 | `payer_accounting_code` | text written to `journal_entries.payer_accounting_code`; blocking-gate input |
| 6 | `receiver_accounting_code` | first branch of `v_receiver_code` → `journal_entries.receiver_accounting_code`; blocking-gate input |
| 7 | `payment_date` | `journal_entries.entry_date` |
| 8 | `tracking_number` | interpolated into `journal_entries.description` |

**All 34 payload keys the create page sends (`PaymentReceiptForm.tsx:980-1018`) minus those
8 are stored-only as far as the ledger is concerned.** That is 26 keys, including every
cheque field, every OCR-derived field, every checkbox, `receipt_type`,
`beneficiary_accounting_code`, `custom_data` and `security_warnings`.

Corroborating negative evidence (query `C-Q1`, token presence in the live body):
`beneficiary_accounting_code`, `receipt_type`, `document_channel`, `bank_name`,
`source_bank`, `source_bank_account_id`, `cheque_number`, `cheque_due_date`,
`custom_data`, `security_warnings`, `receipt_image_url`, `is_mobile_bank_screenshot`,
`has_perforation`, `is_typed_receipt`, `payer_name`, `receiver_name`,
`payer_name_on_receipt`, `receiver_name_on_receipt`, `payer_phone`, `receiver_phone`,
`payment_time`, `receipt_time`, `quote_id` — **all `f` (absent)**.

The token `description` *does* match in the body, but only as the column name in the two
`INSERT` column lists (`C-Q17`, 2 lines) — `v_receipt.description` does not appear in
`C-Q16`. `payment_receipt_links` also matches, but only inside comments describing the
block that migration 330 removed (`C-Q7`). **Neither is a real read.**

---

## C1 — The master wiring table

Reading key for the last-but-one column:

- **[create]** = happens the moment the create page's `INSERT` runs.
- **[approve]** = only when someone flips `status → 'approved'` on the detail page.
- **[post]** = only inside `post_receipt_accounting(p_receipt_id, p_user_id)`.

Row numbers match agent A's A2 numbering.

| # | Persian label | form key | control | → column / table | → constraint or trigger that touches it | → read by which DB function | → effect on ledger / other table | UNCERTAIN |
|---|---|---|---|---|---|---|---|---|
| 1 | مشتری | `customer_id` | searchable-select (`PaymentReceiptForm.tsx:1212-1274`) | `payment_receipts.customer_id` (uuid **NOT NULL**) | FK `→ customers(id) ON DELETE RESTRICT`. **BEFORE trigger `trg_payment_receipts_derive_person`** derives `customer_person_id` from `customers.person_id` **[create]** | `post_receipt_accounting` (`C-Q16`), `increase_credit` | **[post]** credit line: `account_kind='customer_credit'`, `account_ref_id = customer_id`, credit = `amount`. **[post]** `increase_credit` writes `customer_credit_balance` (UPDATE), `customer_credit_ledger` (INSERT) and its own `audit_logs` row (`C-Q9`) | — |
| 2 | نوع فیش | `receipt_type` | select, 4 values | `payment_receipts.receipt_type` (NOT NULL, default `'invoice_payment'`) | CHECK `payment_receipts_receipt_type_check` (`invoice_payment / debt_payment / prepayment / positive_credit`) **[create]** | **ZERO functions in the whole `public` schema mention `receipt_type`** — query `C-Q3` returned **0 rows** | **None on the ledger, ever.** All four values produce the identical two-line entry. Its only server-visible effect is on the *detail* page, where it picks the audit action string `prepayment_credit_added` vs `payment_receipt_approved` (`src/routes/_app.accounting.receipts.$receiptId.tsx:362-364`) **[approve]** | — |
| 3 | اتصال به پیش‌فاکتورها + مبلغ تخصیص | `allocations` (React state, not zod) — `:308`, UI `:1324-1519` | repeatable number inputs | **`payment_receipt_links`** rows `{receipt_id, quote_id, amount}` (`:1028-1036`) | XOR CHECK `payment_receipt_links_one_target`; `amount > 0`; UNIQUE `(receipt_id, quote_id)`; FK `quote_id → sales_quotes RESTRICT`. **BEFORE trigger `enforce_payment_receipt_link_limits`** caps the sum against `payment_receipts.amount` and against the quote's remaining (counting **approved** receipts only) — **[create]**, verified line-by-line in `C-Q15`. **AFTER trigger `recompute_employee_scores_on_receipt_link`** — **[create]**, see C3. **BEFORE `enforce_receipt_approval_allocation_limits`** re-checks **[approve]** | **NOT read by `post_receipt_accounting`** — `payment_receipt_links` appears only in comments (`C-Q7`), and `quote_id` is absent from the body (`C-Q1`) | **No ledger effect at all.** Effect is on `vw_customer_receivables.confirmed_paid_amount`, which sums `payment_receipt_links.amount` for receipts whose `status IN ('approved','verified','confirmed','posted')` (`C-Q8`) — **[approve]**, not [post]. Plus the employee-score writes at **[create]** | — |
| 4 | جستجو و تکمیل خودکار (واریزکننده) | none | popover helper (`:1525-1534`) | — | — | — | Client-only; writes into fields 5/6/7 | — |
| 5 | نام و نام‌خانوادگی (واریزکننده) | `payer_name` | text `:1537-1545` | `payment_receipts.payer_name` (**NOT NULL**) | none | **none** (`C-Q1`: `payer_name` = f) | **Lands in a column and nothing reads it.** Not in the journal, not in the entry description | — |
| 6 | شماره موبایل (واریزکننده) | `payer_phone` | text `:1546-1549` | `payment_receipts.payer_phone` | **BEFORE trigger `trg_normalize_phone` → `tg_normalize_phone_columns('payer_phone','receiver_phone')` → `normalize_phone_local`** rewrites the value **[create]** | none beyond the normaliser | None on the ledger. The value stored is not necessarily the value typed | — |
| 7 | کد حسابداری (واریزکننده) | `payer_accounting_code` | text, onBlur resolver `:1550-1556` | `payment_receipts.payer_accounting_code` | none in SQL. Client `onBlur` reads `customers` then `external_parties` (`:565-595`) | `post_receipt_accounting` (`C-Q16`); also the dead gate in `trg_post_receipt_on_approve` | **[post]** written verbatim (trimmed, `NULLIF('')`) to `journal_entries.payer_accounting_code`. Also **[post]** a configurable *blocking gate*: if a `validation_rules` row `scope='journal_entry', field_key='payer_accounting_code', rule_type='required', severity='blocking', enabled` exists and the code is blank, the RPC raises and the whole approve+post is rolled back by the detail page (`$receiptId.tsx:339-346`). **It does NOT choose an account** — it is a text label on the entry header | — |
| 8 | جستجو و تکمیل خودکار (گیرنده) | none | popover helper `:1564-1573` | — | — | — | Client-only | — |
| 9 | حالت ۱: حساب بانکی خودِ ما | `destination_bank_account_id` | select `:1583-1620` | `payment_receipts.destination_bank_account_id` | FK `→ bank_accounts(id)`. Branch 1 of CHECK `payment_receipts_receiver_exclusive_chk` **[create, weakly — see C3]** | `post_receipt_accounting` (`C-Q16`) | **The single most consequential field on the page.** **[post]** non-NULL ⇒ debit line is `account_kind='bank'`, `account_ref_id = destination_bank_account_id`, desc `واریز به حساب بانکی شرکت`. Also the third fallback for `v_receiver_code`, and **the RPC raises `23514` if that bank account has no `accounting_code`**. `journal_lines` BEFORE trigger `validate_journal_line_ref` then re-checks the ref exists in `bank_accounts`. Separately, **[approve]** `vw_account_balances.total_in` starts counting this receipt as soon as `status='approved'` — *independent of `posting_status`* (`C-Q8`) | — |
| 10 | حالت ۲: شخص/طرف حساب خارجی | `receiver_party_id` | select `:1621-1660` | `payment_receipts.receiver_party_id` | FK `→ external_parties(id)`. Branch 2 of `payment_receipts_receiver_exclusive_chk`. CHECK `payment_receipts_receiver_person_requires_party_chk`. **BEFORE `trg_payment_receipts_derive_person`** derives `receiver_party_person_id` **[create]** | `post_receipt_accounting` (`C-Q16`) | **[post]** when `destination_bank_account_id IS NULL`: debit line `account_kind='external_party'`, `account_ref_id = receiver_party_id`, desc `پرداخت به طرف خارجی`. Second fallback for `v_receiver_code` (`external_parties.accounting_code`). **This branch has 0 rows of production evidence** (B6i: `external_party` never used) | branch untested in prod |
| 11 | نام گیرنده | `receiver_name` | text `:1667-1675` | `payment_receipts.receiver_name` (**NOT NULL**) | none | **none** (`C-Q1` = f) | Stored only | — |
| 12 | شماره موبایل (گیرنده) | `receiver_phone` | text `:1676-1679` | `payment_receipts.receiver_phone` | **BEFORE `trg_normalize_phone`** rewrites it **[create]** | none | Stored only, normalised | — |
| 13 | کد حسابداری (گیرنده) | `receiver_accounting_code` | text, onBlur resolver `:1680-1688` | `payment_receipts.receiver_accounting_code` | none in SQL | `post_receipt_accounting` (`C-Q16`) — **first branch** of the `v_receiver_code` resolution | **[post]** if non-blank it wins outright, and the bank account's / external party's own `accounting_code` is never consulted. Written to `journal_entries.receiver_accounting_code`. Also a configurable **blocking gate** (same mechanism as row 7). Note the observed consequence in B6k: the one posted receipt debits a **bank** on line 1 while the entry header carries a **customer** code (`cust-123`), because the receipt column was pre-filled | — |
| 14 | **کد آسان ذینفع** | `beneficiary_accounting_code` | text, onBlur resolver `:1703-1712` | `payment_receipts.beneficiary_accounting_code` | none | **Only** `trg_post_receipt_on_approve` — as the gate `COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL` — and `pay_purchase_with_voucher`, which belongs to the *purchase-payment* subsystem and never touches `payment_receipts` (`C-Q2`). **Absent from `post_receipt_accounting`** (`C-Q1` = f, and absent from `C-Q16`) | **DEAD WIRE — permanently.** See C2 §1 | — |
| 15 | مبلغ (تومان) | `amount` | number `:1772-1786` | `payment_receipts.amount` numeric(15,2) **NOT NULL** | CHECK `amount > 0` **[create]**. Read as the cap by `enforce_payment_receipt_link_limits` **[create]** | `post_receipt_accounting`, `increase_credit` | **[post]** debit and credit on both journal lines; the amount added to `customer_credit_balance` / `customer_credit_ledger` | — |
| 16 | شماره پیگیری | `tracking_number` | text `:1788-1796` | `payment_receipts.tracking_number` (**NOT NULL**, no UNIQUE, no format CHECK) | none. Indexed by `receipts_tracking_idx` and the partial `idx_payment_receipts_duplicate_check(tracking_number, amount, payment_date, bank_name) WHERE status <> 'rejected'` — **supporting indexes for the app-side probe at `:946-959`, not constraints** | `post_receipt_accounting` (`C-Q16`) | **[post]** string-concatenated into `journal_entries.description` = `'سند فیش واریزی شماره ' || tracking_number`. That is its only ledger use. **The database does not prevent duplicates** — 7 rows, 3 distinct values today (B7d) | — |
| 17 | تاریخ روی فیش واریزی | `payment_date` | `JalaliDateInput` `:1812-1836` | `payment_receipts.payment_date` date **NOT NULL** | none in SQL (the `<= today` rule is zod-only, `:215-218`) | `post_receipt_accounting` (`C-Q16`) | **[post]** becomes `journal_entries.entry_date` (overriding that column's `CURRENT_DATE` default) | — |
| 18 | ساعت واریز | `payment_time` | `<input type="time">` `:1838-1849` | `payment_receipts.payment_time` `time` **NOT NULL, no default** | none | **none** (`C-Q1` = f) | Stored only. A rebuilt form **must** supply it or the INSERT fails on NOT NULL | — |
| 19 | توضیحات | `description` | textarea `:1852-1855` | `payment_receipts.description` | none | **none** — the `description` token in `post_receipt_accounting` is only the two `INSERT` column lists (`C-Q17`); `v_receipt.description` is absent from `C-Q16` | Stored only. The journal's own description is a hardcoded Persian string + tracking number | — |
| 20 | حساب مبدأ ما (اختیاری) | `source_bank_account_id` | select `:1881-1908` | `payment_receipts.source_bank_account_id` | FK `→ bank_accounts(id)` | `get_account_ledger` and `pay_purchase_with_voucher` (`C-Q2`) — **neither is on the receipt-create/post path**. Absent from `post_receipt_accounting` | **No ledger effect from a receipt.** The money leaving our own account is never recorded as a credit against it | `get_account_ledger` not traced |
| 21 | (unlabelled) نام بانک مبدأ (متن) | `source_bank` | text `:1909-1913` | `payment_receipts.source_bank` | none | none (`C-Q1` = f) | Stored only | — |
| 22 | نام بانک مقصد (متن) | `destination_bank` | text `:1916-1919` | `payment_receipts.destination_bank` | none | none (`C-Q1` = f) | Stored only | — |
| 23 | ساعت روی فیش | `receipt_time` | `<input type="time">` `:1921-1927` | `payment_receipts.receipt_time` — **`text`, not `time`** | CHECK `payment_receipts_receipt_time_format_check`: `receipt_time IS NULL OR receipt_time ~ '^\d{2}:\d{2}$'` **[create]** | none (`C-Q1` = f; absent from `C-Q2`) | Stored only. **Two separate time columns exist** (`payment_time` and `receipt_time`) with different types and different rules | — |
| 24 | روش انتقال | `document_channel` | select, 7 values `:1929-1965` | `payment_receipts.document_channel` | CHECK `payment_receipts_document_channel_check` (NULL or one of 7) **[create]**; and it is the **governing side of CHECK `payment_receipts_cheque_fields_chk`** | `get_account_ledger` and `pay_purchase_with_voucher` only (`C-Q2`) — **not `post_receipt_accounting`** | **No ledger effect.** `cash`, `cheque`, `satna` and `card_to_card` all post identically. Its real teeth are the cheque CHECK (row 25/26) and the client-side high-severity warning on `pol` (`receipt-security.ts:82-89`) | — |
| 25 | شمارهٔ چک | `cheque_number` | text, conditional `:1970-1978` | `payment_receipts.cheque_number` | **CHECK `payment_receipts_cheque_fields_chk`: `document_channel = 'cheque' OR (cheque_number IS NULL AND cheque_due_date IS NULL)`** — this is a database-enforced constraint the form defends against by nulling the field in the payload (`:1005`) **[create]** | none (`C-Q1` = f) | **No ledger effect.** Purely a stored attribute with a CHECK. Note the CHECK is one-directional: it forbids cheque fields off-channel but does **not** require `cheque_number` when the channel *is* `cheque` — that requirement is zod-only (`:260-262`) | — |
| 26 | تاریخ سررسید چک | `cheque_due_date` | `JalaliDateInput`, conditional `:1979-1988` | `payment_receipts.cheque_due_date` date | same CHECK as row 25 **[create]** | none (`C-Q1` = f) | No ledger effect. No maturity/clearing logic exists anywhere — a post-dated cheque posts on `payment_date` like cash | — |
| 27 | نام واریزکننده روی فیش | `payer_name_on_receipt` | text `:1992-1995` | `payment_receipts.payer_name_on_receipt` | none | **none in any function** (absent from `C-Q2`) | Stored only. Blank raises a **client-side** medium warning `payer_name_missing` (`receipt-security.ts:91-98`) which is enforced nowhere on the server | — |
| 28 | نام گیرنده روی فیش | `receiver_name_on_receipt` | text `:1997-2000` | `payment_receipts.receiver_name_on_receipt` | none | **none in any function** | Stored only | — |
| 29 | پرفراژ دارد؟ | `has_perforation` | checkbox `:2003-2011` | `payment_receipts.has_perforation` bool NOT NULL default `false` | none | **none in any function** (absent from `C-Q2`) | Stored only. `false` raises a client-side medium warning that only gates a confirm dialog | — |
| 30 | فیش تایپی است؟ | `is_typed_receipt` | checkbox `:2012-2020` | `payment_receipts.is_typed_receipt` bool NOT NULL default `false` | none | **none in any function** | Stored only. `true` raises a client-side **high** warning — again dialog-only | — |
| 31 | رسید اسکرین‌شات از همراه بانک است؟ | `is_mobile_bank_screenshot` | checkbox `:2021-2031` | `payment_receipts.is_mobile_bank_screenshot` bool NOT NULL default `false` | none | **none in any function** (absent from `C-Q2`) | **DEAD WIRE — permanently.** See C2 §2 | — |
| 32 | مستندات فیش (آپلود) | `stagedFiles` (React state `:310`) | `<input type="file" multiple>` `:2036-2040` | **Storage bucket `payment-receipt-documents`** (private, `file_size_limit = 20971520` — `C-Q12`) **+ `payment_receipt_documents`** rows **+ `audit_logs`** rows. Uploaded **after** the receipt exists (`:1091-1097` → `PaymentReceiptDocuments.tsx:359-417`) | `payment_receipt_documents`: FK `receipt_id → payment_receipts ON DELETE CASCADE`; CHECKs on `extraction_status`, `file_size >= 0`, `extraction_confidence ∈ [0,1]`; RLS `prd_insert_admin_accountant` requires **`uploaded_by = uid()`**. Storage RLS: `prd_storage_insert_admin_accountant` (a), `prd_storage_select_privileged` (r), `prd_storage_delete_admin_accountant` (d) — `C-Q13` | none | **No ledger effect.** Best-effort and **non-atomic**: `uploadReceiptDocuments` never throws, so a failed upload leaves a receipt with no attachment and only a toast. Also triggers the OCR server function client-side | — |
| 33 | اطلاعات تکمیلی (dynamic) | `customData` (React state `:311`) | select / date / number / text per `field_type` | `payment_receipts.custom_data` jsonb NOT NULL default `'{}'` | none — no CHECK validates the jsonb against `payment_receipt_custom_fields` | **none in any function** (`C-Q2`) | **Stored only, and validated client-side only.** `is_required` on a custom field is enforced *exclusively* by `validateCustomData` (`WaybillCustomFieldsInput.tsx:47-53`, called at `:1123-1128`). A direct PostgREST insert bypasses it entirely | — |
| — | *(no rendered input)* | `bank_name` | — | `payment_receipts.bank_name` | none | **none** (`C-Q1` = f) | Set only as a side effect of picking a mode-1 bank account when empty (`:1602-1604`), yet it is the 4th column of the duplicate-detection key (`:950-958`). No ledger effect | — |
| — | *(no rendered input)* | `receipt_image_url` | — | `payment_receipts.receipt_image_url` | none | **none** (`C-Q1` = f) | **Always inserted as `null`** (`:1009`). Dead in every sense | — |
| — | *(not a field)* | `security_warnings` | — | `payment_receipts.security_warnings` jsonb NOT NULL default `'[]'` | none | **none in any function** (`C-Q2`) | Stored only; an audit trail of what the accountant clicked past. See C2 §5 for the path that silently drops it | — |
| — | *(not a field)* | `status` | hardcoded `:1016` | `payment_receipts.status` | CHECK `payment_receipts_status_check`; **branch 3 of `payment_receipts_receiver_exclusive_chk` depends on it**; `WHEN` clauses of two triggers | `post_receipt_accounting` (`C-Q16`) — refuses anything not `'approved'` | The gate between stage 1 and stage 2. See C4 | — |
| — | *(not a field)* | `created_by` | `user.id` `:1017` | `payment_receipts.created_by` uuid **NOT NULL** | **RLS `pr_insert_admin_accountant` WITH CHECK requires `created_by = auth.uid()`** | — | Omitting it or setting it to another user ⇒ the INSERT is rejected by RLS, not by a CHECK | — |

### Which of A's 33 inputs actually reach the ledger

**8 of 33** (rows 1, 7, 9, 10, 13, 15, 16, 17). Rows 2 and 3 reach *other* tables/views but
never the ledger. **The remaining 23 land in a column and stop there.**

---

## C2 — DEAD WIRES

Every item below was confirmed or refuted against the **live** function bodies, not against
git.

### 1. `beneficiary_accounting_code` («کد آسان ذینفع») — **DEAD, PERMANENTLY** ✅ confirmed

- Collected at `src/shared/components/PaymentReceiptForm.tsx:1703-1712`; onBlur resolver
  `:623-637`; sent at `:989`.
- **Evidence it goes nowhere:** `C-Q16` lists every `v_receipt.<column>` reference inside
  the live `post_receipt_accounting` body. `beneficiary_accounting_code` **is not in the
  list**, and `C-Q1` independently reports the token as absent from the body. The credit-side
  code the ledger actually uses is resolved from `receiver_accounting_code` →
  `external_parties.accounting_code` → `bank_accounts.accounting_code` (B4 step 6) — the
  beneficiary field is not consulted at any of the three steps.
- Its only two readers in the entire schema (`C-Q2`) are:
  - `pay_purchase_with_voucher` — a **different subsystem** (purchase payments); it does not
    read `payment_receipts`.
  - `trg_post_receipt_on_approve` — where it appears solely as a firing condition
    `COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL`,
    whose only action is `PERFORM public.post_receipt_journal(NEW.id)` — and
    `post_receipt_journal` is `RETURN NULL` (neutralised by migration 149, B4).
- **So the one place in the database that reads this column feeds a no-op function.**
- **The journal preview built on it (`:1720-1768`) is decorative and materially wrong.**
  It renders debit = beneficiary code, credit = payer code. The real entry (B4, B6k) is
  debit = **bank account** or **external party** by `account_ref_id`, credit =
  **customer_credit** by `customer_id`. Neither leg of the preview corresponds to either leg
  of the real entry. The caption
  «پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.» (`:1730-1732`) is false.
- **Dead at create time AND after approval + posting.**

### 2. `is_mobile_bank_screenshot` — **DEAD, PERMANENTLY** ✅ confirmed

- Collected at `:2021-2031`; forwarded to `evaluateFormWarnings` at `:1170`; persisted at
  `:1000`.
- **Client evidence (A's finding 2):** declared in the parameter type at
  `src/lib/accounting/receipt-security.ts:28` and referenced **nowhere** inside the
  evaluator body `:56-170`. It produces no warning.
- **Server evidence:** `C-Q2` searched every function in `public` for the token —
  **0 functions** mention it. It has no CHECK, no trigger, no index.
- The column exists, is NOT NULL with default `false` (`C-Q6`), and is written on every
  insert. Nothing ever reads it. **Dead at both stages.**

### 3. `receipt_type` — **DEAD FOR THE LEDGER, ALIVE ELSEWHERE** ⚠️ refuted as "fully dead"

- **Does any of the four values change what the ledger records? No.** `C-Q3` searched every
  function in `public` for the token `receipt_type` and returned **0 rows**. Not one
  function in the database reads it. `invoice_payment`, `debt_payment`, `prepayment` and
  `positive_credit` produce a byte-identical two-line entry.
- But it is **not** a dead wire, because it has three real non-ledger effects:
  1. **[create, client]** `requiresInvoiceLinks(receipt_type)` gates the entire invoice-
     allocation block and the submit button (`:1324`, `:2073-2077`,
     `src/lib/receipts/receipt-types.ts:43-45`). Choosing `invoice_payment` makes at least
     one `payment_receipt_links` row mandatory; the other three values make it impossible.
  2. **[create, server]** CHECK `payment_receipts_receipt_type_check` rejects any other value.
  3. **[approve, client]** the detail page branches the *audit action string* on it:
     `receipt.receipt_type === "prepayment" ? "prepayment_credit_added" :
     "payment_receipt_approved"` (`src/routes/_app.accounting.receipts.$receiptId.tsx:362-364`).
- **Verdict: the field is meaningful to the workflow and meaningless to the ledger.** A
  rebuilt page must keep it, but must not imply it changes the accounting.

### 4a. `bank_name` — **DEAD FOR THE LEDGER, LIVE FOR DEDUPLICATION** ⚠️ partially refuted

- A zod key (`:225`) with **no rendered input anywhere in the 2205-line file**. Its only
  producer is the mode-1 bank-account select back-filling it when empty (`:1602-1604`).
- `C-Q1`: absent from `post_receipt_accounting`. `C-Q2`: no function mentions it. No CHECK,
  no trigger. **No ledger effect.**
- But it is the 4th column of the app-side duplicate probe (`:950-958`) and of the
  supporting index `idx_payment_receipts_duplicate_check`. Two receipts with identical
  tracking number, amount and date are treated as **distinct** if one has `bank_name` set
  and the other has `null` — because the probe branches on `.eq("bank_name", …)` vs
  `.is("bank_name", null)`. A rebuilt form that stops back-filling `bank_name` silently
  changes duplicate detection.
- **Dead at both stages for accounting; live at create time for the dedup dialog.**

### 4b. `receipt_image_url` — **DEAD, PERMANENTLY, WITH NO PRODUCER AT ALL** ✅ confirmed

- Schema `:245`, default `:348`, payload `:1009`. A's grep found no other reference; the
  payload expression `values.receipt_image_url || null` therefore always evaluates to `null`.
- `C-Q1`: absent from `post_receipt_accounting`. `C-Q2`: no function mentions it. No CHECK,
  no trigger, no index.
- The actual attachment mechanism is `payment_receipt_documents` + the storage bucket
  (row 32), which this column duplicates and predates. **Dead at both stages.**

### 5. The security-warnings drop path at `:2116-2121` — **CONFIRMED, and it is a real data loss** ✅

- Verbatim, `PaymentReceiptForm.tsx:2113-2122`:
  ```tsx
  <AlertDialogAction onClick={() => {
    if (pendingValues) {
      mutation.mutate({
        values: pendingValues.values,
        allocations: pendingValues.allocations,
        bypassDuplicate: true,
        customData,
      });
    }
    setDuplicateOpen(false);
  }}>
  ```
  There is **no `securityWarnings` key**, so the mutation's default `[]` at `:918` applies.
- The chain: the warnings dialog mutates *with* `securityWarnings: pendingWarnings`
  (`:2172`); the duplicate probe (`:946-959`) then short-circuits and returns
  `{duplicate:true, count}` **before any receipt row is written** (`:962-977`); `onSuccess`
  stashes only `{values, allocations}` into `pendingValues` (`:1103`) — the warnings array
  is not carried; the user clicks `ادامه و ثبت` and the re-entry above drops it.
- **Consequences, both permanent:** `payment_receipts.security_warnings` is persisted as
  `[]` (`:1014`), and the `receipt_security_warning_confirmed` audit row (`:1080-1089`) is
  never written — even though an accountant explicitly acknowledged high-severity warnings.
- Compounding it: `security_warnings` is read by **no** database function (`C-Q2`), so
  nothing downstream can notice the omission. **Dead at both stages as an enforcement
  mechanism; alive only as an audit artefact — which this path destroys.**

### 6. Additional dead wires C found

| field | evidence |
|---|---|
| `payer_name`, `receiver_name` | **NOT NULL** columns, so the form must always supply them, yet neither is read by any function (`C-Q1` = f, absent from `C-Q16`). They never appear in the journal — the entry's only human label is `'سند فیش واریزی شماره ' \|\| tracking_number`. Dead at both stages |
| `payment_time` | NOT NULL with **no default**, so the form *must* send it, and nothing reads it (`C-Q1` = f). Dead at both stages |
| `receipt_time` | `text` with a format CHECK, read by no function. Dead at both stages |
| `description` | Stored only; `v_receipt.description` absent from `C-Q16`. The ledger writes its own hardcoded description. Dead at both stages |
| `source_bank`, `destination_bank` | free-text bank names; no function reads either (`C-Q1` = f). Dead at both stages |
| `source_bank_account_id` | Read by `get_account_ledger` and `pay_purchase_with_voucher` (`C-Q2`) but **absent from `post_receipt_accounting`**. The receipt never credits our own source account — the journal is single-sided against the customer. Dead for the receipt ledger at both stages |
| `payer_name_on_receipt`, `receiver_name_on_receipt`, `has_perforation`, `is_typed_receipt` | The four "anti-fraud" attributes. **No function in the schema reads any of them** (`C-Q2` returned no rows for these tokens). Their entire effect is a client-side confirm dialog that any direct PostgREST insert bypasses. Dead at both stages |
| `custom_data` | jsonb, no function reads it, no CHECK validates it against `payment_receipt_custom_fields`. `is_required` is a client-side promise only. Dead at both stages |
| `cheque_number`, `cheque_due_date` | Constrained by `payment_receipts_cheque_fields_chk` but read by no function on the receipt path. No maturity handling exists. Dead for the ledger at both stages |

---

## C3 — HIDDEN LOGIC (backend behaviour with no frontend field)

### H1 — `customer_person_id` is NOT NULL and server-derived, and it can abort your insert

`payment_receipts.customer_person_id` is `uuid NOT NULL` **with no default** (`C-Q6`).
No client sends it. The BEFORE trigger `trg_payment_receipts_derive_person` fills it:
```sql
SELECT c.person_id INTO NEW.customer_person_id FROM public.customers c WHERE c.id = NEW.customer_id;
```
**If the chosen customer has `person_id IS NULL`, the trigger leaves NULL and the INSERT
dies on the NOT NULL constraint with a raw Postgres message**, surfaced to the user only as
`ثبت فیش ناموفق بود: …` (`:1113`). A rebuilt frontend cannot fix this by sending the column
(the trigger overwrites it) — it must either filter the customer picker to customers with a
`person_id`, or translate error `23502` on `customer_person_id` into a Persian sentence.
`receiver_party_person_id` works the same way but is nullable, so it is harmless.

### H2 — The receiver CHECK is looser than the form, and the debt is collected later

```
payment_receipts_receiver_exclusive_chk CHECK (
     (destination_bank_account_id IS NOT NULL AND receiver_party_id IS NULL)
  OR (destination_bank_account_id IS NULL     AND receiver_party_id IS NOT NULL)
  OR (status = 'pending_review' AND destination_bank_account_id IS NULL AND receiver_party_id IS NULL))
```
Because `status` defaults to `'pending_review'`, the **third branch permits a receipt with
no receiver at all at create time**. The zod XOR refine (`:251-254`) is strictly stricter
than the database. The constraint only bites when someone tries to move the row to
`approved`, and `post_receipt_accounting` re-checks it independently (B4 step 5). A rebuilt
page may relax the client rule without any DDL — but the receipt then becomes unapprovable,
which is arguably worse than refusing it up front.

### H3 — Creating an allocation immediately awards employee-score points

`payment_receipt_links` carries an **AFTER INSERT** trigger
`trg_payment_receipt_links_recompute_employee_score` →
`recompute_employee_scores_on_receipt_link`. The live body (`C-Q14`) has **no status guard**:
for any link with a non-null `quote_id` it resolves `sales_quotes.salesperson_id` (guarded
by `has_role(…, 'sales')`), then calls `calculate_employee_score(_emp)` and inserts an
`employee_score_events` row `('receipt_link_insert', 'payment_receipt_links', <link id>)`.
**This fires at create time, on a `pending_review` receipt, before anyone has approved
anything.** Both calls are wrapped in `EXCEPTION WHEN OTHERS THEN NULL`, so failures are
invisible. A rebuilt page that changes when links are written changes when salespeople are
scored. (Its sibling on `payment_receipts` itself,
`recompute_employee_scores_on_receipt`, is inert — B4.)

### H4 — Allocations are money-capped server-side at create time

`enforce_payment_receipt_link_limits` (BEFORE INSERT on `payment_receipt_links`, body in
`C-Q15`) locks the receipt `FOR UPDATE`, then enforces two rules with `ERRCODE 23514`:
sum of this receipt's allocations ≤ `payment_receipts.amount`, and this allocation ≤ the
quote's remaining balance counting **approved** receipts only. This runs even though the
receipt is `pending_review`. The `invoice_id` branch raises unconditionally (migration 330).
So the client-side over-allocation guard at `:2073-2077` is a nicety — the real cap is in
the database, and it will surface as a Persian `RAISE EXCEPTION` the create page currently
re-throws as `اتصال به پیش‌فاکتور ناموفق: …` (`:1041`) after a **non-transactional manual
DELETE of the receipt** (`:1037-1041`) that RLS will silently refuse — see H8.

### H5 — Columns applied entirely in SQL that no client sends (`C-Q6`)

| column | type | notnull | default | who sets it |
|---|---|---|---|---|
| `id` | uuid | t | `gen_random_uuid()` | DB |
| `created_at` | timestamptz | t | `now()` | DB |
| `updated_at` | timestamptz | t | `now()` | DB, then `set_updated_at_now` on every UPDATE |
| `posting_status` | text | t | `'unposted'` | DB, then `post_receipt_accounting` |
| `posted_at` | timestamptz | f | — | `post_receipt_accounting` only |
| `rejection_reason` | text | f | — | the detail page's reject flow |
| `customer_person_id` | uuid | **t** | — | BEFORE trigger (H1) |
| `receiver_party_person_id` | uuid | f | — | BEFORE trigger |

Note `status`, `receipt_type`, `has_perforation`, `is_typed_receipt`,
`is_mobile_bank_screenshot`, `security_warnings` and `custom_data` all have SQL defaults
too — the form sends them anyway, so a rebuilt form may legally omit any of them.

### H6 — The RLS contract the form must satisfy

- **`created_by = auth.uid()` is a `WITH CHECK` on `pr_insert_admin_accountant`** — not a
  CHECK constraint. An insert with someone else's uuid fails as a *policy violation*, which
  PostgREST reports as `42501`, not as a validation error.
- The caller must hold `admin` or `accountant` (`has_any_role`) **and** must not be
  `is_viewer_only` (the RESTRICTIVE `viewer_restricted` policy). The route guard at
  `src/routes/_app.accounting.receipts.create.tsx:10-12` mirrors this, but the RLS is the
  real enforcement.
- `payment_receipt_documents` requires **`uploaded_by = uid()`** on insert
  (`prd_insert_admin_accountant`), and its storage twin requires the same roles
  (`prd_storage_insert_admin_accountant`, `C-Q13`). The bucket is **private**
  (`public = f`) with a 20 MiB server-side limit (`C-Q12`) — matching the client's 20 MB
  check, so an oversized file fails twice, but only the client failure has a Persian message.
- **`audit_logs` insert requires `uid() = actor_id`** (policy `system inserts audit logs`,
  `C-Q10`), and `entity_type`, `entity_id`, `action` are all NOT NULL (`C-Q11`). All four
  client audit inserts on this page satisfy that; a rebuilt page must keep `actor_id =
  user.id` or the audit row is silently rejected.
- **`payment_receipt_documents` has no UPDATE policy at all** (B5) — the OCR write-back
  columns (`extraction_status`, `extracted_data`, `extraction_confidence`) can never be
  updated by an `authenticated` caller. UNCERTAIN whether any code path attempts it.

### H7 — The NOT NULL set a rebuilt form must always supply

`customer_id`, `payer_name`, `receiver_name`, `amount`, `payment_date`, `payment_time`,
`tracking_number`, `created_by`. Note that four of these eight (`payer_name`,
`receiver_name`, `payment_time`, and `tracking_number` beyond the description string) are
never read by any function — they are mandatory but inert.

### H8 — Receipts cannot be deleted through the API, which makes the create page's rollback fictional

There is **no DELETE policy on `payment_receipts`** (B5). A PostgREST
`DELETE /payment_receipts?id=eq.…` as `authenticated` matches 0 rows and **returns
success**. The link-failure rollback at `PaymentReceiptForm.tsx:1037-1041` is exactly that
call. So when a link insert fails (e.g. H4's cap), the code believes it cleaned up, throws
a Persian error, and **leaves an orphan `pending_review` receipt with no links** — and
because the `payment_receipt_created` audit row is written *after* the link insert
(`:1044-1078`), the orphan has no audit trail either. A rebuilt page should either move the
whole create into a single RPC or stop pretending it can roll back.

### H9 — The ledger is append-only and the auto-post trigger is a decoy

`journal_entries` and `journal_lines` have **no DELETE policy** (B5). Combined with
`journal_entries` UNIQUE `(source_type, source_id)`, posting is idempotent and
irreversible through the API. Meanwhile `trg_payment_receipts_post_journal` is enabled and
fires on every insert and status change — and terminates in `post_receipt_journal`'s
`RETURN NULL`. Anyone reading the trigger list will wrongly conclude approval posts the
ledger; it does not.

### H10 — Two views react to `status='approved'`, ahead of and independently of posting

- `vw_account_balances.total_in` sums `payment_receipts.amount` where
  `destination_bank_account_id IS NOT NULL AND status = 'approved'` (`C-Q8`).
- `vw_customer_receivables.confirmed_paid_amount` sums `payment_receipt_links.amount` where
  the parent receipt's `status IN ('approved','verified','confirmed','posted')` (`C-Q8`).

Both key on **`status`**, not `posting_status`. So an approved-but-unposted receipt already
moves bank balances and receivables while the journal is still empty. Today that window is
empty (0 rows approved-but-unposted, B6d) because the detail page always calls the RPC
immediately, but the views do not depend on that. Note also that
`vw_customer_receivables` accepts three status values (`verified`, `confirmed`, `posted`)
that the `payment_receipts_status_check` CHECK **does not allow** — dead branches.

### H11 — There is no receipt number

`payment_receipts` has no serial, voucher, or document number, no sequence, no counter
table, and no trigger that assigns one (B7, four independent checks). The only identity is
the uuid or the **client-typed, non-unique** `tracking_number`. A rebuilt page must not
promise the user a receipt number, and must not assume `tracking_number` is unique — 7 rows
currently hold only 3 distinct values (B7d).

---

## C4 — THE TWO-STAGE PICTURE

### Stage 1 — the create page's submit succeeds

`/accounting/receipts/create` performs **plain PostgREST table writes and calls no RPC
whatsoever** (A5; verified — the only `supabase.rpc("post_receipt_accounting", …)` call in
`src/` is at `src/routes/_app.accounting.receipts.$receiptId.tsx:335`). Immediately after a
successful submit the database contains:

| table | rows | with what |
|---|---|---|
| `payment_receipts` | **1** | `status = 'pending_review'` (hardcoded at `:1016`), `posting_status = 'unposted'` (SQL default), `posted_at = NULL`, `created_by = auth.uid()`, `customer_person_id` derived by trigger, `payer_phone`/`receiver_phone` rewritten by the phone normaliser |
| `payment_receipt_links` | **0 or N** | one per allocation, only when `receipt_type = 'invoice_payment'`; each already money-capped by `enforce_payment_receipt_link_limits` |
| `employee_score_events` | **0 or 1 per link** | written by the AFTER trigger at create time (H3) — a side effect the UI never mentions |
| `payment_receipt_documents` | **0 or 1 per file** | best-effort, after the receipt row exists |
| Storage `payment-receipt-documents` | **0 or 1 object per file** | private bucket |
| `audit_logs` | **1 + 1 per file (+1 if warnings were confirmed)** | `payment_receipt_created`, `receipt_document_uploaded`, `receipt_security_warning_confirmed` |
| **`journal_entries`** | **0 rows** | — |
| **`journal_lines`** | **0 rows** | — |
| `customer_credit_balance` / `customer_credit_ledger` | **unchanged** | — |

The AFTER-INSERT trigger `trg_payment_receipts_post_journal` **does fire**, evaluates
`NEW.status = 'approved'` as false, and returns. Even if it passed, its terminal function
`post_receipt_journal` is `RETURN NULL`. **Creating a receipt has zero accounting effect,
by design, and the customer's credit balance does not move.**

Live confirmation: all 6 `pending_review` receipts in the database have 0 journal entries;
the whole `journal_entries` table holds 1 row and `journal_lines` 2 rows (B6f–B6h).

### Stage 2 — an admin or accountant approves the receipt

This happens **on a different page**: the receipt detail route
`src/routes/_app.accounting.receipts.$receiptId.tsx`, in `approveMutation`
(`:320-386`), which does three things in sequence:

1. `UPDATE payment_receipts SET status='approved', rejection_reason=null WHERE id=… AND
   status='pending_review'` (`:327-332`). This is where
   `payment_receipts_receiver_exclusive_chk` finally bites (the `pending_review` escape
   hatch no longer applies), where `enforce_receipt_approval_allocation_limits` re-verifies
   every allocation against the quote total, and where the two views in H10 start counting
   the receipt.
2. **`supabase.rpc("post_receipt_accounting", { p_receipt_id, p_user_id })`** — line
   **`src/routes/_app.accounting.receipts.$receiptId.tsx:335-338`. This is the exact function
   that must be called for a ledger row to exist.** It re-gates on `has_any_role(auth.uid(),
   ARRAY['admin','accountant'])`, refuses anything not already `approved`, is idempotent via
   `posting_status='posted'` and via `journal_entries` UNIQUE `(source_type, source_id)`,
   then writes: `posting_status='posted'` + `posted_at=now()`; `increase_credit(...)` →
   `customer_credit_balance` UPDATE + `customer_credit_ledger` INSERT + its own `audit_logs`
   row (`C-Q9`); **1 `journal_entries` row + exactly 2 `journal_lines` rows**. If the RPC
   errors, the page rolls the status back to `pending_review` (`:339-346`).
3. A top-level `audit_logs` insert, `payment_receipt_approved` or `prepayment_credit_added`
   (`:357-372`).

The two journal lines are always the same shape (B6k, and B4):

| line | account_kind | account_ref_id | debit | credit |
|---|---|---|---|---|
| 1 | `'bank'` if `destination_bank_account_id IS NOT NULL`, else `'external_party'` | that column, or `receiver_party_id` | `amount` | 0 |
| 2 | `'customer_credit'` | `customer_id` | 0 | `amount` |

### The three sentences whoever rebuilds this page must not get wrong

1. **The create page never posts to the ledger** — it inserts one `pending_review`
   `payment_receipts` row (plus links, documents and audit rows) and calls no RPC, so
   `journal_entries` and `journal_lines` stay untouched and the customer's credit balance
   does not move.
2. **Only `post_receipt_accounting(p_receipt_id, p_user_id)`, invoked from the receipt
   *detail* page at `src/routes/_app.accounting.receipts.$receiptId.tsx:335`, ever writes
   the ledger** — and it refuses any receipt that is not already `status='approved'`, so
   approval and posting are two separate statements that the detail page happens to run
   back to back.
3. **Of the 33 fields the create page collects, that RPC reads only 8** — `customer_id`,
   `amount`, `destination_bank_account_id`, `receiver_party_id`, `payer_accounting_code`,
   `receiver_accounting_code`, `payment_date`, `tracking_number` — and the single branch
   that decides debit-to-bank versus debit-to-external-party is
   `destination_bank_account_id IS NOT NULL`, nothing else.

---

## CONTRADICTIONS

Nothing in A and B contradicts outright. Four places where they *appear* to disagree, each
resolved with the deciding evidence:

1. **Strict XOR vs. escape hatch.** A documents the zod refine at `:251-254` as making the
   receiver mandatory and exclusive; B shows `payment_receipts_receiver_exclusive_chk` has a
   third branch permitting *neither* while `status='pending_review'`. Both are correct — the
   **frontend is stricter than the database** at create time, and the database catches up at
   approval. Not a contradiction; it is H2.

2. **"UNCERTAIN which time column the create page writes" (B, B1).** Resolved by A and by
   the payload at `PaymentReceiptForm.tsx:992` and `:1001`: the page writes **both** —
   `payment_time` (NOT NULL, `time`) from «ساعت واریز», and `receipt_time` (nullable,
   `text`, format CHECK) from «ساعت روی فیش».

3. **A's payload-key count.** A's A5 step-5 row says "Build `payload` (27 keys…)" while its
   own payload table and closing sentence say 34. I counted the literal object at
   `PaymentReceiptForm.tsx:980-1018`: **34 keys**. The "27" is a slip inside A, not a
   disagreement with B.

4. **"trg_post_receipt_on_approve reads `beneficiary_accounting_code`" (B, B4) vs. "the
   field is dead" (this report).** Both hold. B accurately quotes the trigger's firing
   condition; the condition's only consequence is `PERFORM post_receipt_journal(NEW.id)`,
   which B itself shows is `RETURN NULL`. The read exists; the effect does not.

One tension worth flagging that neither A nor B could see alone: **A's journal preview
(A3-bis) and B's `post_receipt_accounting` (B4) describe two different accounting entries.**
The preview shows debit = «کد آسان ذینفع» / credit = «کد آسان پرداخت‌کننده»; the real entry
is debit = bank-account-or-external-party uuid / credit = customer uuid. They share only the
amount. This is stated as a fact, not a judgement: the preview's caption promises the user
something the database does not do.

---

## BLOCKED

Nothing. No forbidden write was required. The only file written under the repo is
`docs/research/_c_wiring.md`. Five ASCII-only SQL files were written to the session
scratchpad and `docker cp`'d into `afrakala-lan-db:/tmp/` as `c-wiring{,2,3,4,5}.sql`; their
`\o` outputs were copied back and read on the host. All queries were `SELECT`-only against
`pg_catalog`, `pg_views`, `storage.buckets` and `storage.objects` policy metadata. No
function on the posting path was executed. No Persian text was printed to the terminal (every
extracted body line was filtered with `ln ~ '^[[:ascii:]]*$'`). The container `/tmp` copies
were left in place, since deleting them would be a container write.
