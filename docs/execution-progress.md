# Execution progress

## FINAL PLAN (AfraKala-final-plan.md): ALL NINE PHASES DONE (2026-07-24)

Phases 5–9 completed in this session on `feature/navigation-modernization`.
Commits: `223f3cd8` (hide invoices menu), `5244ab0f` (payments training page),
`13c40865` (Ollama config), `79549707` (shared AI client + vault key storage),
`7f870e2f` / `da54e463` / `3e64671c` / `48654da2` / `1701cc02` (five call-site
migrations, one each), `877f9991` (knowledge RAG). All pushed.

### Migrations applied: 153 (ai_providers + vault) and 154 (knowledge chunks)
Both with `psql -U supabase_admin -d afrakala --single-transaction
-v ON_ERROR_STOP=1 -f <file>`, no inner BEGIN/COMMIT, committed with the code.

### THE TRAP THAT ALMOST BIT AGAIN
Migration 153 rewrites `is_valid_audit_entity_type`. The version in the
20260628 migration file is **completely different** from the live one — the
live function carries ~70 entity types, the old file ~60 different ones.
Rebuilding the list from the migration file would have silently deleted most
valid entity types and broken audit logging app-wide. **Always dump the live
definition with `pg_get_functiondef` before a CREATE OR REPLACE.**

### Phase 6.2 capability probes — the findings that constrained everything after
- **chat / qwen2.5:7b — works.** Persian in, Persian out, ~16-17s, no CJK or
  Latin leakage. But it hallucinates domain facts when ungrounded (it invented
  a definition of «پیش‌فاکتور»). Usable only with retrieved context.
- **embeddings / bge-m3 — works. Dimension 1024**, measured, not assumed.
- **vision / qwen3.6 — READS PERSIAN PROSE, MISREADS PERSIAN DIGITS.** On a
  clean synthetic bank receipt at temperature 0, reproducibly across runs:
  amount ۴۵٬۰۰۰٬۰۰۰ → ۲۵٬۰۰۰٬۰۰۰, tracking ۸۲۷۴۱۹۶۳۵۰ → ۸۲۷۴۱۹۶۲۵۰, account
  ۵۸۹۲۱۰۱۲۳۴۵۶۷۸۹۰ → ۵۸۹۳۱۰۱۲۳۴۵۶۷۸۹۰. Consistent ۴→۲ and ۳→۲ confusion; a
  digit-focused prompt made it worse. **Not safe for receipt OCR.** No real
  receipt image exists anywhere in the system, so this was a synthetic upper
  bound — a photographed receipt would be worse.
  Enforced by data, not code: the seeded `ollama` provider does not declare
  the `vision` capability, so `aiVision` can never select it.

### Where AI provider keys live, and the operational trap
Supabase Vault (`supabase_vault` 0.2.8 + `pgsodium` 3.1.8, both already
installed). pgsodium's root key is a 0600 file at
`/etc/postgresql-custom/pgsodium_root.key` — **outside the database**. So a
pg_dump, a copied backup or a SQL-injection read yields ciphertext only.
Host/container compromise still yields everything; there is no KMS here.
**TRAP: the root key file is not in a database backup.** Restoring the database
alone onto another host makes every stored provider key permanently
undecryptable. Back the key file up separately.

### BLOCKED-NEEDS-APPROVAL — still no container rebuild
Confirmed by the smoke test: the app on :3100 serves `APP_GIT_SHA=35216bb0`,
not this branch's `877f9991`. `/admin/ai-providers` returns **404** there while
`/accounting/receipts/training` returns 200 only because it matches the
deployed `$receiptId` route. Everything built in phases 5–9 that touches the
frontend is therefore **not live**. `docker compose up -d web` (and the
OLLAMA_* env it picks up) needs the user's approval.

---

## SUPERSEDED — PHASES 2, 3, 4 (same session, earlier)

