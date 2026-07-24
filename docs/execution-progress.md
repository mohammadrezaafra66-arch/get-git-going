# Execution progress — AfraKala-execution-round2.md

## STILL BLOCKED — the receipt-posting blocker is an ACCOUNTING-MODEL DECISION, not a code fix

Investigated 2026-07-24. The blocker is deeper than "one type cast." There are
TWO live-but-broken posting paths that post DIFFERENT journal entries for the
same receipt. `journal_entries` has 0 rows — no receipt has ever posted through
either. A human/accountant must decide which model is authoritative before any
code fix.

**Path A — `post_receipt_journal`** (trigger `trg_payment_receipts_post_journal`,
AFTER INSERT OR UPDATE OF status on `payment_receipts`, via
`trg_post_receipt_on_approve` — fires on APPROVE):
- Journal lines use `account_kind='accounting_code'` (valid columns).
- Debit = beneficiary/receiver accounting_code; Credit = payer accounting_code.
  A pure code-to-code entry. No `increase_credit`, no invoice updates.
- Only bug: guard `source_id = _receipt_id::text` (source_id is uuid) →
  `uuid = text` error. One-line fix (`= _receipt_id`).

**Path B — `post_receipt_accounting`** (app RPC, called from
`src/routes/_app.accounting.receipts.$receiptId.tsx:332` when the accountant
clicks POST):
- Journal lines reference columns `kind`/`ref_id` that DO NOT EXIST (real
  columns are `account_kind`/`account_ref_id`) → runtime error.
- Debit = bank/external_party (`account_ref_id` = entity); Credit = customer.
  ALSO runs `increase_credit(customer, amount)` and reconciles invoice status.
- Also reads `bank_accounts.accounting_code`, a column that does not exist.

**Verdict (Step 1.3): the two paths are NOT equivalent and neither is dead.**
Different accounts, different journal_lines columns, different side effects
(Path B alone touches the customer credit ledger and invoice status). Which is
correct is an accounting decision:
- Model A: payer code (credit) → beneficiary code (debit).
- Model B: bank/party asset (debit) → customer receivable (credit) + credit ledger.

Per the task's own gate, execution STOPPED before any fix. No migration written,
nothing applied.

**Decision needed from a human/accountant:**
1. Which journal model is authoritative — A (accounting-code pair) or B
   (bank/customer + credit ledger)? They cannot both post for one receipt.
2. `bank_accounts` has NO `accounting_code` column (only id, title, bank_name,
   iban, account_no, card_no, currency, opening_balance, is_active, notes,
   timestamps). If Model B is chosen, a bank->accounting-code mapping must be
   decided (add a column, or resolve differently). Do NOT add on a guess.
3. Once decided: fix the chosen path, and neutralize the other (make its
   idempotency guard a genuine no-op — do NOT drop the function or trigger).

RESUME remains at Phase 2A.4 posting (below) — still blocked until the above is
decided.



## STOPPED in Phase 2A — pre-existing money-posting blocker. RESUME AT Phase 2A.4 (posting) after fixing `post_receipt_journal`.

**Done and pushed this session (`AfraKala-phase2-payment-chain.md`):**
- `b03d0d83` — migration 148 (Phase 2A schema + recompute trigger). Applied,
  verified, committed. Schema: `payment_receipt_links.quote_id` (nullable FK,
  indexed), `invoice_id` nullable, XOR CHECK exactly-one (both-set and
  neither-set both rejected — verified), `UNIQUE(receipt_id, quote_id)`.
  `recompute_employee_scores_on_receipt_link` resolves the salesperson from the
  quote (verified: recompute fired, event logged, salesperson resolved). Role
  check switched to `public.has_role` — `user_roles.role` is TEXT, so the
  original `ur.role = 'sales'::app_role` was a latent `text=app_role` bug.
- `post_receipt_accounting` left UNCHANGED (analysis: journal + `increase_credit`
  are receipt-based and already post for a quote-linked receipt; adding quote
  logic would double-post). This half of 2A.4 could NOT be executed end-to-end —
  see blocker.

**BLOCKER (why 2A.4 posting, 2B, 2C, 2D did not run) — pre-existing, money-critical:**
1. `post_receipt_journal(uuid)` (fired by trigger `trg_post_receipt_on_approve`
   whenever a receipt reaches `status='approved'`) contains a type bug:
   `... AND source_id = _receipt_id::text` where `journal_entries.source_id` is
   `uuid` → `operator does not exist: uuid = text`. **No receipt can be approved
   at all** — which is why `payment_receipts` has 0 rows. The whole chain is
   blocked at the very first step (create+approve a receipt), before quotes even
   matter. This function is NOT recorded in the research gate below and is
   outside this doc's stated scope.
