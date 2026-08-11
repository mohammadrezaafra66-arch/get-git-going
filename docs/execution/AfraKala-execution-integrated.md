# AfraKala — Integrated execution prompt
## Codex, 7 phases, unattended

Run from Phase 1 to Phase 7 without stopping. The user is not present and will
not answer questions. Stop only for the hard stop conditions in 0.5.

---

## 0. RULES

### 0.1 Environment (verified — do not re-derive)
```
Repo          : D:\AfraKalaTest\app
Branch        : feature/navigation-modernization
DB container  : afrakala-lan-db
PostgREST     : afrakala-lan-rest
Database      : afrakala
Frontend      : container afrakala-lan-web, built from D:\AfraKalaTest\app\deploy\lan
LAN URL       : http://192.168.170.8:3100
Typecheck baseline: EXACTLY 70 errors in 6 files. Zero new errors allowed.
Deployed image APP_GIT_SHA: 3caf797e  (STALE — behind e72df534)
```

Verified facts from two research passes — treat as given:
- `public.invoices` = 0 rows and is never used. `public.sales_quotes` = 5 rows
  and is the live workflow.
- `invoices` has a `type` column with value `pre_invoice`; a second, parallel
  pre-invoice design that was abandoned. `sales_quotes` is the real one.
- Quotes list route: `src/routes/_app.sales.quotes.index.tsx` → `/sales/quotes`
- Invoices list route: `src/routes/_app.sales_.invoices.tsx` → `/sales/invoices`
- Manual metrics route: `src/routes/_app.gamification.admin.manual-metrics.tsx`
- `shop_settings.gamification_sales_source` = `manual` (correct)
- `vite.config.ts` already has: `process.env.DISABLE_LOVABLE_MCP === "1" ? [] : [mcpPlugin()]`
- Supabase CLI is NOT installed and there is no type-generation npm script.
- `LOVABLE_API_KEY` is present. `OLLAMA_API_URL` is ABSENT.
- pgvector 0.7.4 installed; `message_embeddings` uses dimension 1536 with HNSW
  cosine indexes; `search_messenger_messages_semantic` is a working retrieval
  pattern to copy.

### 0.2 Database access
```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
```
SQL containing **Persian text**: `docker cp` into the container then `psql -f`.
Never pipe it — that transcode destroyed ~460 config values on 2026-07-11.
Pure-ASCII SQL may be piped. Never print the password.

### 0.3 Output
English only in terminal output. No Persian/Arabic characters — this terminal
reverses RTL text when copied. Persian is fine inside files you write.

### 0.4 Git
Stay on `feature/navigation-modernization`. One commit per phase, staging only
that phase's files. Never `git add -A`. Never commit the pre-existing untracked
root-level `*.md` files. Push after each phase. Never `git reset --hard`,
`git clean -fd`, or `git push --force`.

### 0.5 Execution engine
After each phase: validate → self-repair → commit → push → continue
automatically.

**STOP** for: any DB or permission error; a required object this prompt asserts
exists being absent; a change that would weaken a route guard or broaden a
permission; context budget nearly exhausted — in that case finish the current
phase cleanly, commit, push, write "RESUME AT PHASE N" into
`docs/execution-progress.md`, and stop. That is success, not failure.

**REPAIR (max 3 attempts)** for new typecheck/lint/build errors you introduced.
After 3 failures revert only your own edits, mark DEFERRED, continue.

**RECORD AND CONTINUE** for the 70 baseline errors.

Never claim validation passed when it did not. Never claim a screen was
visually inspected when only an HTTP request was made.

### 0.6 Out of scope
Do not attempt Supabase type regeneration — the CLI is unavailable. Do not
build third-party AI provider key management. Do not delete or edit the ~460
corrupted config values. Do not touch navigation architecture.

---

# PHASE 1 — Redeploy (do this first; it is the cheapest high-impact fix)

The sales-source switch is invisible purely because the running image predates
it. Nothing is wrong with the code, the role, or the setting.

```powershell
cd D:\AfraKalaTest\app\deploy\lan
$env:DISABLE_LOVABLE_MCP="1"
docker compose --env-file .env.lan build web
docker compose --env-file .env.lan up -d web
```
Stamp `GIT_SHA` and `BUILD_TIME` with the real current short SHA and a UTC
timestamp, as previous builds did.

Then restart `afrakala-lan-rest` and confirm readiness by polling a REST
endpoint until it returns 200 — that container defines no Docker healthcheck,
so "healthy" is never reported.

Verify: the served image reports the new `APP_GIT_SHA`, and
`/gamification/admin/manual-metrics` returns 200.

Report the old and new SHA. No commit for this phase.

---

# PHASE 2 — Make migration 142 self-sufficient

