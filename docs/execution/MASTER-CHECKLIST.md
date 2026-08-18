# MASTER CHECKLIST — phases 0 to 9

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified · `[!]` blocked

Every task carries **Scope** (the only files it may touch), **Effort** (S ≤ 1h, M ≤ 4h; no L — an L
task must be split before it is dispatched) and **Accept** (a command to run and the output to
expect). A task is done only when its acceptance command has been run and its real output recorded
in the phase progress file.

Conventions used below:

```powershell
# $PSQL means, throughout:
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -At -c "<ASCII SQL>"
```

`-At` gives unaligned, tuple-only output so the expected value can be compared exactly. **Only
ASCII SQL may be inlined this way.** Anything containing Persian goes into a file, is copied in with
`docker cp`, and is run with `psql -f`.

**After every migration: `docker restart afrakala-lan-rest`.** Omitted below for brevity; it is never
optional.

---

## Phase 0 — Ground and decisions

- [x] **0.1** Write `ground-truth.md` — Scope: `docs/execution/` — S
- [x] **0.2** Write `ledger-decisions.md` (A1–A4) — Scope: `docs/execution/` — S
- [x] **0.3** Write `decisions.md`, `deferred.md` — Scope: `docs/execution/` — S
- [x] **0.4** Write `MASTER-CHECKLIST.md`, progress templates — Scope: `docs/execution/` — S
- [ ] **0.5** **OG-1** — owner confirms A1–A4
  **Accept:** `ledger-decisions.md` contains a line `OG-1: CONFIRMED <date>`

**Phase 0 exit:** all documents exist; OG-1 answered. No code written.

---

## Phase 1 — Shared foundations

- [ ] **1.1** Remove the dead posting path — Scope: `supabase/migrations/` — S — **gated by OG-2**
  Capture `pg_get_functiondef` for both objects into the progress file first, then
  `DROP TRIGGER trg_payment_receipts_post_journal ON public.payment_receipts;`
  `DROP FUNCTION public.post_receipt_journal(_receipt_id uuid);`
  <!-- CORRECTED 2026-08-18 (FIX 3). Was `post_receipt_journal()` with no arguments, which
       errors: the live signature verified via pg_get_function_identity_arguments is
       `post_receipt_journal(_receipt_id uuid)`, exactly one overload. -->
  NOTE: the trigger fires `trg_post_receipt_on_approve()`, which is what calls
  `post_receipt_journal`. Dropping only the two objects named here leaves
  `trg_post_receipt_on_approve()` orphaned. Decide its fate during the task and record it.
  **Accept:** `SELECT count(*) FROM pg_proc WHERE proname='post_receipt_journal';` → `0`
  and `SELECT count(*) FROM pg_trigger WHERE tgname='trg_payment_receipts_post_journal';` → `0`

- [ ] **1.2** `document_numbers` table + `assign_document_number(doc_type, source_id)` — Scope:
  `supabase/migrations/` — M
  Mirror `asan_assign_document_number` exactly: advisory lock, `max+1`, idempotent, no sequence, no
  FK to sources, burn-on-delete triggers. `doc_type` CHECK: `receipt | payment | dual`.
  Format: `<PREFIX>-<jalali year>-<zero-padded serial>`, e.g. `RCP-1405-000042`.
  Prefixes: `RCP` / `PAY` / `DUAL`.
  **Accept:** calling it twice with the same `source_id` returns the same number:
  `SELECT assign_document_number('receipt','<uuid>') = assign_document_number('receipt','<uuid>');` → `t`

- [ ] **1.3** `require_asan_code(p_person_id uuid)` — Scope: `supabase/migrations/` — S
  Raises `P0001` with a Persian message naming the party when no
  `person_identifiers(kind='asan_person_code')` row exists. Returns the code otherwise.
  **Accept:** for a person known to lack a code, the call raises; for one with a code it returns the
  code. Record both outputs.

- [ ] **1.4** New `account_kind` values + `doc_kind` column — Scope: `supabase/migrations/` — M
  Widen the `journal_lines` CHECK with `cheque_receivable`, `cheque_payable`. Teach
  `validate_journal_line_ref` their target tables. Add `journal_entries.doc_kind` with its CHECK,
  backfill existing rows (`payment_receipt` → `receipt`), then set `NOT NULL`.
  **Accept:** `SELECT count(*) FROM journal_entries WHERE doc_kind IS NULL;` → `0`
  and inserting a line with `account_kind='cheque_receivable'` succeeds in a rolled-back transaction.