2. There are therefore TWO journal-posting paths: `post_receipt_journal`
   (trigger, on approve) and `post_receipt_accounting` (explicit). Both write
   `journal_entries` with `source_type='payment_receipt', source_id=receipt.id`
   and both have an idempotency guard, so they should not double-post — but this
   must be confirmed by a human before any receipt is created. Deciding which is
   authoritative, and fixing `post_receipt_journal`'s cast, is money-critical and
   was a rule-0.4 STOP (money "silently not posted"; potential double-post).

**To RESUME (next session):**
1. Fix `post_receipt_journal`: correct the `source_id`/`_receipt_id` comparison
   to matching types (mirror `post_receipt_accounting`, which uses
   `source_id = v_receipt.id` uuid=uuid). Confirm the two posting paths are not
   redundant/double-posting.
2. Then complete Phase 2A.4 posting verification: approve a quote-linked receipt,
   confirm ONE balanced journal entry, `increase_credit` ran once.
3. Then Phase 2B (calculate_employee_score collected from quote receipts —
   see 2.1a; check `calculate_salesperson_collected_sales` too; the trigger that
   invokes recompute is already fixed), 2B.2 credit, 2B.3 receivables view.
4. Then Phase 2C (receipt form) and Phase 2D (end-to-end).
Test scaffolding that worked: accepted quote `4850549b-…` (salesperson
`56014064-…`, customer `d05bbd0b-…`, final 100100000); external party
`e9b29dd2-…` for the receiver path (avoid the bank path —
`bank_accounts.accounting_code` referenced by `post_receipt_accounting` also
does not exist, a second latent bug). Use `SET LOCAL request.jwt.claims` for
`auth.uid()`.

---

## RESUME AT PHASE 2 (implementation)  [superseded by the section above]

Phase 1 is COMPLETE and pushed. The Phase 2 **research gate is complete** and is
recorded below. Phase 2 **implementation was intentionally NOT started** — it
hit a hard stop condition (money-critical, multi-function, with unstated
business decisions) plus a low context budget. Read this whole section before
implementing.

---

## Done and pushed

- **Phase 1 (link quotes to customers)** — COMPLETE.
  - `949aab6b` — migration 147: `sales_quotes.customer_id` (nullable, FK, index) + guarded backfill (4/5 linked, SQ-2026-000002 NULL).
  - `ef18c8ab` — migration `20260723170500`: `create_sales_quote_with_items` gained `p_customer_id` (10th arg, DROP+CREATE, body otherwise identical to the live dump).
  - `732f46e4` — `quotes.new.tsx` passes the picked customer id as `p_customer_id`, with money-safety: the link is kept only while name (trimmed) and phone (digits-only) still match the picked customer; any divergent edit drops it. A quiet badge shows linked vs guest. Verified via RPC: with-id stored the id, without-id stored NULL; test quotes deleted; table back to 5 rows.
  - **No quote EDIT form exists** — `sales.quotes.$quoteId.tsx` shows customer name/phone read-only (view + status only), so nothing else needed the same treatment.

---

## PHASE 2 — research gate (2.1) COMPLETE

### 2.1a — the collected block in `calculate_employee_score` today

Migration 146 hardcoded it to zero (there was no quote linkage then). Live now:

```
_collected_amount numeric := 0;                       -- declared
...
_collected_amount := 0;   -- inside the is_sales branch (line ~160)
_collected_amount := 0;   -- inside the else branch    (line ~167)
...
_blended_sales_m := (0.8 * _collected_amount) + (0.2 * _issued_sales_for_blend);
```

The minimal Phase 2 edit is: in the `is_sales` branch, replace `_collected_amount := 0`
with a SUM of receipt-link amounts whose `quote_id` belongs to this salesperson's
accepted quotes, over the existing 6-month window (`pr.payment_date >= now - 6 months`,
`pr.status IN ('approved','verified','confirmed','posted')`, mirroring the old
invoice-based subquery that migration 146 removed). Preserve `0.8*collected + 0.2*issued`.

### 2.1b — EVERYTHING referencing `payment_receipt_links` (the blast radius)

