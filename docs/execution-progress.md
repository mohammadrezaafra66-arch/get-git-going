# Execution progress — AfraKala-execution-round2.md

## RESUME AT PHASE 2 (implementation)

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