- [ ] **1.5** `document_attachments` polymorphic table + RLS — Scope: `supabase/migrations/` — M
  Columns: `id`, `document_type` (CHECK `receipt|payment|dual`), `document_id`, `storage_path`,
  `mime_type`, `ocr_payload jsonb`, `ocr_status`, `uploaded_by`, `created_at`.
  Existence trigger validating `document_id` against the table implied by `document_type`.
  RLS: SELECT and INSERT for `admin`, `accountant`, `manager`; no UPDATE; DELETE for `admin` only.
  **Accept:** `SELECT relrowsecurity FROM pg_class WHERE relname='document_attachments';` → `t`
  and `SELECT count(*) FROM pg_policies WHERE tablename='document_attachments';` → `3`

- [ ] **1.6** Immutability + mandatory audit on posted entries — Scope: `supabase/migrations/` — M
  See `docs/security/audit-trigger-spec.md`. A `BEFORE UPDATE OR DELETE` trigger on
  `journal_entries` and `journal_lines` raises when the entry is `posted`.
  **Accept:** `UPDATE journal_entries SET description='x' WHERE status='posted';` raises `P0001`.

- [ ] **1.7** Seed `role_permissions` for any new module — Scope: `supabase/migrations/` — S
  Mandatory because `has_dynamic_permission` grants to **all** roles when a module has no row.
  **Accept:** `SELECT count(DISTINCT role_name) FROM role_permissions WHERE module='<new>';`
  equals the total distinct role count.

**Phase 1 exit:** foundations exist; no branch posts yet. Run `npm run typecheck` once — 70 errors
expected, no more. Stress test: 50 concurrent `assign_document_number` calls produce 50 distinct
numbers with no gaps and no duplicates.

---

## Phase 2 — Receipts post

- [ ] **2.1** `rpc-contracts.md` entry for `create_receipt` — Scope: `docs/api/` — S
- [ ] **2.2** `create_receipt` skeleton: validate, mint number, insert receipt, audit — Scope:
  `supabase/migrations/` — M
  **Accept:** an RPC call creates exactly one `payment_receipts` row with a `document_number`.
- [ ] **2.3** Asan-code precondition inside `create_receipt` — Scope: `supabase/migrations/` — S
  **Accept:** creating for a customer with no code raises `P0001`; zero rows inserted afterwards.
- [ ] **2.4** Post the balanced entry inside the same transaction — Scope: `supabase/migrations/` — M
  `doc_kind='receipt'`, `status='posted'`, debit `bank`/`cheque_receivable`, credit
  `customer_credit`. Reject fractional amounts; reject imbalance.
  **Accept:** after one call,
  `SELECT sum(debit)=sum(credit) FROM journal_lines WHERE journal_entry_id=<id>;` → `t`
- [ ] **2.5** Cash branch: mint an internal tracking number — Scope: `supabase/migrations/` — S
  **Accept:** a cash receipt created with no `tracking_number` succeeds and stores a generated one.
- [ ] **2.6** Cheque branch: debit `cheque_receivable` — Scope: `supabase/migrations/` — S
  **Accept:** the entry's debit line has `account_kind='cheque_receivable'`.
- [ ] **2.7** Proforma links inside the transaction — Scope: `supabase/migrations/` — M
  **Accept:** a failed link insert leaves **zero** `payment_receipts` rows (no orphan).
- [ ] **2.8** Role gate + grants — Scope: `supabase/migrations/` — S
  **Accept:** `EXECUTE` as a `sales` test user raises `42501`; as `accountant` it succeeds.

**Phase 2 exit:** a receipt created via RPC posts immediately and moves the customer balance.
Stress test: 50 concurrent receipts → 50 balanced entries, 50 distinct numbers, no orphans.

---

## Phase 3 — Payments post