Functions (6):
- `calculate_credit_score(uuid)` — sums `prl.amount` WHERE `prl.invoice_id IN (invoices…)`. Quote-linked rows (invoice_id NULL) are excluded → quote payments would not affect credit score. **Business decision:** should they?
- `calculate_salesperson_collected_sales(uuid,int)` — a SEPARATE invoice-based collected path (returns collected_amount from invoices⋈links). Not currently called by `calculate_employee_score`. Would also need quote awareness if it is meant to be authoritative.
- `get_receivable_detail(uuid,uuid)` — reads `vw_customer_receivables` ⋈ invoices. Invoice-keyed; quote-linked receipts invisible.
- `post_receipt_accounting(uuid,uuid)` — `JOIN invoices i ON i.id = prl.invoice_id`. **A quote-linked receipt (invoice_id NULL) is silently dropped from accounting posting.** Money-critical; needs an explicit decision + code path.
- `recompute_employee_scores_on_receipt()` and `recompute_employee_scores_on_receipt_link()` — the latter does `IF _invoice_id IS NULL THEN return early`. **A quote-linked link row would NOT trigger a score recompute**, which defeats Phase 2's purpose. MUST be updated to resolve the salesperson via `quote_id` too.

View (1): `vw_customer_receivables` — invoice-keyed.
Trigger (1): `trg_payment_receipt_links_recompute_employee_score` (fires the recompute fn above).

Current schema: `invoice_id NOT NULL`, FK→invoices ON DELETE RESTRICT, `UNIQUE(receipt_id, invoice_id)`, `amount > 0`.

### 2.1c — PaymentReceiptForm allocation logic

NOT re-read this session (budget). Prior audits established it currently lists
`.from("invoices").eq("type","pre_invoice")` (a dead query — invoices is empty),
validates allocation total ≤ receipt amount and each allocation ≤ that record's
remaining balance, requires ≥1 allocation, and inserts link rows. Re-read
`src/shared/components/PaymentReceiptForm.tsx` in full before editing.

### 2.1d — quote remaining balance

`sales_quotes` has no paid/balance column, so remaining balance =
`final_amount − COALESCE(SUM(payment_receipt_links.amount WHERE quote_id = q.id), 0)`.
Sound. Partially-paid quotes display as `final_amount` minus that sum; eligible
quotes for allocation are `status='accepted'`, `customer_id = selected customer`,
remaining > 0.

---

## Why implementation STOPPED (not a failure — see doc rule 0.5)

The doc's Phase 2.2 lists only: schema change, form change, and the
`calculate_employee_score` edit. The research gate shows that is **incomplete and
money-adjacent**: without also updating `recompute_employee_scores_on_receipt_link`
the score never updates for quote receipts, and `post_receipt_accounting` would
silently skip them. Two further consumers (`calculate_credit_score`,
receivables) raise genuine **business decisions** the doc does not answer
(should a quote payment affect credit score / appear in receivables?). These are
"money could be attached to the wrong customer / miscounted" territory, which
rule 0.5 says to STOP for. Combined with a low context budget, starting the
schema migration now risked the exact applied-but-uncommitted state the last
session was scolded for.

### Recommended implementation order for the next session
1. Schema migration: add `quote_id uuid NULL REFERENCES sales_quotes(id)` + index; `ALTER invoice_id DROP NOT NULL`; `CHECK ((invoice_id IS NOT NULL) <> (quote_id IS NOT NULL))` (exactly one); `UNIQUE(receipt_id, quote_id)`; FK `ON DELETE RESTRICT` to match the invoice side.
2. `recompute_employee_scores_on_receipt_link`: resolve salesperson via `quote_id` when `invoice_id IS NULL` (so scores recompute).
3. `calculate_employee_score`: the 2.1a collected edit.
4. **Decision needed from user**: does a quote-linked receipt post to accounting (`post_receipt_accounting`), affect `calculate_credit_score`, and appear in `vw_customer_receivables`? Do not guess — these move money/credit.
5. `PaymentReceiptForm.tsx`: list eligible accepted quotes for the selected customer (2.1d), keep all existing validations, clear empty-state message.
6. Verify per 2.3 (CHECK rejects both-set, over-allocation rejected, collected non-zero, score rises), then delete the test receipt and recompute.

---

## Phases 3–9 — NOT STARTED

- Phase 3 (hide dead invoices menu), Phase 4 (supabase types), Phase 5.2 (other
  uncommitted changes — 5.1 is stale, whatsapp file committed as `367fd582` on
  branch `feature/wa-market-intel-source-chips`), Phase 6 (receipts training
  page), Phase 7 (knowledge RAG), Phase 8 (orphan audit), Phase 9 (integration).
- Working-tree note for Phase 5.2 at stop time: only the intended Phase-1 files
  were changed this session; no other stray `src/`/`supabase/` modifications.