`supabase/migrations/20260722230000_142_fix_weight_validity_month_start.sql`
succeeded locally only because two rows were deleted by hand outside the file.
On a fresh database it fails with:
```
ERROR: conflicting key value violates exclusion constraint "dyn_param_weights_no_overlap"
```

Add the deletion **before** the pre-check DO block. Write it **semantically,
not with hardcoded dates or parameter codes** — a hardcoded delete is fragile
and will silently do nothing on a database whose rows differ. Target the real
condition: closed ranges (`valid_to IS NOT NULL`) that never cover any
month-start boundary, and which therefore never affected any score.

Extend the header comment: add the backup-table creation, and extend the
rollback SQL to restore the deleted rows from
`dynamic_parameter_weights_backup_142`.

Do NOT re-apply the migration locally — it is already applied. Instead reason
about idempotency and state explicitly in the report whether re-running the
amended file on the already-migrated local database would be safe or
destructive.

Commit `fix(scoring): make migration 142 self-sufficient`.

---

# PHASE 3 — Standardize the Windows build

The guard already exists in `vite.config.ts`. The problem is that nothing sets
the flag, so a plain `npm run build` on Windows hits the Lovable MCP plugin's
path-separator check.

First, actually run `npm run build` on Windows and capture the real error — the
previous audit only inferred it. Then apply the minimal repo-level fix:

- Prefer making the plugin skip itself automatically on Windows, or when its
  own precondition is unmet, rather than requiring every developer to remember
  an env var.
- If that is not safely possible, add a dedicated npm script that sets the flag,
  and document it.
- Do NOT patch anything inside `node_modules`.

Verify `npm run build` completes on Windows afterward, and confirm the container
build still works.

Commit `fix(build): make Windows builds work without manual flags`.

---

# PHASE 4 — Move accounting markers to sales quotes

Migration 135 put four marker columns plus `set_invoice_accounting_marker` plus
UI on `invoices` — a table that will never hold data in this business.

The markers mean: "registered" = entered into the external accounting software;
"sent" = sent to the customer. They are independent of each other and of the
record's own status.

**Database — new migration:**
- Add the four marker columns to `public.sales_quotes`. Inspect how
  `salesperson_id` and `canceled_by` reference users and match that FK pattern
  exactly — do not invent one.
- Add indexes mirroring migration 135's.
- Create `set_quote_accounting_marker(p_quote_id uuid, p_marker text,
  p_checked boolean)`. Read the live definition of
  `set_invoice_accounting_marker` first and copy its security model verbatim:
  the same role checks, the same uncheck restriction, the same canceled-record
  guard. Audit entity type `sales_quote`.
- Leave the `invoices` columns and RPC in place. Do not drop them yet.

**Frontend — `src/routes/_app.sales.quotes.index.tsx`:**
Add both markers to the operations column, alongside the existing send button.
Match the visual pattern from the invoices implementation: filled/success when
set, outline when not, a tooltip showing who set it and when, an `AlertDialog`
confirmation before unchecking, and the same toast messages. Keep the markers
independent of `sales_quotes.status`, and preserve the warning shown when
"sent" is set but "registered" is not.

**Check before finishing:** determine whether anything else depends on the
invoice marker columns — reports, exports, triggers, or
`trg_invoices_recompute_employee_score`. Report what you find. Do not modify
the gamification trigger.

**Verify:** set both markers on the one `accepted` quote via the RPC, confirm
persistence, confirm an unauthorized role cannot uncheck, and confirm a
canceled quote rejects new markers. Note: `SQ-2026-000002` is canceled — use it.

Commit `feat(sales): add accounting markers to sales quotes`.

---

# PHASE 5 — Link receipts to quotes

This is the highest-impact gap. The sales KPI computes
`0.8 × collected + 0.2 × issued`, and the collected half is permanently 0
because `payment_receipt_links` links only to `invoices`.

## 5.1 Research gate — answer these before writing anything
The previous audit left these unanswered. Determine each and report:

a) Does `sales_quotes` have any notion of paid amount or remaining balance? If
   not, how would a remaining balance be computed — `final_amount` minus the
   sum of allocated receipts?
b) Quote the exact block in `calculate_employee_score` that computes the
   collected amount today.
c) Every database function, view, or trigger referencing
   `payment_receipt_links`. Query `pg_get_functiondef` across `public`.
d) In `PaymentReceiptForm.tsx`, quote the allocation logic: how it lists
   selectable records, how it validates the allocation total against the
   receipt amount and against each record's remaining balance, and where it
   inserts link rows.

**If (a) reveals that quote balances cannot be computed without a business
decision — for example if partial payments across multiple quotes are
ambiguous — STOP and report rather than guessing.**

