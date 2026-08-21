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

---

## 13. Payment-voucher remediation — Phase 0 ground truth (2026-08-21)

Established for the mission "close the legacy payment-voucher write path and fix the ledger-detached
balance readers". Read-only. Every claim below is a pasted command result, not a reading of intent.

### 13.1 (T-0.1) Every reader of the three objects

`vw_account_balances` has **zero** direct references in `src/`. The UI reaches it through one RPC.

**Acceptance command and its real output:**

```
$ git grep -c "vw_account_balances\|get_account_ledger" -- src/
src/lib/treasury/queries.ts:1
```

One file, one line — `src/lib/treasury/queries.ts:93`, the `get_account_ledger` call. Matched 1:1
against the list below.

**The reader chain, corrected.** The mission scope names `vw_account_balances` and
`get_account_ledger`. The object the UI actually calls for balances is a third one:

| Layer | Object | Evidence |
|---|---|---|
| UI | `fetchAccountBalances` | `src/lib/treasury/queries.ts:62` |
| RPC | **`get_account_balances`** | `src/lib/treasury/queries.ts:66` |
| View | `vw_account_balances` | `get_account_balances` body contains `FROM public.vw_account_balances v` |
| UI | `fetchAccountLedger` | `src/lib/treasury/queries.ts:88` |
| RPC | `get_account_ledger` | `src/lib/treasury/queries.ts:93` |

`get_account_balances` reads the view and nothing else, so correcting the view corrects the displayed
figure. **No change to `get_account_balances` is required**, but it must be named in any acceptance
probe, because it — not the view — is what the browser calls.

**SQL objects whose body references any of the three** (`pg_proc` sweep, `public` schema):

```
asan_list_journal_export          [payment_vouchers]
create_payment                    [payment_vouchers, vw_account_balances, get_account_ledger]
create_receipt                    [vw_account_balances, get_account_ledger]
get_account_balances              [vw_account_balances]
get_account_ledger                [payment_vouchers]
pay_purchase_with_voucher         [payment_vouchers]
person_fk_drift_report            [payment_vouchers]
person_merge                      [payment_vouchers]
reverse_document                  [payment_vouchers]
validate_document_attachment_ref  [payment_vouchers]
```