Session of 2026-07-24. Branch `feature/navigation-modernization`. Commits
`028e448a` (Phase 2), `c9d7355e` (Phase 3), both pushed. **The payment chain is
now complete and verified end to end — the plan's designated best stopping
point.**

### FIRST, A TRAP THAT COST THIS SESSION TIME — READ BEFORE ANY psql
The live database is **`afrakala`**, NOT `postgres`. The `postgres` database in
the same container is a stale clone: it still has the pre-147 schema
(`payment_receipt_links.invoice_id NOT NULL`, no `quote_id`, no
`sales_quotes.customer_id`) and 0 quotes. Querying it makes it look like
migrations 147-150 were never applied. Always use `-d afrakala`.
`afrakala_test` is also stale (no `quote_id`, 0 quotes) — not usable as a
scratch clone without replaying 147-152.

Objects are owned by **`supabase_admin`**, and `postgres` is NOT a superuser
here. `CREATE OR REPLACE FUNCTION`/`VIEW` on existing objects fails with
"permission denied for schema public" as `-U postgres`. Use `-U supabase_admin`
to apply migrations; `-U postgres` is fine for read-only inspection.

### Migration conventions adopted this session
Migration files now carry **no `BEGIN`/`COMMIT` of their own**. An inner
`COMMIT` closes psql's `--single-transaction` wrapper early, so a later failure
would leave the schema half-applied — the exact risk the flag exists to
prevent. Apply with both flags:
```
psql -U supabase_admin -d afrakala --single-transaction -v ON_ERROR_STOP=1 -f <file>
```
Migrations 151 and 152 follow this; 150 and earlier still have inner
BEGIN/COMMIT (harmless, but do not copy that pattern).

Persian inside function bodies survives fine via `docker cp` + `psql -f`
(verified: 242 and 162 Persian codepoints in migration 152's two functions,
zero `?`). It is **piping** Persian that corrupts it.

---

## PHASE 2 — DONE. Commit `028e448a` (migration 151), pushed.

**2.2 `calculate_credit_score`** — five invoice-keyed blocks now read a UNION of
invoices and ACCEPTED `sales_quotes`: (a) all-time totals, (b) per-document
payments in window, (c) settlement speed, (d) late-payment count, (e) the
cross-customer average normalising `purchase_score`. Scoring shape untouched —
same sub-scores, weights, formula, window resolution, profile/snapshot/audit
writes. Document mapping: `final_amount`→total, `expires_at`→due_date,
`created_at`→issue_date, `status='accepted'` as the "issued" filter.
`COALESCE(invoice_id, quote_id)` is an exact document key because the
migration-148 CHECK makes the two targets disjoint.

Block (a) was extended even though the earlier research listed only four
blocks: leaving it invoice-only would write a `customer_credit_profile` row
claiming `total_paid` > `total_purchases`.

**2.3 `vw_customer_receivables` + `get_receivable_detail`** — the view gained a
UNION ALL branch for accepted quotes with an unpaid balance (`final_amount`
minus approved allocations; only `accepted` counts as a debt). Same columns,
types and order, so `CREATE OR REPLACE VIEW` kept every grant and
`get_receivables_list` / `get_receivables_summary` / `_app.reports.tsx` pick the
rows up with no frontend change. `get_receivable_detail`'s join to `invoices`
became a LEFT JOIN, `issue_date` falls back to the row's `created_at`, and the
receipt join matches either key.

Gotcha for anyone editing the view: `total_amount` is `numeric(18,2)` and
`CREATE OR REPLACE VIEW` refuses to widen it, so the quote branch must cast
`q.final_amount::numeric(18,2)`.

### TWO LATENT DEFECTS FOUND AND FIXED (both money-visible)
1. **`LEAST()` ignores NULLs.** In blocks (b) and (e) an unpaid document has no
   row in the payments CTE, so `LEAST(NULL, total_amount)` returned
   `total_amount` and counted the document's **full value as PAID**. Measured
   before the fix: a customer who had paid nothing reported
   `paid_purchase_amount = 163,100,000`, and that figure would have been
   written to `customer_credit_profile.total_paid`. Now
   `LEAST(COALESCE(paid,0), total_amount)`.