## 5.2 Implement
- Add nullable `quote_id uuid REFERENCES public.sales_quotes(id)` to
  `payment_receipt_links`.
- Make `invoice_id` nullable.
- Add a CHECK that exactly one of `invoice_id` / `quote_id` is set — this is
  what prevents the double-counting risk.
- Add the index and any unique constraint mirroring the invoice side.
- Update `PaymentReceiptForm.tsx` so that when receipt type is
  `invoice_payment`, it lists **quotes** (status `accepted`, with a remaining
  balance) instead of the empty invoices query
  `.from("invoices").eq("type", "pre_invoice")`. Keep every existing validation
  rule: allocation total ≤ receipt amount, each allocation ≤ that record's
  remaining balance, at least one allocation required.
- Update `calculate_employee_score` so the collected amount reads from
  quote-linked receipts. Make the **minimum** edit — preserve the
  `0.8 × collected + 0.2 × issued` formula exactly. Read the live definition
  first; if its structure differs from a clean KPI CASE block, STOP.

## 5.3 Verify
Create a receipt allocated against the one accepted quote. Confirm: the link
row is created with `quote_id` set and `invoice_id` null; the CHECK rejects a
row with both set; over-allocation beyond the quote's balance is rejected;
`calculate_employee_score` for that salesperson now returns a non-zero
collected component; and the score rises accordingly.

Show before/after numbers for that employee.

Clean up any test receipt you create, then recompute the score so
`employee_scores` is consistent — a stale score row is worse than none.

Commit `feat(accounting): allow receipts to be allocated against sales quotes`.

---

# PHASE 6 — Complete the orphan audit properly

The previous pass answered this at too high a level. Do it exhaustively.

## 6.1 Backend → frontend
List **every** table, view, and function in schema `public`. For each classify:
- **WIRED** — referenced in `src/` AND reachable via a route a user can open
  from the menu
- **UNREACHABLE** — referenced in `src/` but no menu entry exposes it
- **ORPHAN** — nothing in `src/` references it

Separate genuine orphans from objects that are internal by design (helpers
called by other functions, trigger functions, audit plumbing). Do not report
internal helpers as problems.

## 6.2 Frontend → backend
UI that promises what the backend cannot deliver: routes querying tables or
RPCs that do not exist, buttons whose handler is empty or TODO, features whose
backing table has zero rows and no writer, forms that submit nowhere.

For each: the file, the route, and **how a user reaches it through the Persian
menu** — module, then menu item, then page. The user must be able to navigate
there and look, so this must be precise.

## 6.3 Cheap fixes only
Where a backend capability is unreachable ONLY because a navigation entry is
missing, and the route already exists with a correct guard, add the entry.
Anything needing new UI, new schema, or a business decision goes in the report
instead. State clearly what you fixed and what you deliberately left.

## 6.4 Deliverable
Write `docs/backend-frontend-coverage.md` in **Persian** — the user reads this
one. For every gap: what it is, where it lives, the Persian menu path to reach
it, and what is missing. Sort by impact.

Include a section on the two parallel pre-invoice designs (`invoices` with
`type = 'pre_invoice'` versus `sales_quotes`), explaining plainly which is live,
which is dead, and what the dead one still costs in confusion.

Commit `docs(audit): backend/frontend coverage map`.

---

# PHASE 7 — Integration and validation

- `npm run typecheck` — must remain at exactly 70 baseline errors.
- `npm run build` — must now pass on Windows.
- Rebuild the LAN container and restart `afrakala-lan-rest`.
- Smoke test, including one deliberately bogus route that must return 404 so
  the 200s are meaningful:
  `/sales/quotes`, `/sales/invoices`, `/accounting/receipts/create`,
  `/gamification/admin/manual-metrics`, `/sales/search`, `/knowledge`,
  `/this-route-does-not-exist-xyz`
- Confirm no PostgREST "relation does not exist" or schema-cache errors in logs.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / DEFERRED / STOPPED, with commit SHAs and push status
2. Phase 1: old and new `APP_GIT_SHA`; is the switch now served?
3. Phase 2: the semantic delete you wrote; is re-running the migration safe?
4. Phase 3: the real Windows build error and the exact fix
5. Phase 4: which FK pattern you matched; the four verification results; what
   else depends on the invoice marker columns
6. Phase 5: **answers to all four research-gate questions**; the schema change
   made; before/after employee score with the collected component now non-zero
7. **Phase 6: the full coverage map — every ORPHAN and UNREACHABLE item, what
   you fixed, what you left, and why**
8. Typecheck / build / smoke results
9. Anything you decided on your own that needs review
10. What still requires a human, with the Persian menu path for each

## START NOW
Begin at Phase 1.