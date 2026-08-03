# AfraKala — Comprehensive research pass #2
## Codex read-only discovery — 9 areas

READ-ONLY. Change nothing. Create nothing. Commit nothing. Push nothing.
No migrations. No schema changes. No frontend edits. No rebuilds.
The only output is a written report.

Repo: `D:\AfraKalaTest\app`
Branch: `feature/navigation-modernization`

**Output in English only** — this terminal reverses Persian text when copied.
Refer to Persian UI strings by English meaning plus Latin transliteration.

DB access (read-only queries only):
```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala
```
Never print the password.

For every finding give the exact file path, table name, or route. For every
absence write plainly "NONE — does not exist." Do not propose designs, do not
write code, do not soften a negative finding. A later prompt will handle the
build. The purpose of this pass is to prevent building anything twice and to
prevent building on a wrong assumption.

---

# AREA 1 — Migration 142 completion

`supabase/migrations/20260722230000_142_fix_weight_validity_month_start.sql`
was applied to the local database successfully, but only because two blocking
rows were deleted **by hand, outside the file**:

```
customer_payment_discipline  weight 0.200  valid_from 2026-07-12  valid_to 2026-07-13
customer_profit_3m           weight 0.150  valid_from 2026-07-12  valid_to 2026-07-13
```

Without that manual deletion, the file fails with:
```
ERROR: conflicting key value violates exclusion constraint "dyn_param_weights_no_overlap"
```

Report:
1.1 The exact current contents of the file's pre-check DO block and its
    backfill UPDATE — quote them.
1.2 The full definition of the `dyn_param_weights_no_overlap` constraint.
1.3 Current row count and full contents of `dynamic_parameter_weights`
    (parameter code, weight, valid_from, valid_to).
1.4 Whether `dynamic_parameter_weights_backup_142` exists and its row count.
1.5 Exactly what statement must be added to the file, and **where in the file**
    it must go, so the migration is self-sufficient on a fresh database.
1.6 Whether re-running the amended file on the already-migrated local database
    would be safe or destructive. State the reasoning.

---

# AREA 2 — Supabase types regeneration

`src/integrations/supabase/types.ts` is stale: it lacks `sales_reminders` and
`automation_jobs`, causing 20 of the 70 baseline typecheck errors. It DOES
contain the `v_dynamic_*` views added recently, which suggests hand-editing.

Report:
2.1 Is the Supabase CLI installed and available in this environment? Version?
2.2 Is there a `supabase/config.toml` or equivalent, and does it point at the
    local instance?
2.3 What exact command would regenerate types against the local database? Check
    `package.json` scripts first — do not invent a command.
2.4 Does regeneration require network access, or can it read the local Postgres
    directly?
2.5 Confirm by inspection: is `v_dynamic_customer_capital_balances` present in
    `types.ts` and also present in the live database? If present in both, a
    regeneration should preserve it — confirm that reasoning.
2.6 Estimate which of the 70 errors would disappear after regeneration, by file.

---

# AREA 3 — Windows build failure

`npm run build` fails on Windows inside the `@lovable.dev/mcp-js` vite plugin on
a path-separator check (`D:/…` vs `D:\…`). The Linux container build succeeds.

Report:
3.1 The exact error output from `npm run build` on Windows.
3.2 Where the plugin is registered — quote the relevant part of `vite.config.*`.
3.3 What the plugin actually does. Is it required for the production build, or
    only for Lovable's own tooling?
3.4 Is it listed in `dependencies` or `devDependencies`?
3.5 What is the minimal repo-level fix — conditional registration, an env flag,
    a path normalization? Do NOT implement it. Describe the options and which
    is safest.
3.6 Confirm whether the container build path uses the same vite config, and if
    so why it does not hit the bug.

---

# AREA 4 — Accounting markers: where they are vs where they belong

Verified context: this business does NOT issue formal invoices. Everything runs
through `sales_quotes`. `public.invoices` has 0 rows; `sales_quotes` has 5.

The Persian menu has two separate entries:
- "pre-invoices" (`pish-factor-ha`) — the page the user actually uses
- "invoices" (`factor-ha`) — believed to be empty

Migration 135 added four marker columns to `invoices` plus the RPC
`set_invoice_accounting_marker` plus UI.

Report:
4.1 The exact route file and URL for the pre-invoices/quotes list page, and
    which table it reads.
4.2 The exact route file and URL for the invoices list page, and which table it
    reads. Confirm whether it renders zero rows.
