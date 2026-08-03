# AfraKala — Final consolidated execution plan
## Everything remaining, in one document

Run unattended. The user is not present and will not answer questions.
Nine phases, ordered so that stopping at any phase boundary leaves a complete,
verified deliverable.

**Phase 1 is already DONE** (receipt form allocates against quotes, commits
`5dd21ac4` + `ac6fb438`). **Begin at Phase 2.**

---

## 0. RULES

### 0.1 Environment
```
Repo         : D:\AfraKalaTest\app
Branch       : feature/navigation-modernization
DB container : afrakala-lan-db
PostgREST    : afrakala-lan-rest
Web container: afrakala-lan-web, built from D:\AfraKalaTest\app\deploy\lan
LAN URL      : http://192.168.170.8:3100
Ollama       : http://192.168.170.8:11434  (reachable from the web container)
Typecheck baseline: EXACTLY 70 errors in 6 files. Zero new allowed.
```

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
```
SQL containing Persian: `docker cp` then `psql -f`. Never pipe it. Pure-ASCII
SQL may be piped. Never print the password.

English only in terminal output — this terminal reverses Persian text when
copied. Persian is fine inside files you write.

### 0.2 Budget discipline — read this
`npm run typecheck` takes about three minutes. A previous session burned most
of its budget re-running it after every small edit.

Run it **once per phase, at the end**, together with lint. While editing, rely
on reading the code carefully. If a phase introduces errors, fix them in one
pass rather than iterating against a three-minute feedback loop.

### 0.3 Git
Stay on `feature/navigation-modernization`. One commit per phase, staging only
that phase's files. Never `git add -A`. Never commit the user's root-level
`*.md` working documents. **Run lint before committing, not after.** Push after
each phase. Never `git reset --hard`, `git clean -fd`, `git push --force`.
Never leave a migration applied-but-uncommitted.

### 0.4 Execution engine
After each phase: validate → self-repair → commit → push → continue.

**STOP** for: any DB or permission error; a required object asserted here being
absent; a weakened route guard or broadened permission; any situation where
money could be posted twice, attached to the wrong customer, or silently not
posted; or a low context budget — finish the current phase cleanly, commit,
push, write "RESUME AT PHASE N" into `docs/execution-progress.md`, stop.

**REPAIR (max 3 attempts)** for typecheck/lint/build errors you introduced.
After 3 failures revert only your own edits, mark DEFERRED, continue.

**RECORD AND CONTINUE** past the 70 baseline errors.

Never claim validation passed when it did not. Never claim a screen was
visually inspected when only an HTTP request was made.

### 0.5 Verified state — do not re-derive
- **Receipt posting works** (migration 149, Model B ledger path). Path A is a
  retained no-op.
- `payment_receipt_links` has nullable `quote_id` and `invoice_id` with a CHECK
  enforcing exactly one (migration 148).
- `sales_quotes` has nullable `customer_id` (migration 147); the quote form
  passes it with a money-safety guard.
- The receipt form now lists accepted quotes with remaining balance and links
  via `quote_id`.
- `public.invoices` = 0 rows, never used. `sales_quotes` is the live workflow.
- Three `text = app_role` bugs fixed (`user_roles.role` is TEXT). A fourth would
  be fixed the same way, with `public.has_role`.
- `types.ts` is stale — `customer_id` and `quote_id` are missing from it. The
  codebase works around this with casts. Supabase CLI is not installed, so
  regeneration is blocked. Do not hand-edit `types.ts`.
- Ollama models: `bge-m3` (embedding, **1024 dimensions**), `qwen2.5:7b` (chat),
  `qwen3.6` (vision + chat, 36B, large and slow).
- `deploy/lan/.env.lan` declares `LOVABLE_API_KEY=` **empty**. No `OLLAMA_*` var
  is set yet.

---

# PHASE 2 — Surface collected payments

Three read paths are still invoice-keyed and therefore show nothing.

## 2.1 The collected component of the sales KPI
The sales KPI computes `0.8 × collected + 0.2 × issued`; collected is
hardcoded 0 by migration 146.

Read the live definition of `calculate_employee_score` first, and also check
`calculate_salesperson_collected_sales` — it may already be the collected path.
Report which you edited and why.

Make the minimum edit so collected reads **approved** quote-linked receipts.
Preserve the 0.8 / 0.2 weighting exactly. The recompute triggers that invoke it
are already fixed (migrations 148, 149).

## 2.2 Credit score
Extend `calculate_credit_score` so payments against quotes count toward payment
discipline the way invoice payments were meant to. Preserve the scoring shape.

## 2.3 Receivables
Extend `vw_customer_receivables` and `get_receivable_detail` so an accepted
quote's unpaid balance appears as a receivable.

Balance rule, consistent with the form: `final_amount` minus the sum of
approved-receipt allocations. Only `accepted` quotes are receivables — draft,
sent, canceled, and rejected are not debts.

## 2.4 Verify
For the accepted quote and its salesperson, show before/after for: the
salesperson's score with collected now non-zero, the customer's credit score,
and the receivables view. Use a transaction you roll back, or clean up and
recompute so no stale score row remains.

Commit `feat(accounting): surface quote payments in scoring, credit, and receivables`.

---

# PHASE 3 — Close the over-allocation gap

A previous session flagged this and correctly did not fix it unilaterally:
**allocation limits are enforced only client-side.** There is no database
constraint preventing a receipt from being allocated beyond its own amount, or
beyond a quote's remaining balance.

Anything that reaches the table another way — a direct RPC call, a future
import, a bug — could over-allocate money silently.

## 3.1 Add server-side enforcement
Add a database-level guard that rejects:
- total allocations for a receipt exceeding that receipt's amount
- an allocation exceeding the target quote's remaining balance

A CHECK constraint cannot express either, since both need to look at other
rows. A trigger is the realistic mechanism. Design it so concurrent inserts
cannot both pass — think about what happens when two allocations for the same
receipt are inserted at the same moment, and say in your report how you handled
it.

## 3.2 Do not break the existing form
The client-side validation stays. This is defense in depth, not a replacement.
Verify the form still works normally for valid allocations — a guard that
rejects legitimate work is worse than no guard.

## 3.3 Verify
- a valid allocation succeeds
- an allocation exceeding the receipt amount is rejected
- an allocation exceeding the quote's remaining balance is rejected
- two partial allocations summing to exactly the remaining balance both succeed
- the error messages are comprehensible, not raw constraint names

Commit `fix(accounting): enforce allocation limits at the database level`.

---

# PHASE 4 — Payment chain end to end

Rebuild the LAN container, restart `afrakala-lan-rest`, poll until 200.

Run the complete chain against quote `4850549b` (salesperson `56014064`,
customer `d05bbd0b`, final 100100000), external party `e9b29dd2` for the
receiver path:
1. create a receipt
2. allocate it against the quote
3. approve it
4. confirm exactly one balanced journal entry
5. confirm `available_credit` rose and one credit-ledger row was written
6. confirm the quote's remaining balance dropped
7. confirm it appears correctly in receivables
8. confirm the salesperson's score rose via the collected component

Report real numbers at each step. Then delete the test data, restore
`available_credit`, recompute scores, and prove with before/after row counts
that the system is back to its starting state.

Smoke test with a bogus 404 control: `/accounting/receipts/create`,
`/sales/quotes`, `/accounting/receipts`, `/gamification/admin/manual-metrics`,
`/this-route-does-not-exist-xyz`.

**This is the most valuable stopping point in this document.** The payment
chain would be complete and verified. If the budget is low, stop here.

---

# PHASE 5 — Small cleanups

Three cheap items that have been deferred repeatedly.

## 5.1 Hide the dead invoices menu entry
`invoices`, `invoice_items`, and `/sales/invoices` are a dead parallel design.
The Persian menu still shows an "invoices" entry that is permanently empty.

Hide it from navigation. Keep the route reachable by direct URL and keep its
guard unchanged — hiding a menu item is not a security measure.

**First check whether `waybills` depends on `invoices` and whether waybills are
actually used.** If they are, report the conflict and leave the menu entry in
place. Do not break a working feature to tidy a menu.

## 5.2 Payments and receipts training page
There is no in-app guide for the payments area. The pattern exists:
`src/components/customers/CustomerCreditGuide.tsx` at
`/sales/customers/credit-training`. Copy it — same components, same visual
language.

Content in natural Persian, for an accountant, not a developer:
- the four receipt types and when each applies; only the first requires
  selecting a pre-invoice
- allocating against pre-invoices: the sum cannot exceed the receipt amount,
  and each allocation cannot exceed that pre-invoice's remaining balance
- the pre-submit warning dialog: what standard and medium warnings mean
- attaching receipt images: what OCR fills in automatically and what must still
  be checked by hand
- common mistakes: choosing pre-invoice payment without selecting one; a
  receipt entered for the wrong customer; a receipt date that is not today

Add it to navigation next to the credit-training entry, with a matching guard.

## 5.3 Report the four kept dead modules
`customer-credit-snapshot.ts`, `PenaltyBadge.tsx`, `PriceChangeIndicator.tsx`,
`RateTypeBadge.tsx` were kept because their fate was unclear. Do not act on
them. In the Phase 9 report, give the user a one-line recommendation for each so
the decision becomes easy.

Commit `feat(accounting): add payments training page` plus a separate commit for
the menu change.

---

# PHASE 6 — Wire up Ollama

## 6.1 Configuration
Add to `deploy/lan/.env.lan`:
```
OLLAMA_API_URL=http://192.168.170.8:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3
OLLAMA_VISION_MODEL=qwen3.6
```
Use whatever variable names the existing code already reads where they overlap —
check `src/routes/api/messenger/ai-chat.ts` first rather than inventing names.

Rebuild the container and confirm the app reaches Ollama from inside it.

## 6.2 Prove each capability before building on it
Do not assume. Call Ollama and verify:
- **chat**: `qwen2.5:7b` answers a Persian question in Persian, coherently
- **embeddings**: `bge-m3` returns a vector — report its actual length
- **vision**: `qwen3.6` reads a Persian bank receipt image. Use a real receipt
  image if one exists; otherwise report vision as **untested** rather than
  claiming it works

Report each honestly. If Persian vision is poor, say so plainly — that finding
decides whether receipt OCR can move to Ollama at all, and a false "it works"
would cost real accuracy on financial data.

Commit `chore(ai): configure Ollama provider`.

---

# PHASE 7 — Shared AI client and key management

No shared client exists. Five files each hardcode `ai.gateway.lovable.dev` with
their own fetch, model name, and error handling.

## 7.1 The client
Expose **chat, embeddings, and vision** as distinct capabilities — not every
provider or model serves all three, and conflating them is how a vision call
ends up at a text model.

- **Provider order:** Ollama first when configured and reachable; the keyed
  provider otherwise.
- **Fall back only on unavailability** — connection failure, timeout, 5xx.
  Never fall back because an answer seemed poor: that means paying twice and
  getting two different answers to one question.
- **Distinguish 429 from 402.** Rate-limited means retry shortly; credit
  exhausted means the account needs topping up. Different Persian messages.
- Record provider health where an admin can see it: which provider served the
  last call, when it last failed, and why.
- With no provider available, every caller degrades gracefully. Nothing throws.

## 7.2 Key storage
An admin must enter a provider key through the UI.

`bot_api_keys` hashes its secrets because it only verifies them. A provider key
must be **decryptable** to be sent outbound, so that pattern cannot be reused.
`pgcrypto` is installed but unused. `shop_settings` is plaintext.

Decide where the encryption key lives based on what this deployment actually
supports, and report the trade-off honestly. Do not invent infrastructure that
is not there.

The key must never appear in logs, error messages, or API responses. Show only
a short prefix.

## 7.3 Admin page
Admin-only, at `_app.admin.settings.tsx` unless a better fit exists — confirm
before choosing. Add, edit, remove a provider; show each provider's status
(working / error / credit exhausted); show which capabilities each serves; offer
a connection test.

## 7.4 Model discovery — honestly
Ollama's `/api/tags` reports `capabilities` per model; you have seen it working.
Use it.

**Pricing is not discoverable programmatically** from any provider here, so
"pick a cheap model" cannot be automatic in the strict sense. Do the honest
version: a curated preference list per provider with admin override. Do not
fabricate a pricing lookup.

## 7.5 Do not migrate the call sites yet
Build the client and prove it in isolation.

Commit `feat(ai): add shared provider client and admin key management`.

---

# PHASE 8 — Migrate call sites, then build RAG

## 8.1 Migrate, one at a time, verifying each
```
src/routes/api/messenger/ai-chat.ts             chat
src/lib/messenger/embeddings.functions.ts       embeddings
src/lib/receipt-ocr.functions.ts                vision
src/lib/ai-tools/purchase-advisor.functions.ts  chat
src/lib/ai-tools/ad-copy.functions.ts           chat
```

**Receipt OCR carries a safety property that must survive:** its output is a
suggestion a human reviews — it must never write to a financial record
unreviewed. Verify this still holds.

If Phase 6.2 showed Persian vision is weak on `qwen3.6`, keep receipt OCR on the
keyed provider and report that decision. Accuracy on financial data matters more
than using the local model.

Commit each migration separately so a regression is traceable.

## 8.2 Knowledge RAG
`knowledge_documents` has 0 rows. Build the pipeline so it activates when the
user writes documents. Report plainly that it indexes nothing until then — do
not present an empty index as a working feature.

**Reuse, do not reinvent:**
- `search_messenger_messages_semantic` is the retrieval template: SECURITY
  DEFINER, cosine `<=>`, access gate inside the WHERE, hard cap
  `LEAST(p_limit, 50)`.
- `message_embeddings` is the table and RLS shape.
- `kd_role_can_view(uid(), access_level)` is the existing access function. The
  chunk table's RLS must join to its parent document and reuse it — otherwise a
  finance-only document's chunks leak to a salesperson.

**The dimension is a known fact, not a risk:** `bge-m3` produces **1024**
dimensions. `message_embeddings` is `vector(1536)` because it uses a different
model. **Do not copy 1536.** Use the dimension you verified in Phase 6.2.

pgvector fixes the dimension per column, so a model change later means a new
column and a full re-index. Store the **model name and dimension alongside each
chunk** so a mismatch is detectable rather than silently wrong, and document the
re-index path.

Build: a Persian-aware chunking utility (must handle ZWNJ and not split
mid-word — none exists); a reindex action with a button in `/knowledge/manage`
for admin and manager; skip documents whose text is corrupted (runs of `?`) and
report the count; an ask endpoint following the auth pattern in `ai-chat.ts`;
and the question box **inside `/knowledge` itself**, not a separate route. The
existing plain-text title search must keep working.

**Answer rules:** Persian only. Grounded strictly in retrieved chunks. Sources
shown with links. Exactly «در اسناد موجود پاسخی پیدا نکردم.» when the context
lacks the answer. Never guess — a confident wrong answer is worse than "I don't
know."

**Verify:** create one test document, reindex, ask a question answerable from
it, confirm the answer cites it. Ask an unrelated question and confirm the
not-found message. Confirm a restricted document does not surface to a role that
cannot view it. Then delete the test document and reindex.

Commit `feat(knowledge): add document-grounded AI question answering`.

---

# PHASE 9 — Full coverage audit and final validation

## 9.1 Backend → frontend
Every table, view, and function in schema `public`, classified as:
- **WIRED** — referenced in `src/` and reachable via a menu route
- **UNREACHABLE** — referenced but no menu entry exposes it
- **ORPHAN** — nothing in `src/` references it

Separate genuine orphans from objects that are internal by design (helpers
called by other functions, trigger functions, audit plumbing). Do not report
internal helpers as problems.

## 9.2 Frontend → backend
UI promising what the backend cannot deliver: routes querying missing tables or
RPCs, empty or TODO handlers, features whose backing table has zero rows with no
writer, forms that submit nowhere.

For each: file, route, and **the Persian menu path** — module, then menu item,
then page. The user must be able to navigate there and look.

## 9.3 Fix only what is cheap and safe
A missing navigation entry for a route that already exists with a correct guard.
Everything needing new UI, new schema, or a business decision goes in the report.

## 9.4 Deliverable
Write `docs/backend-frontend-coverage.md` in **Persian** — the user reads this
one. For every gap: what it is, where it lives, the Persian menu path, what is
missing. Sort by impact. Include a plain-language section on the two parallel
pre-invoice designs and which is live.

## 9.5 Final validation
`npm run typecheck` (70 baseline), `npm run lint`, `npm run build`. Rebuild the
container, restart `afrakala-lan-rest`, smoke test with a 404 control. Confirm
no PostgREST schema-cache errors in logs. Confirm the served `APP_GIT_SHA`
matches the final commit.

Commit `docs(audit): backend/frontend coverage map`.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / DEFERRED / STOPPED, with commit SHAs and push status
2. Phase 2: which function you edited for collected and why; before/after for
   score, credit, and receivables
3. Phase 3: the mechanism you chose, how you handled concurrent inserts, and the
   five verification results
4. **Phase 4: the eight end-to-end results with real numbers, and proof the test
   data was removed**
5. Phase 5: whether waybills forced you to keep the invoices menu; the training
   route; your one-line recommendation for each of the four kept dead modules
6. Phase 6.2: **the honest result of each capability probe** — especially
   whether Persian vision works on `qwen3.6`, and the real embedding dimension
7. Phase 7: the client's shape; the key storage decision and where the
   encryption key lives; the admin route
8. Phase 8: which call sites migrated; whether receipt OCR stayed on the keyed
   provider; chunk size, overlap, and dimension used
9. **Phase 9: the full coverage map** — every ORPHAN and UNREACHABLE item
10. Typecheck / lint / build / smoke against the 70 baseline
11. Anything you decided on your own that needs review
12. **What still requires a human**, with the Persian menu path for each.
    Include at minimum: re-entering the ~460 corrupted config values; the
    Persian error strings inside the two accounting functions; entering
    salesperson scores at `/users/$userId`; writing knowledge documents; the
    bank→accounting-code mapping decision; and the four kept dead modules.

## START NOW
Begin at Phase 2.