# AfraKala — Phase 2: complete the payment chain for quotes

Resume `AfraKala-execution-round2.md` at Phase 2 implementation. The research
gate is already done and recorded in `docs/execution-progress.md` — read that
file first; it contains the full blast-radius analysis.

Run unattended. The user is not present. Stop only for the conditions in 0.4.

---

## 0. RULES

### 0.1 Environment
```
Repo         : D:\AfraKalaTest\app
Branch       : feature/navigation-modernization
Pushed HEAD  : c05f8e08
DB container : afrakala-lan-db
PostgREST    : afrakala-lan-rest
Database     : afrakala
Frontend     : container afrakala-lan-web, from D:\AfraKalaTest\app\deploy\lan
LAN URL      : http://192.168.170.8:3100
Typecheck baseline: EXACTLY 70 errors in 6 files. Zero new allowed.
```

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
```
SQL containing Persian: `docker cp` then `psql -f`. Never pipe it. Pure-ASCII
SQL may be piped. Never print the password.

English only in terminal output — this terminal reverses Persian text when
copied. Persian is fine inside files you write.

### 0.2 Git
Stay on `feature/navigation-modernization`. One commit per phase, staging only
that phase's files. Never `git add -A`. Never commit the user's root-level
`*.md` working documents. Push after each phase. Never `git reset --hard`,
`git clean -fd`, `git push --force`.

**Never leave a migration applied-but-uncommitted.** If a migration is applied
to the database, commit the file in the same working session, before moving on.

### 0.3 Verified context — do not re-derive
- This business does not issue formal invoices. `public.invoices` = 0 rows.
  `public.sales_quotes` is the live workflow, now with a nullable `customer_id`
  (4 of 5 backfilled; the canceled one is correctly NULL).
- `payment_receipts` = **0 rows**. No receipt has ever been created. The whole
  payment → accounting → credit → score chain has never executed. You are
  completing an unfinished chain, not repairing corrupted data.
- `create_sales_quote_with_items` accepts `p_customer_id`, and the quote form
  passes it with a money-safety guard that clears the link if the name or phone
  is edited away from the picked customer.

### 0.4 Stop conditions
Stop and report if: any DB or permission error occurs; a required object
asserted here is absent; a live function's structure differs materially from
what `docs/execution-progress.md` recorded; **any change could cause money to
be posted twice, posted to the wrong customer, or silently not posted at all**;
or the context budget runs low — in that case finish the current phase cleanly,
commit, push, update `docs/execution-progress.md` with a RESUME marker, stop.
That is success.

Repair up to 3 attempts for typecheck/lint/build errors you introduced. Record
and continue past the 70 baseline errors. Never claim validation passed when it
did not.

---

## 0.5 The three business decisions — DECIDED, implement exactly this

The research gate surfaced three unstated decisions. All three are answered
**YES**, for the reasons given. Do not re-open them.

| Question | Answer | Reason |
|---|---|---|
| Should a quote-linked receipt post to accounting? | **YES** | Otherwise the ledger stays permanently empty — no invoices exist, so quote receipts are the only receipts this business will ever have. Money arriving and not being recorded is unacceptable. |
| Should it affect the customer's credit score? | **YES** | `customer_payment_discipline` carries weight 0.150 in the scoring model. If real payments are invisible, that parameter is permanently blind. |
| Should it appear in receivables? | **YES** | An accepted quote minus its payments is exactly what the customer owes. Otherwise the receivables page is permanently empty. |

---

# PHASE 2A — Schema and the two WRITE paths (must be atomic)

The schema change and the two write-path functions must land in a single
migration. A schema that permits quote links while the posting function ignores
them is worse than no change at all: money would be received and silently not
recorded.

## 2A.1 Schema
- `payment_receipt_links`: add `quote_id uuid NULL REFERENCES
  public.sales_quotes(id)`, plus an index.
- Make `invoice_id` nullable.
- Add a CHECK enforcing that **exactly one** of `invoice_id` / `quote_id` is
  set. This is the guard against double-counting — do not omit it.
- Mirror whatever unique constraint exists on the invoice side, adapted to
  quotes.

## 2A.2 Fix `post_receipt_accounting` — highest risk, do it first
It currently does `INNER JOIN invoices i ON i.id = prl.invoice_id`, so a
quote-linked row is silently skipped: money received, nothing posted.

Read the live definition. Extend it so a quote-linked receipt posts correctly.
Make the **minimum** change — preserve the existing accounting entry shape,
accounts, and signs exactly. If the entry it builds depends on invoice fields
that `sales_quotes` does not have, STOP and report which fields; do not
substitute a guess.

## 2A.3 Fix `recompute_employee_scores_on_receipt_link`
It returns early when `invoice_id IS NULL`, so quote-linked receipts would
never trigger a recompute — defeating the entire purpose of this work.

Extend it to resolve the salesperson from the quote when `quote_id` is set.
Preserve its existing behavior for invoice-linked rows unchanged.

## 2A.4 Verify before committing
In a transaction you roll back, insert a quote-linked receipt and link row, and
confirm:
- the CHECK rejects a row with both `invoice_id` and `quote_id` set
- the CHECK rejects a row with neither set
- `post_receipt_accounting` produces an accounting entry for it, and the entry
  balances
- `recompute_employee_scores_on_receipt_link` fires and resolves the correct
  salesperson

Report the actual output of each. If any fails, fix before proceeding.

Commit `feat(accounting): allow receipts to link to quotes across the write path`.
Push.

---

# PHASE 2B — The READ paths

These only display data, so they cannot corrupt anything — but while they stay
invoice-keyed, the accounting team sees an empty system.

## 2B.1 `calculate_employee_score` — the collected component
The sales KPI computes `0.8 × collected + 0.2 × issued`, and collected is
permanently 0. Read the live definition first. If its structure differs from
the clean KPI CASE block recorded in `docs/execution-progress.md`, STOP.

Make the minimum edit so collected reads quote-linked receipts. Preserve the
`0.8 / 0.2` weighting exactly.

Note: `calculate_salesperson_collected_sales` may already be the collected
path — check whether the edit belongs there instead. Report which you chose.

## 2B.2 `calculate_credit_score`
Extend so that payments against quotes count toward payment discipline, the
same way invoice payments were meant to. Preserve the existing scoring shape.

## 2B.3 `vw_customer_receivables` and `get_receivable_detail`
Extend both so an accepted quote's unpaid balance appears as a receivable.
A quote's remaining balance is `final_amount` minus the sum of allocations
linked to it — there is no stored paid column, so it must be computed.

Only `accepted` quotes are receivables. Draft, sent, canceled, and rejected
quotes are not debts and must not appear.

## 2B.4 Verify
For the one accepted quote, show before/after for: the salesperson's score
(collected component now non-zero), the customer's credit score, and the
receivables view. Use a transaction you roll back, or clean up afterward and
recompute so no stale score row remains.

Commit `feat(accounting): surface quote payments in scoring, credit, and receivables`.
Push.

---

# PHASE 2C — The receipt form

`PaymentReceiptForm.tsx` currently queries the dead
`.from("invoices").eq("type", "pre_invoice")`, which returns nothing.

Change it so that when receipt type is `invoice_payment`, it lists the selected
customer's **accepted quotes with a remaining balance greater than zero**,
using the `customer_id` link added in Phase 1.

Keep every existing validation rule: allocation total ≤ receipt amount, each
allocation ≤ that quote's remaining balance, at least one allocation required.

Two UI details that matter:
- If the selected customer has no eligible quotes, say so plainly instead of
  showing an empty list with no explanation.
- Show each quote's remaining balance next to it, not just its total — the
  accountant needs to see what is still owed.

Rename any user-facing label that says "invoice" to the quote terminology the
rest of the app uses, so the accountant is not looking for something that does
not exist.

Run typecheck, lint, and build. Commit
`feat(accounting): allocate receipts against sales quotes in the receipt form`.
Push.

---

# PHASE 2D — End-to-end validation

This is the first time this chain will ever have run. Test it properly.

Rebuild the LAN container and restart `afrakala-lan-rest`, polling until 200.

Then, through the RPC layer rather than the browser, execute the full chain
against the one accepted quote:
1. create a receipt for that customer
2. allocate it against the quote
3. confirm the accounting entry was posted and balances
4. confirm the quote's remaining balance decreased
5. confirm it appears correctly in receivables
6. confirm the salesperson's score rose via the collected component
7. confirm the customer's credit score reflects the payment

Report the actual numbers at each step.

Then delete the test receipt and its link, recompute the affected scores, and
confirm the system is back to its starting state. Report the row counts before
and after to prove it.

Smoke test with one deliberately bogus route that must return 404:
`/accounting/receipts/create`, `/sales/quotes`, `/accounting/receipts`,
`/gamification/admin/manual-metrics`, `/this-route-does-not-exist-xyz`.

Confirm no PostgREST "relation does not exist" or schema-cache errors in logs.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / STOPPED, with commit SHAs and push status
2. Phase 2A: the exact edits to `post_receipt_accounting` and
   `recompute_employee_scores_on_receipt_link`, and the four verification
   results
3. Phase 2B: whether the collected fix went into `calculate_employee_score` or
   `calculate_salesperson_collected_sales`, and why; before/after for score,
   credit, and receivables
4. Phase 2C: what the form now lists, and how "no eligible quotes" is handled
5. Phase 2D: the full end-to-end numbers, and proof the test data was removed
   and scores recomputed
6. Typecheck / lint / build / smoke results
7. Anything you decided on your own that needs review
8. What still requires a human, with the Persian menu path for each
9. Update `docs/execution-progress.md`: mark Phase 2 complete and set the
   RESUME marker to Phase 3 of `AfraKala-execution-round2.md`

## START NOW
Read `docs/execution-progress.md`, then begin at Phase 2A.