The `vw_account_balances` / `get_account_ledger` hits inside `create_payment` and `create_receipt`
are **comment-only** (migration 359's explanatory notes), not code paths.

**Views referencing `payment_vouchers`:** `vw_account_balances` — that one only.

**`src/` references to `payment_vouchers`:**

```
src/integrations/supabase/types.ts:9306,9321,9351,9380   generated types + comments
src/lib/treasury/queries.ts:131                          SELECT  (fetchPaymentVouchers)
src/lib/treasury/queries.ts:195                          INSERT  (createPaymentVoucher — the defect)
src/lib/treasury/queries.ts:246                          comment
src/routes/_app.accounting.purchase-payments.tsx:115     comment
```

**Routes that display `current_balance`:** `_app.accounting.treasury.tsx:80,205,208,213,216`,
`_app.accounting.payment-vouchers.tsx:382`, `_app.accounting.purchase-payments.tsx:528`,
`_app.accounting.mutual-settlement.tsx:332`. All four go through `fetchAccountBalances`.

### 13.2 (T-0.2) Legacy-path data on the test database — **COUNT = 0**

```sql
SELECT count(*) FROM payment_vouchers pv
WHERE NOT EXISTS (SELECT 1 FROM journal_entries je
                  WHERE je.source_type='payment_voucher' AND je.source_id=pv.id);
```

```
COUNT = 0
DETAIL ROWS:
(0 rows)

payment_vouchers total = 1
with journal entry     = 1
```

G7 is resolved: **no voucher created by the raw-insert path exists.** The single live voucher
(`PAY-1405-000052`) has its journal entry. Owner-Gate item 8 (section ۹) therefore **does not
trigger**, and T-1.2 records "no existing-data remediation needed".

### 13.3 (T-0.3) Live bodies captured before redesign

Both full bodies are captured verbatim in
`docs/execution/payment-voucher-remediation-PROGRESS.md` §T-0.3. Confirmed live:

```
vw_account_balances references journal_lines: false
get_account_ledger  references journal_lines: false
```

**`vw_account_balances` shape.** Two CTEs over the source tables, then arithmetic:

- `inflow`  ← `payment_receipts` WHERE `destination_bank_account_id IS NOT NULL` AND `status='approved'` AND `document_channel IS DISTINCT FROM 'cheque'` AND `reversed_at IS NULL`
- `outflow` ← `payment_vouchers` WHERE `status='approved'` AND `document_channel IS DISTINCT FROM 'cheque'` AND `reversed_at IS NULL`
- `current_balance = ba.opening_balance + total_in − total_out`
- whole thing wrapped in `WHERE NOT is_viewer_only(uid())`

**`get_account_ledger` shape.** `STABLE SECURITY DEFINER`, role-gated to admin/manager/accountant.
Returns **per-document detail** the journal does not carry in the same shape:
`document_number`, `counterparty`, `document_channel`, `description`, plus a windowed
`running_balance` seeded from `opening_balance` plus all approved movement before `p_from_date`.
Both legs (`in` from receipts, `out` from vouchers) carry the same three filters as the view.

**Design consequence, recorded now so Phase 1 cannot forget it:** re-pointing the *view* at
`journal_lines` is a small, closed change. Re-pointing *`get_account_ledger`* is not — the journal
holds no `document_number` (that lives in `document_numbers`), no `document_channel` (source table
only), and its counterparty is an `account_ref_id` that must be resolved per `account_kind`. This is
§13's third open question and it is real.

### 13.4 (T-0.4) RLS and grants on `payment_vouchers`

```
RLS enabled = true | forced = false

payment_vouchers_delete_admin   | DELETE | USING  has_role(uid(),'admin')
payment_vouchers_insert_finance | INSERT | CHECK  has_any_role(uid(), ARRAY['admin','accountant'])
payment_vouchers_select_finance | SELECT | USING  has_any_role(uid(), ARRAY['admin','manager','accountant'])
payment_vouchers_update_finance | UPDATE | USING/CHECK has_any_role(uid(), ARRAY['admin','accountant'])
```

**Which roles bypass the RPC today:** a logged-in **`admin`** or **`accountant`** can `INSERT`
straight into `payment_vouchers` through PostgREST, with no journal entry, because
`payment_vouchers_insert_finance` permits it. `manager` cannot insert (it is absent from that
policy) although the page is offered to managers by the navigation gate — a pre-existing mismatch,
noted, not this mission's target.

**Table grants — a finding the mission's section ۱۰ predicted:**

```
anon           : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated  : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
postgres       : …  service_role : …  supabase_admin : …
```

`anon` holds a full table-level grant. RLS is enabled, and every policy tests
`has_any_role(uid(), …)` which is false for an anonymous caller, so no row passes today — the grant
is not currently exploitable. It is still the exact ACL shape section ۱۰ names as the failure point
of two prior missions, and T-2.2 must leave it verified.

**`relforcerowsecurity = false`** — the table owner bypasses RLS entirely. This is what makes the
A4/G6 pattern work: dropping the INSERT policy does **not** disable the `SECURITY DEFINER` writers.

### 13.5 (T-0.5) What "retire" meant for D12 — frontend-only

```
$ git show --name-status e7dc789
D  src/shared/components/PaymentReceiptForm.tsx
M  src/lib/treasury/queries.ts        ← comment text only; createPaymentVoucher untouched
M  src/lib/navigation/registry.ts
A  src/features/ledger-wizard/*  (7 files)
A  docs/verification/phase6-accept.sql
…  no supabase/migrations/ file in this commit
```

**Answer: frontend-only.** `PaymentReceiptForm.tsx` was removed by full deletion, not deprecated in
place. **No DB-level guard accompanied it**, and the commit did not touch `createPaymentVoucher` or
`_app.accounting.payment-vouchers.tsx`. G5 confirmed, commit `e7dc789`.

This is precisely why this mission cannot copy D12 wholesale: mirroring its *deletion* style is
right, mirroring its *frontend-only scope* would leave the PostgREST path in §13.4 wide open.

### 13.6 (T-0.6) Every writer of `payment_vouchers`

Three, and **no forgotten fourth**:

| Writer | Kind | Posts a journal entry? |
|---|---|---|
| `create_payment` | `SECURITY DEFINER` RPC | yes — the intended path |
| `pay_purchase_with_voucher` | `SECURITY DEFINER` RPC | **yes — reconfirmed here, not assumed** |
| `createPaymentVoucher` | PostgREST insert from `src/` | **no — the defect** |

`reverse_document` updates existing rows; `person_merge` and `person_fk_drift_report` touch the
person FK; `validate_document_attachment_ref` and `asan_list_journal_export` only read.

**`pay_purchase_with_voucher` posts a real bank line** — from its live body:

```
(_journal_id, 1, 'supplier_payable', _purchase.supplier_id,      _amt, 0, _debit_desc),
(_journal_id, 2, 'bank',             _source_bank_account_id,    0, _amt, 'خروج وجه از حساب بانکی');
```

followed by its own debit = credit assertion. It is correct and must stay working after T-2.2.

**All three writers are `SECURITY DEFINER`:**

```
create_payment            : prosecdef=true
pay_purchase_with_voucher : prosecdef=true
reverse_document          : prosecdef=true
```

Combined with `relforcerowsecurity=false`, this is the proof that T-2.2's policy change closes the
raw path **without** breaking any legitimate writer.

### 13.7 Open questions added by this phase

| # | Question | Status |
|---|---|---|
| Q6 | Can `get_account_ledger` reproduce `document_number`, `document_channel` and `counterparty` from `journal_lines` alone? | `UNKNOWN` — T-1.3 must answer before T-2.3 is written. §13.3 shows it cannot do so trivially |
| Q7 | Should the `anon` table grant on `payment_vouchers` be revoked as part of T-2.2? | `UNKNOWN` — not currently exploitable (RLS holds); mission section ۱۰ asks for it to be verified, not necessarily changed |
| Q8 | `manager` is offered the payment-vouchers page by navigation but cannot INSERT under RLS | Pre-existing mismatch; moot once the page is deleted, recorded for completeness |