2. **`SELECT ... INTO v_outstanding` assigns NULL when no profile row exists**,
   defeating both the inline `COALESCE` and the DECLARE default, so a
   customer's *first* scoring run got `outstanding_score = 0` instead of 100
   and only self-corrected on the second run. Now re-COALESCEd after assignment.

Both were dormant only because `invoices` has 0 rows; both would have gone live
the moment quotes joined the union.

**2.4 verification** (rolled-back txn, 40,000,000 against SQ-2026-000003):
credit score **55 → 77**, `paid_in_window` **0 → 40,000,000**, quote
outstanding **100,100,000 → 60,100,000**, salesperson collected
**0 → 40,000,000**, blended KPI **32,000,000**. All counts back to baseline.

---

## PHASE 3 — DONE. Commit `c9d7355e` (migration 152), pushed.

Two triggers, because one is not enough:

- **Guard 1**, BEFORE INSERT OR UPDATE ON `payment_receipt_links`: total
  allocations may not exceed the receipt amount; an allocation may not exceed
  the target document's remaining balance. Remaining counts **APPROVED**
  receipts only — deliberately matching what `PaymentReceiptForm.tsx` shows the
  accountant. A stricter rule would reject allocations the form had just
  offered, and a guard that rejects legitimate work is worse than no guard.
- **Guard 2**, BEFORE UPDATE ON `payment_receipts` when status becomes
  `approved`: guard 1 alone leaves a real hole — while receipts are
  `pending_review` their allocations count toward nothing, so N pending receipts
  can each claim the full balance and all be approved. Guard 2 re-checks at the
  only moment over-allocation becomes real money.

**Concurrency:** both guards take row locks *before* reading the sums they
validate, always receipt-then-document. Proven empirically, not just argued:
after the guard runs the backend holds `RowShareLock` on both
`payment_receipts` and `sales_quotes`, and `xmax` on both the receipt row and
the quote row equals the current xid — so a concurrent transaction on those
rows blocks. A cross-pair deadlock stays theoretically reachable if two
transactions insert several links touching the same documents in opposite
orders; PostgreSQL aborts one, which fails safe.

A two-session blocking test was **not** run: it would require committing
fixture receipts to the live database, and `afrakala_test` is too stale to host
it. The lock evidence above is what was actually measured.

Errors are Persian with real figures (the form surfaces `linkErr.message`
verbatim) and use ERRCODE 23514 so PostgREST returns 400, not 500.

**3.3 verification — 14/14 passed** in a rolled-back txn: valid allocation
accepted; 60,000,000 against a 50,000,000 receipt rejected; 70,000,000 against
a 60,100,000 remaining balance rejected; 30,000,000 + 30,100,000 summing to
*exactly* the remaining balance both accepted; 1 Rial past a fully paid quote
rejected; two pending receipts each claiming 62,200,000 both inserted but the
second **approval** blocked by guard 2; a receipt with no allocations still
approves. Zero rejections leaked a raw constraint name.

---

## PHASE 4 — DONE (with one step blocked). All eight results are real numbers.

Run against quote `4850549b` (SQ-2026-000003, final 100,100,000, salesperson
`56014064`, customer `d05bbd0b`), receiver external party `e9b29dd2`, receipt
45,000,000 — **inside a single transaction that was rolled back**. See the
decision note below for why.