4.3 Every route file that references `public.invoices`, `invoice_items`,
    `invoice_workflow_stages`, or `waybills`. For each: is it reachable from
    the Persian menu, and does it have any data behind it?
4.4 The complete live definition of `set_invoice_accounting_marker` — quote it.
    Report its role checks, its uncheck restriction, and its canceled-record
    guard.
4.5 The FK pattern `sales_quotes` uses for user references — inspect
    `salesperson_id` and `canceled_by`: do they reference `profiles` or
    `auth.users`?
4.6 What exactly would need to change to move the markers to `sales_quotes`:
    columns, indexes, RPC, UI file, audit-log actions. List them; do not
    implement.
4.7 Is anything else — reports, exports, triggers, the gamification trigger
    `trg_invoices_recompute_employee_score` — depending on the `invoices`
    marker columns? If the markers move, what else must follow?

---

# AREA 5 — Linking receipts to quotes (the missing 80% of sales score)

The sales KPI in `calculate_employee_score` computes
`0.8 × collected + 0.2 × issued`. The collected half is permanently 0 because
`payment_receipt_links` links only to `invoices`, which is empty. Receipts
cannot be attached to quotes.

Report:
5.1 Full schema of `payment_receipts`: every column, type, nullability, FKs.
    Current row count.
5.2 Full schema of `payment_receipt_links`: every column, type, FKs, unique
    constraints, indexes. Current row count.
5.3 Every place in `src/` that reads or writes `payment_receipt_links` — file
    and line.
5.4 In `PaymentReceiptForm.tsx`, exactly how the invoice-allocation UI works:
    how it lists selectable invoices, how it validates allocation totals
    against the receipt amount and against each record's remaining balance, and
    where it inserts the link rows. Quote the relevant logic.
5.5 Does `sales_quotes` have any notion of a remaining/unpaid balance, or paid
    amount? If not, what would have to be computed to support allocation
    against a quote?
5.6 The exact schema change required to allow a receipt to be allocated against
    a quote: new column(s), constraints, and whether the existing `invoice_id`
    column should become nullable with a check that exactly one of
    `invoice_id` / `quote_id` is set.
5.7 Every consumer of `payment_receipt_links` in the database — functions,
    views, triggers, reports — that would need updating. Query
    `pg_get_functiondef` across `public` for references.
5.8 Precisely how `calculate_employee_score` currently computes the collected
    amount — quote that block — and what it would need to read instead.
5.9 Any risk of double-counting if a receipt could link to both a quote and an
    invoice.

---

# AREA 6 — The missing sales-source switch

Migration 146 added a switch controlling whether salesperson sales are scored
from finalized quotes (auto) or manual entry (manual). The user reports the
switch is **not visible** at the manual-metrics page.

Report:
6.1 The exact route file and URL for the manual daily metrics page.
6.2 Quote the code that renders the switch: its role condition, its data
    source, and its loading/error states.
6.3 Where the setting is stored — table, row key, current value. Query it.
6.4 The route's permission guard, and the exact role condition gating the
    switch. The user is signed in as the top admin
    (`mohammadrezaafra66@gmail.com`, "modir-e kol") — determine whether that
    account satisfies the condition. Query the user's actual roles.
6.5 Whether the deployed container image contains the switch code. Compare the
    image's `GIT_SHA` build arg against the commit that added the switch.
6.6 State the single most likely cause: stale build, failed setting read,
    role-condition mismatch, or a render bug. Give evidence.

---

# AREA 7 — Full orphan audit

Produce a complete map of backend capability versus frontend reachability. Be
exhaustive; an incomplete audit is worse than none.

7.1 **Backend → frontend.** List every table, view, and function in schema
`public`. For each, classify:
   - **WIRED** — referenced in `src/` AND reachable via a route a user can open
     from the menu
   - **UNREACHABLE** — referenced in `src/` but no menu entry or route exposes
     it to a user
   - **ORPHAN** — nothing in `src/` references it

   Separate genuine orphans from objects that are internal by design (helper
   functions called by other functions, trigger functions, audit plumbing). Do
   not report internal helpers as problems.

7.2 **Frontend → backend.** The reverse: UI that promises something the backend
cannot deliver. Routes querying tables or RPCs that do not exist; buttons whose
handler is empty or TODO; features whose backing table has zero rows and no
writer; forms that submit nowhere.

For each, report the file, the route, and **how a user reaches it through the
Persian menu** — module, then menu item, then page. The user needs to navigate
there and look, so this must be precise.