- [ ] **3.1** `rpc-contracts.md` entry for `create_payment` — Scope: `docs/api/` — S
- [ ] **3.2** Read `pay_purchase_with_voucher` and record its posting shape — Scope: none (read-only) — S
- [ ] **3.3** `create_payment`: validate, mint number, insert voucher, audit — Scope:
  `supabase/migrations/` — M
  Reuse `payment_vouchers` and its existing `payee_matches_type` CHECK.
- [ ] **3.4** Post the entry: `doc_kind='payment'`, debit `supplier_payable`, credit
  `bank`/`cheque_payable` — Scope: `supabase/migrations/` — M
  **Accept:** balanced, posted, correct `doc_kind`.
- [ ] **3.5** Asan-code precondition for the payee — Scope: `supabase/migrations/` — S
- [ ] **3.6** Cash branch: internal number — Scope: `supabase/migrations/` — S
- [ ] **3.7** Cheque branch, own cheque: credit `cheque_payable` — Scope: `supabase/migrations/` — S
- [ ] **3.8** Cheque branch, endorsed customer cheque: credit `cheque_receivable` — Scope:
  `supabase/migrations/` — M
  **Accept:** the referenced cheque is not reusable — a second endorsement raises.
- [ ] **3.9** Role gate + grants — Scope: `supabase/migrations/` — S

**Phase 3 exit:** a payment posts and reduces what we owe. Stress test as phase 2.
**Also fix here:** `supplier_payable` is summed as `credit − debit` by
`person_settlement_position` while the only writer debits it, so a paid supplier reads negative.
Record the sign convention chosen in the progress file.

---

## Phase 4 — Dual documents

- [ ] **4.1** `rpc-contracts.md` entry for `create_dual_document` — Scope: `docs/api/` — S
- [ ] **4.2** `create_dual_document`: two mandatory parties, optional intermediary — Scope:
  `supabase/migrations/` — M
  Source table: reuse `mutual_settlements` if its shape fits, otherwise a new `dual_documents`
  table. Decide by reading it first; record the choice in the progress file.
- [ ] **4.3** Post the entry: `doc_kind='dual'`, debit `supplier_payable` (beneficiary), credit
  `customer_credit` (payer) — Scope: `supabase/migrations/` — M
- [ ] **4.4** Balance invariant: the two allocated amounts must be equal — Scope:
  `supabase/migrations/` — S
  **Accept:** unequal amounts raise `P0001`; zero rows created.
- [ ] **4.5** Asan-code precondition for both parties — Scope: `supabase/migrations/` — S
- [ ] **4.6** Optional intermediary (صراف): metadata when fee is zero, third line when not — Scope:
  `supabase/migrations/` — M
  **Accept:** with a fee, the entry has three lines and still balances.
- [ ] **4.7** Role gate + grants — Scope: `supabase/migrations/` — S

**Phase 4 exit:** all three document types post. Stress test as above.

---

## Phase 5 — Asan exports go live

- [ ] **5.1** `asan_list_journal_export` filters on `doc_kind` — Scope: `supabase/migrations/` — M
  Replace the classifier CTE; keep `_filter` values `all|receipt|payment|third_party`
  (`third_party` → `doc_kind='dual'`). Do not leave both implementations in place.
  **Accept:** replicating the body for each filter returns ≥1 exportable document.
- [ ] **5.2** Cheque kinds are **skipped**, not blocked — Scope: `supabase/migrations/` — S
  **Accept:** a cheque document is not withheld with "code not registered".
- [ ] **5.3** Verify the export gates still hold — Scope: none (read-only) — S
  The migration-294 `DO $chk$` block asserts the unresolvable kinds, the balance invariant and
  `journal_lines_one_side`. All must still pass.
- [ ] **5.4** `invoice_ar` control-account code — Scope: `supabase/migrations/` — S — **gated by OG-3**
- [ ] **5.5** Produce a sample file per branch — Scope: `docs/verification/` — S
  **Accept:** three `.xlsx` files exist with Persian headers including بدهکار and بستانکار.

**Phase 5 exit:** all three ledger-backed exports return real rows. **The owner must open one
sample in Asan before phase 9** — nothing here can verify Asan accepts the file.

---

## Phase 6 — The three-branch wizard

- [ ] **6.1** `stepper-spec.md` — Scope: `docs/frontend/` — S
- [ ] **6.2** `Stepper` component — Scope: `src/components/ui/stepper.tsx` — M
  Does not exist today. No browser storage — state in React only.