| # | Step | Result |
|---|------|--------|
| 1 | create receipt | 45,000,000, `pending_review` |
| 2 | allocate against quote | `quote_id` set, `invoice_id` NULL |
| 3 | approve | `approved` |
| 4 | exactly one balanced journal entry | 1 entry, 2 lines: debit `external_party` 45,000,000 / credit `customer_credit` 45,000,000, balanced = true. Re-post returned `already_posted`, count stayed 1 |
| 5 | credit rose + one ledger row | `available_credit` 0.00 → **45,000,000.00**; exactly 1 ledger row (`payment`, before 0.00, after 45,000,000.00) |
| 6 | quote remaining dropped | 100,100,000 → **55,100,000** |
| 7 | appears in receivables | SQ-2026-000003, paid 45,000,000, outstanding 55,100,000; `get_receivable_detail` returns the quote row with `issue_date` 2026-07-21 and the linked receipt |
| 8 | salesperson score rose via collected | collected 0 → **45,000,000**, blended KPI 0 → **36,000,000** (0.8×45M), monthly_score 200.233333 → 200.235073 |

Customer credit score after the payment: **79**.

**Proof of restoration** (after ROLLBACK): `available_credit` 0.00,
credit_ledger 0, journal_entries 0, journal_lines 0, payment_receipts 0,
payment_receipt_links 0, credit_score_snapshots 0, quote remaining back to
100,100,000, receivables outstanding back to 100,100,000.

**Smoke test** against the running app at 192.168.170.8:3100 —
`/accounting/receipts/create` 200, `/sales/quotes` 200, `/accounting/receipts`
200, `/gamification/admin/manual-metrics` 200, and the bogus control
`/this-route-does-not-exist-xyz` **404**, so the test discriminates. PostgREST
schema cache reloaded via `NOTIFY pgrst, 'reload schema'` (zero downtime, no
container restart) — logs show a clean reload, 216 relations / 269 functions,
no schema-cache errors.

### BLOCKED-NEEDS-APPROVAL — the Phase 4 container rebuild was NOT performed
The plan opens Phase 4 with "rebuild the LAN container, restart
`afrakala-lan-rest`". The running app at 192.168.170.8:3100 is serving a
**different branch** against this live database. Rebuilding would deploy
`feature/navigation-modernization`'s frontend over whatever is currently live —
an outward-facing change well beyond the plan's schema scope, and not reversible
by a rollback. Skipped as the conservative choice. `NOTIFY pgrst` achieved the
only part actually needed (schema-cache refresh) with no downtime.

**Consequence to be honest about:** the smoke test above proves the DB changes
did not break the *currently deployed* app. It does **not** validate this
branch's frontend. That still needs a rebuild once someone approves it.

### Decision note — end-to-end chain run in a rolled-back transaction
The plan says to create the test data, then delete it and restore
`available_credit`. On a live production database, a rollback is strictly safer
than commit-then-delete: it proves restoration rather than relying on cleanup
SQL being correct, and never exposes a fake 45,000,000 receipt or a bogus
journal entry to real users, even briefly. Every number in the table above is
real; none of it persisted.

---

## VALIDATION (run at the end of Phase 4)

**`npm run typecheck` — exactly 70 errors in exactly 6 files. Baseline met, zero
new.** Files: `src/lib/accounting/functions.ts`, `src/lib/audit/index.ts`,
`src/lib/invoices/functions.ts`, `src/routes/_app.admin.automation.tsx`,
`src/routes/_app.admin.sales-reminders.tsx`, `src/routes/_app.products.index.tsx`.

**`npm run lint` — 1272 problems (855 errors, 417 warnings). This does NOT match
the "lint 0" figure recorded by an earlier session.** Breakdown by rule:

| count | rule |
|-------|------|
| 854 | `prettier/prettier` |
| 318 | `@typescript-eslint/no-explicit-any` (warnings) |
| 33 | `react-hooks/exhaustive-deps` |
| 28 | `react-refresh/only-export-components` |
| 22 | `no-useless-escape` |
| 5 | `prefer-const` |