7.3 Check these explicitly:
   - `manual_daily_metrics_totals` — is it called now that 146 landed?
   - `v_dynamic_customer_capital_balances` / `v_dynamic_salesperson_capital_balances`
   - `dynamic_scoring_parameters` with `entity_type = 'salesperson'` (6 rows) —
     which route edits them?
   - `staff_daily_performance_metrics` and its RPC
   - `sales_reminders` — is the popup actually mounted on the sales search page?
   - the `invoices` family — which parts are dead weight
   - `bot_api_keys` and its three sibling tables — reachable? used?
   - `daily_mood_questions` (93 rows, all corrupted) — is there UI for it?
   - `dynamic_table_cells` (266 corrupted values) — are dynamic tables still
     used, and from which route?

7.4 For each gap, state whether fixing it requires only a missing navigation
entry (cheap), new UI (medium), or new schema plus a business decision (expensive).

---

# AREA 8 — RAG readiness

Research pass #1 already established: pgvector 0.7.4 installed, dimension 1536,
HNSW cosine indexes, `search_messenger_messages_semantic` exists as a working
retrieval pattern, `knowledge_documents` has `is_published` and `access_level`
with values `all` / `manager_only` / `finance_only` / `admin_only`, no chunking
exists, no reindex action exists. Do not repeat those findings.

Report only what is still unknown:
8.1 Quote the full definition of `search_messenger_messages_semantic` — it is
    the template for a knowledge equivalent.
8.2 Quote `src/lib/messenger/embeddings.functions.ts` in full: how it calls the
    Lovable gateway, how it batches, how it handles failure, and how it decides
    what to embed.
8.3 How `access_level` is enforced today on `/knowledge` — is it an RLS policy,
    an application-side filter, or both? Quote the policy.
8.4 The RLS policies on `message_embeddings` — a knowledge chunk table would
    need an equivalent shape.
8.5 Is `LOVABLE_API_KEY` currently set in the running environment? Report
    presence only, never the value. Same for `OLLAMA_API_URL`, `OLLAMA_MODEL`.
8.6 If Ollama is the preferred engine, does the running Ollama instance expose
    an embeddings endpoint, and which models does it have available? Query it
    if reachable; report unreachable if not.

---

# AREA 9 — Third-party AI provider key management

Research pass #1 established this does not exist: no UI for provider
credentials, no fallback chain, no quota detection beyond local 429/402
handling, no model discovery. The user wants: an admin can enter an API key;
the system prefers self-hosted Ollama; if Ollama is unavailable it falls back
to the keyed provider; if the provider reports exhausted credit the user is
told clearly; and the system discovers which models the key supports and
prefers a cheap one.

Report what already exists to build on:
9.1 `shop_settings` — full schema, current rows, and how migration 146 used it.
    Is it suitable for storing an encrypted secret, or is a dedicated table
    needed?
9.2 Is `pgcrypto` available (pass #1 says yes) and is it used anywhere today
    for encrypting stored values? Quote an example if so.
9.3 How `bot_api_keys` stores its secrets — hashing method, and whether that
    approach is reusable. Note: bot keys are hashed because they only need
    verification; provider keys must be **decryptable** to be used. Confirm
    that distinction against the code.
9.4 The exact 429/402 handling in `purchase-advisor.functions.ts`,
    `ad-copy.functions.ts`, and `receipt-ocr.functions.ts` — quote each. Is
    there any shared helper, or is it duplicated?
9.5 Which admin route would be the natural home for a provider-settings page?
    List candidates with their guards.
9.6 Do any of the AI-calling functions share a common client or wrapper, or
    does each construct its own fetch? This determines whether a fallback chain
    can be introduced in one place or must touch every call site.

---

# REPORT FORMAT

Answer areas 1–9 in order. Use the numbered sub-points as headings so nothing
is skipped. Quote code and SQL where asked. For every absence write
"NONE — does not exist."

End with two summary tables.

**Table A — Fix readiness**

| Item | Blocker | Effort | Risk | Ready to implement? |
|---|---|---|---|---|
| Migration 142 self-sufficiency | | | | |
| types.ts regeneration | | | | |
| Windows build | | | | |
| Move markers to quotes | | | | |
| Receipt→quote linking | | | | |
| Missing switch | | | | |
| Knowledge RAG | | | | |
| Provider key management | | | | |

**Table B — Coverage gaps**

| Item | Type | Persian menu path | Fix cost |
|---|---|---|---|

Sort Table B by impact, highest first.

Do not propose designs. Do not write code. Report only.