- [ ] **6.3** Step 1, document-type selection — Scope: `src/routes/`, `src/features/` — S
- [ ] **6.4** Receipt branch wired to `create_receipt` — Scope: `src/features/` — M
- [ ] **6.5** Payment branch wired to `create_payment` — Scope: `src/features/` — M
- [ ] **6.6** Dual branch wired to `create_dual_document` — Scope: `src/features/` — M
- [ ] **6.7** Party lookup by Asan code or mobile over `persons` — Scope: `src/features/` — M —
  **needs `normalize_identifier`; gated by OG-4**
  **Accept:** the same person is found by `09121234567`, `9121234567` and `+989121234567`.
- [ ] **6.8** Open-proforma list replaces `receipt_type` — Scope: `src/features/` — M
- [ ] **6.9** Delete the security-warning UI and the old create path — Scope:
  `src/shared/components/PaymentReceiptForm.tsx`, `src/routes/` — M
  Check every importer of `PaymentReceiptForm` before deleting; other routes may render it.
- [ ] **6.10** Missing-Asan-code message in the form — Scope: `src/features/` — S
  A clear Persian message, never a raw database error.

**Phase 6 exit:** all three branches create documents from the browser. Deploy, then confirm
`APP_GIT_SHA` equals HEAD.

---

## Phase 7 — OCR on all three branches — **gated by OG-5 (HTTPS)**

- [ ] **7.1** `docs/ocr/requirements.md` — Scope: `docs/ocr/` — S
- [ ] **7.2** Upload writes to `document_attachments` — Scope: `src/features/` — M
- [ ] **7.3** OCR result persisted to `ocr_payload` — Scope: `src/features/`,
  `supabase/migrations/` — M
- [ ] **7.4** Receipt branch pre-fill — Scope: `src/features/` — M
- [ ] **7.5** Payment branch pre-fill — Scope: `src/features/` — S
- [ ] **7.6** Dual branch pre-fill — Scope: `src/features/` — S
- [ ] **7.7** Failure behaviour: OCR failure never blocks manual entry — Scope: `src/features/` — S
  **Accept:** with OCR disabled, all three branches still create documents.

**Phase 7 exit:** a scanned slip pre-fills each branch; manual entry always remains possible.

---

## Phase 8 — Integrated verification

- [ ] **8.1** `test-data/seed-full-scenario.sql` — Scope: `test-data/` — M
- [ ] **8.2** Full E2E: create one of each type through the UI, verify balances — Scope: tests — M
- [ ] **8.3** Export all three, compare against expected rows — Scope: tests — M
- [ ] **8.4** Role matrix test: each role can do exactly what it should — Scope: tests — M
- [ ] **8.5** Negative tests: no Asan code, unbalanced, fractional, duplicate — Scope: tests — M
  **Accept:** each is refused with the correct error code and leaves zero rows.

**Phase 8 exit:** the whole loop verified on test. `FINAL-REPORT.md` drafted.

---

## Phase 9 — Production — **gated by OG-6**

- [ ] **9.1** PR from `staging` to `main`; verify with
  `gh pr view <N> --json state,mergedAt` → `MERGED` + timestamp — S
- [ ] **9.2** Read-only measurement of production ledger state **before** any change — S
- [ ] **9.3** Backup, then apply migrations on production — M
- [ ] **9.4** Build on production; `APP_GIT_SHA` must equal HEAD — S
- [ ] **9.5** One real document created and exported; owner imports it into Asan — S
- [ ] **9.6** Fill the real data gaps (supplier links, Asan codes) — owner task — M

**Phase 9 exit:** the system is live and the owner has imported a generated file into Asan.

---

## Task count

| Phase | Tasks | Owner-Gates |
|---|---|---|
| 0 | 5 | OG-1 |
| 1 | 7 | OG-2 |
| 2 | 8 | — |
| 3 | 9 | — |
| 4 | 7 | — |
| 5 | 5 | OG-3 |
| 6 | 10 | OG-4 |
| 7 | 7 | OG-5 |
| 8 | 5 | — |
| 9 | 6 | OG-6 |
| **Total** | **69** | **6 + OG-7** |