**854 of the 855 errors are `prettier/prettier`** — i.e. formatting drift, not
defects. All of it is pre-existing: `git diff --name-only 88d13e98..HEAD -- src`
returns **0 files**, so phases 2-4 changed no TypeScript at all (only two
migrations and this document). The earlier "lint 0" note was most likely scoped
to the files that session touched (cf. commit `ac6fb438`, "fix prettier
formatting in receipt form"), not the whole repo.

**Deliberately NOT auto-fixed.** `eslint --fix` would rewrite several hundred
files that this work never touched, on a branch whose container is deployed
against the live database. That is a large, risky, unreviewable diff and it
violates the one-commit-per-phase / stage-only-your-own-files rule. Whoever picks
this up should decide whether to do a dedicated formatting-only commit — and if
so, do it as its own commit with nothing else in it.

---

## NEW FINDINGS THAT NEED A HUMAN (money-relevant, not fixable by code)

1. **No receipt can post to accounting through the external-party receiver path
   today.** `validation_rules` has two enabled, `severity='blocking'` rules for
   scope `journal_entry`: `payer_accounting_code` required and
   `receiver_accounting_code` required. The only row in `external_parties`
   (`e9b29dd2`) has `accounting_code` NULL — 0 of 1 parties have a code. The
   Phase 4 run only got past this because the test receipt carried an explicit
   `receiver_accounting_code`. **Someone must fill in accounting codes for
   external parties.**
2. **The same blocking rule makes the bank-receiver path unpostable.** Migration
   149 deliberately sets the receiver code to NULL for bank receivers (because
   `bank_accounts` has no `accounting_code` column), but the
   `receiver_accounting_code / required` rule then rejects the post. Either that
   rule needs a bank-receiver exemption, or banks need accounting codes. This is
   the same unresolved bank→accounting-code mapping decision recorded earlier.
   **Do not guess — it moves money.**
3. **The corrupted Persian strings are confirmed still corrupted** in the live
   DB: `post_receipt_accounting` raises `'???? ???????? ...'`. Reading its source
   shows `?` runs where Persian should be (2026-07-11 event). Migration 152's new
   Persian is clean, so the corruption is historical, not ongoing. The two
   accounting functions still need human re-entry of their messages.
4. **`vw_customer_receivables` has no grant to `authenticated`** — only
   `postgres` and `service_role`. The receivables page works because it goes
   through SECURITY DEFINER RPCs, but `_app.reports.tsx:231` reads the view
   *directly* via PostgREST and would be denied. Pre-existing, unchanged by this
   session; worth checking during the Phase 9 audit.
5. Guest quotes (`customer_id` NULL) do appear in the receivables view with
   `customer_name` falling back to the name on the quote. Deliberate — the debt
   is real — but per-customer filters will not match them.

---

## RESUME AT PHASE 5 — small cleanups
5.1 hide the dead invoices menu entry (**first check whether `waybills` depends
on `invoices` and whether waybills are used — if so, leave the menu alone**);
5.2 payments/receipts training page modelled on
`src/components/customers/CustomerCreditGuide.tsx` at
`/sales/customers/credit-training`; 5.3 one-line recommendations for the four
kept dead modules (`customer-credit-snapshot.ts`, `PenaltyBadge.tsx`,
`PriceChangeIndicator.tsx`, `RateTypeBadge.tsx`). Then Phase 6 (Ollama at
http://192.168.170.8:11434 — bge-m3 embeddings/1024, qwen2.5:7b chat, qwen3.6
vision), 7 (shared AI client + key storage), 8 (migrate call sites + RAG),
9 (coverage audit).

Phase 5 onward touches the **frontend**, so remember the live-deployment
constraint: the running container is on another branch and must not be rebuilt
without approval.

---

## SUPERSEDED — earlier session notes below this line

## FINAL PLAN (AfraKala-final-plan.md): Phase 2.1 DONE. RESUME AT PHASE 2.2.

**Phase 2.1 — sales KPI collected reads quote receipts. COMMIT `436fbbf1` (migration 150), pushed.**
`calculate_employee_score` collected (hardcoded 0 by 146) now sums APPROVED
receipt allocations against the salesperson's ACCEPTED quotes, 6-month window,
capped per quote at final_amount. 0.8/0.2 blend unchanged. Verified: collected
0→40,000,000; blended total_sales 32,000,000. `calculate_salesperson_collected_sales`
(separate, invoice-based, not called by scoring) left unchanged.

## RESUME AT PHASE 2.2 / 2.3 — credit score + receivables (money-critical, do carefully)
Stopped for budget; these are larger rewrites across money-critical objects. All
three are ASCII (no Persian). Research done:
- **2.2 `calculate_credit_score`** — has FOUR invoice-keyed sub-blocks (all yield 0
  since invoices=0): paid-in-window (lines ~74-94: `inv AS (…invoices…)` ⋈
  `pay AS (prl.invoice_id…)`), an events block (~103-109 `JOIN invoices`), a
  last-payment block (~134-148), and a total block (~155-163). Each must UNION
  quote-linked APPROVED-receipt payments (join `payment_receipt_links.quote_id →
  sales_quotes` for accepted quotes of the customer). Preserve the scoring shape.
- **2.3 `vw_customer_receivables`** — invoice-based (`WITH paid AS (…prl.invoice_id…)
  … FROM invoices i … WHERE i.commitment_confirmed AND outstanding>0`). UNION ALL a
  quote branch: map q.id→invoice_id, q.quote_number→invoice_number,
  'sales_quote'→invoice_type, q.status→invoice_status, q.expires_at→due_date,
  q.final_amount→total_amount, deposit 0, paid = SUM(approved links by quote_id),
  outstanding = GREATEST(final_amount−paid,0); only `status='accepted'` and
  outstanding>0. **`get_receivable_detail`** then needs its `JOIN public.invoices i
  ON i.id = v.invoice_id` changed to LEFT JOIN (quote rows have no invoice) and
  `i.issue_date` COALESCE'd (quotes have no issue_date; use created_at), and the
  receipt LEFT JOIN extended to also match `prl.quote_id = v.invoice_id`.
- **2.4** verify before/after for score (done for collected), credit, receivables.

Then Phase 3 (over-allocation trigger), Phase 4 (end-to-end + rebuild — THE key
stopping point), Phases 5-9 per the plan. Ollama reachable at
http://192.168.170.8:11434 (bge-m3 emb/1024, qwen2.5:7b chat, qwen3.6 vision).

---

## ROUND 4 (AfraKala-execution-round4.md): Phase 1 DONE. RESUME AT PHASE 2.

**Phase 1 — receipt form allocates against quotes. COMMITS `5dd21ac4` + `ac6fb438`, pushed.**
`PaymentReceiptForm.tsx` now lists the customer's ACCEPTED `sales_quotes` with
remaining > 0 (was the dead `invoices.type='pre_invoice'`), links via `quote_id`,
computes remaining = `final_amount` − sum of APPROVED-receipt link amounts
(client-side; accountant has RLS SELECT on sales_quotes). Allocation field
renamed `invoice_id`→`quote_id`; clear "no eligible pre-invoices" message; casts
for `customer_id`/`quote_id` columns missing from stale generated types
(147/148). Verified in a rolled-back txn: link `quote_id` set / `invoice_id`
null; both-set CHECK rejected; partial allocation dropped remaining 100.1M→60.1M,
second receipt →30.1M. Typecheck 70, lint 0. NOTE: over-allocation rejection is
client-side (existing design; no DB constraint) — flagged.

## RESUME AT PHASE 2 — surface collected payments (scoring / credit / receivables)
Stopped for context budget; Phase 1 is a complete verified deliverable. Phase 2
edits three money-adjacent DB objects (needs careful work, not a rushed pass):
2.1 `calculate_employee_score` collected (hardcoded 0 by migration 146) → read
quote-linked APPROVED receipts, preserve 0.8/0.2; check
`calculate_salesperson_collected_sales`. The recompute triggers that invoke it
are already fixed (148/149). 2.2 `calculate_credit_score` count quote payments.
2.3 `vw_customer_receivables` + `get_receivable_detail` show accepted-quote unpaid
balance. 2.4 before/after verify. Then Phase 3 (end-to-end + rebuild) finishes the
payment work; Phases 4–7 (Ollama at http://192.168.170.8:11434 — bge-m3 emb/1024,
qwen2.5:7b chat, qwen3.6 vision; shared AI client; call-site migration; RAG).

---

## ROUND 3 (AfraKala-execution-round3.md): Phase 1 + Phase 2 DONE. RESUME AT PHASE 3.2.

**Phase 1 — receipt posting repaired (Model B). COMMIT `79c78739`, pushed.**
The blocker is resolved. Migration 149 fixed `post_receipt_accounting`
(journal_lines `kind`/`ref_id`→`account_kind`/`account_ref_id`; line-2
`'customer'`→`'customer_credit'`; bank receiver no longer reads the nonexistent
`bank_accounts.accounting_code`, header left blank), neutralized
`post_receipt_journal` to a no-op (function+trigger retained), and fixed a THIRD
latent `text=app_role` bug in `recompute_employee_scores_on_receipt` that blocked
the approve UPDATE. All six 1.5 checks passed (exactly one balanced entry,
`increase_credit` once, one credit-ledger row, idempotent re-approve); 1.6 proved
the quote-linked recompute fires and the DB fully reverts. NOTE: both accounting
functions' Persian strings were already corrupted to `?` in the live DB
(2026-07-11 event) — preserved verbatim, need human re-entry.

**Phase 2 — dead-module triage. COMMIT `e6ad3bf7`, pushed.**
Deleted (SUPERSEDED): `enqueue-torob-readonly-job.functions.ts` (the `.server.ts`
sibling is the wired one), `market-intelligence/PlaceholderCard.tsx`
(scaffolding; cards use `MICardShell`). Left (not provably superseded):
`customer-credit-snapshot.ts` (UNCLEAR), `PenaltyBadge.tsx` (VIABLE/UNCLEAR),
`PriceChangeIndicator.tsx`, `RateTypeBadge.tsx` (UNCLEAR).

**Phase 3.1 — env contradiction resolved.** All AI vars ABSENT in the
afrakala-lan-web container and on the host; in `deploy/lan/.env.lan`,
`OLLAMA_*` are ABSENT and `LOVABLE_API_KEY` is **declared but EMPTY**. That empty
declaration is the source of the "present vs absent" disagreement. **No AI
provider is usable today.**

## RESUME AT PHASE 3.2 — build the shared AI provider client
Stopped here for context budget after completing the two highest-value phases
(money-critical Phase 1 + Phase 2 cleanup). Phase 3.2–3.7 is a large greenfield
build (shared chat/embeddings/vision client with Ollama-first fallback + 429/402
distinction + provider health; admin settings page; pgcrypto-encrypted key
storage + migration; model/capability discovery). It was NOT started — building
it rushed, with no provider to test against, would produce untested code. The
research for it is complete in `AfraKala-research-pass-3.md` Part B (no shared
client exists; 5 call sites hardcode `ai.gateway.lovable.dev`; `pgcrypto`
installed-but-unused; `shop_settings` plaintext; `bot_api_keys` hashed/unfit;
`_app.admin.settings.tsx` is the natural admin home).

## HANDOFF for Phases 4–6 (RAG + migrate call sites): the user must supply an AI credential
Phases 4–6 cannot be verified until a working credential exists — either an
Ollama URL with pulled models (chat + an embeddings model + a vision model), or a
provider API key entered through the Phase-3 admin page once built. Until then,
`knowledge_documents` has 0 rows and the pipeline would index nothing.

---

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
