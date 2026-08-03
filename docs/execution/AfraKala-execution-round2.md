# AfraKala — Execution round 2
## Codex, 9 phases, unattended

Resume the work from `docs/execution/AfraKala-execution-integrated.md`, which completed
Phases 1–4 and stopped at Phase 5. This document replaces its Phases 5–7 and
adds new work.

Run from Phase 1 to Phase 9 without stopping. The user is not present and will
not answer questions. Stop only for the hard stop conditions in 0.5.

---

## 0. RULES

### 0.1 Environment (verified — do not re-derive)
```
Repo          : D:\AfraKalaTest\app
Branch        : feature/navigation-modernization
Pushed HEAD   : 35216bb0
DB container  : afrakala-lan-db
PostgREST     : afrakala-lan-rest
Database      : afrakala
Frontend      : container afrakala-lan-web, from D:\AfraKalaTest\app\deploy\lan
LAN URL       : http://192.168.170.8:3100
Served image  : APP_GIT_SHA e72df534 (current as of Phase 1 of the last round)
Typecheck baseline: EXACTLY 70 errors in 6 files. Zero new allowed.
```

Verified facts — treat as given, do not re-derive:
- `public.invoices` = 0 rows, never used. `public.sales_quotes` = 5 rows, live.
- `invoices` has `type = 'pre_invoice'` — a second, abandoned pre-invoice
  design. `sales_quotes` is the real one.
- **`sales_quotes` has NO `customer_id`.** It stores only `customer_name` and
  `customer_phone` as free text. `payment_receipts` requires `customer_id`.
  `customers.phone` is NOT unique.
- Quotes list: `src/routes/_app.sales.quotes.index.tsx` → `/sales/quotes`
- Invoices list: `src/routes/_app.sales_.invoices.tsx` → `/sales/invoices`
- Supabase CLI is NOT installed; no type-generation npm script exists.
- `LOVABLE_API_KEY` present. `OLLAMA_API_URL` ABSENT — Ollama is not usable.
- pgvector 0.7.4; `message_embeddings` dim 1536, HNSW cosine;
  `search_messenger_messages_semantic` is the retrieval pattern to copy.
- `knowledge_documents` = 0 rows, has `is_published` and `access_level`
  (`all` / `manager_only` / `finance_only` / `admin_only`).
- `shop_settings` is plaintext key/value — unsuitable for secrets. `pgcrypto`
  installed but unused.

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
that phase's files. Never `git add -A`. Never commit pre-existing untracked
root-level `*.md` files. Push after each phase. Never `git reset --hard`,
`git clean -fd`, or `git push --force`.

### 0.5 Execution engine
After each phase: validate → self-repair → commit → push → continue
automatically.

**STOP** for: any DB or permission error; a required object this prompt asserts
exists being absent; a change that would weaken a route guard or broaden a
permission; **any situation where money could be attached to the wrong
customer**; context budget nearly exhausted — in that case finish the current
phase cleanly, commit, push, write "RESUME AT PHASE N" into
`docs/execution-progress.md`, and stop. That is success, not failure.

**REPAIR (max 3 attempts)** for new typecheck/lint/build errors you introduced.
After 3 failures revert only your own edits, mark DEFERRED, continue.

**RECORD AND CONTINUE** for the 70 baseline errors.

Never claim validation passed when it did not. Never claim a screen was
visually inspected when only an HTTP request was made.

### 0.6 Phase ordering
Phases 1–5 are correctness and cleanup; do them first. Phases 6–9 are new
capability. If context runs short, the earlier phases matter more.

---

# PHASE 1 — Link quotes to customers (unblocks receipt allocation)

## The decision, already made — implement exactly this
`sales_quotes` will get a **nullable** `customer_id`.

Nullable, not required, because a quote may legitimately be issued to a
prospect who is not yet a registered customer. When the quote is for an
existing customer, it links; otherwise it stays null and the free-text name and
phone remain the only record.

Phone-based matching is **rejected** — `customers.phone` is not unique, so
matching could attach money to the wrong customer. Never fall back to it.

## 1.1 Schema
- Add `customer_id uuid NULL REFERENCES public.customers(id)` to
  `public.sales_quotes`.
- Add an index on it.
- Keep `customer_name` and `customer_phone` — they remain the record of what
  was actually written on the quote, and are the only data for prospects.

## 1.2 Backfill — carefully, and never by guessing
Only 5 quotes exist. For each, attempt to find exactly one matching customer.
A match counts **only** when it is unambiguous: exactly one customer row
matches on phone AND that customer's name is consistent.

- Exactly one confident match → set `customer_id`.
- Zero matches, or more than one → leave NULL and report that quote by number.

Print a table of all 5 quotes: quote number, stored name, stored phone,
candidate matches found, and the decision made. Do not backfill anything you
cannot justify from that table.

## 1.3 Capture it going forward — required, not optional
Find the quote creation and edit UI. Update it so that when a customer is
selected from the customer picker, `customer_id` is stored alongside the name
and phone. If the form currently only accepts free text, add customer selection
while keeping free-text entry available for prospects.

**Without this step the problem returns on the very next quote.** If the quote
form's structure makes this genuinely unsafe to change, STOP and report rather
than leaving it half-done.

Commit `feat(sales): link sales quotes to customers`.

---

# PHASE 2 — Allocate receipts against quotes

This is the highest-impact gap. The sales KPI computes
`0.8 × collected + 0.2 × issued`, and collected is permanently 0 because
`payment_receipt_links` only links to `invoices`.

## 2.1 Research gate — answer before writing anything
a) Quote the exact block in `calculate_employee_score` that computes the
   collected amount today.
b) Every database function, view, or trigger referencing
   `payment_receipt_links` — query `pg_get_functiondef` across `public`.
c) In `PaymentReceiptForm.tsx`, quote the allocation logic: how it lists
   selectable records, how it validates the allocation total against the
   receipt amount and against each record's remaining balance, and where it
   inserts link rows.
d) How a quote's remaining balance must be computed. `sales_quotes` has no paid
   or balance column, so it will be `final_amount` minus the sum of allocations
   already linked to that quote. Confirm this is sound, and state how partially
   paid quotes will display.

## 2.2 Implement
- Add `quote_id uuid NULL REFERENCES public.sales_quotes(id)` to
  `payment_receipt_links`, plus an index.
- Make `invoice_id` nullable.
- Add a CHECK that **exactly one** of `invoice_id` / `quote_id` is set. This is
  what prevents double-counting — do not omit it.
- Mirror any unique constraint that exists on the invoice side.
- Update `PaymentReceiptForm.tsx`: when receipt type is `invoice_payment`, list
  **quotes** for the selected customer — status `accepted`, `customer_id`
  matching, remaining balance greater than zero — instead of the dead
  `.from("invoices").eq("type", "pre_invoice")` query.
  Keep every existing validation: allocation total ≤ receipt amount, each
  allocation ≤ that quote's remaining balance, at least one allocation required.
  If the selected customer has no eligible quotes, say so clearly in the UI
  rather than showing an empty list with no explanation.
- Update `calculate_employee_score` so collected reads from quote-linked
  receipts. Make the **minimum** edit — preserve `0.8 × collected + 0.2 × issued`
  exactly. Read the live definition first; if its structure differs from a
  clean KPI CASE block, STOP.

## 2.3 Verify
Create a test receipt allocated against the one accepted quote. Confirm: the
link row has `quote_id` set and `invoice_id` null; the CHECK rejects a row with
both set; over-allocation beyond the quote's remaining balance is rejected;
`calculate_employee_score` now returns a non-zero collected component for that
salesperson; the score rises accordingly.

Show before/after numbers.

Then delete the test receipt and its link, and recompute that employee's score
so `employee_scores` is consistent. A stale score row is worse than none.

Commit `feat(accounting): allow receipts to be allocated against sales quotes`.

---

# PHASE 3 — Retire the dead invoices system

`invoices`, `invoice_items`, and the `/sales/invoices` route are a dead
parallel design. The Persian menu still shows an "invoices" entry
(`factor-ha`) that is permanently empty, which confuses users.

Do **not** drop tables. Removing schema is irreversible and these tables may
hold historical intent. Instead:

3.1 Determine exactly what still references the invoices family: routes, menu
    entries, `payment_receipt_links.invoice_id`, the gamification trigger
    `trg_invoices_recompute_employee_score`, reports, exports, waybills.
    Report the full list.

3.2 Hide the empty invoices menu entry from navigation so users stop opening a
    page that can never have content. Keep the route itself reachable by direct
    URL, and keep its guard unchanged — hiding a menu item is not a security
    measure.

3.3 If `waybills` depends on `invoices` and waybills are actually used, report
    that conflict and leave the menu entry in place instead. Explain the
    reasoning. Do not break a working feature to tidy a menu.

3.4 Document the two parallel designs plainly for the user in the Phase 8
    deliverable.

Commit `chore(sales): hide the unused invoices menu entry`.

---

# PHASE 4 — Supabase types

Regeneration is blocked: no CLI, no npm script. Do not hand-edit `types.ts` —
that is how it drifted in the first place.

4.1 Check whether `npx supabase` can run without a global install, and whether
    it works offline against the local Postgres. Report the result honestly.

4.2 If it works: regenerate, add an npm script so this never has to be
    rediscovered, re-run typecheck, and report the new error count. Verify the
    `v_dynamic_*` views survived.

4.3 If it does not work: do NOT improvise a generator. Report exactly what is
    missing and what the user would need to install. Mark DEFERRED and continue
    to Phase 5.

Commit only if regeneration actually succeeded.

---

# PHASE 5 — Housekeeping

5.1 `src/lib/management/whatsapp-top-products.functions.ts` has been sitting
    modified in the working tree across several sessions with no owner.
    Determine what changed via `git diff`, whether it is referenced anywhere,
    and whether the change is complete or half-finished. Then either commit it
    with an accurate message, or revert it if it is clearly abandoned scratch
    work. Report which you chose and why. Do not leave it dangling again.

5.2 List every other uncommitted change under `src/` or `supabase/` and do the
    same. Leave root-level `*.md` files untouched.

Commit `chore: resolve orphaned working-tree changes`.

---

# PHASE 6 — Payments and receipts training page

There is no in-app guide for the payments area. The pattern already exists:
`src/components/customers/CustomerCreditGuide.tsx`, rendered at
`/sales/customers/credit-training`. Copy that pattern exactly — same
components, same visual language.

Create a training page for the receipts workflow, reachable from the receipt
entry page via a button placed next to the existing primary actions.

Content, in natural Persian, aimed at an accountant — not a developer:

- **The four receipt types and when to use each:** payment against a
  pre-invoice, debt payment, prepayment, standalone positive credit. Explain
  the practical difference: only the first requires selecting a pre-invoice.
- **Allocating against pre-invoices:** how to pick them, the rule that the sum
  of allocations cannot exceed the receipt amount, and that each allocation
  cannot exceed that pre-invoice's remaining balance.
- **The pre-submit warning dialog:** what the standard and medium warnings
  mean, and when it is safe to proceed with accountant confirmation.
- **Attaching receipt images:** what OCR extracts automatically and what must
  still be checked by hand.
- **Common mistakes:** choosing pre-invoice payment when no pre-invoice is
  selected; entering a receipt for the wrong customer; a receipt date that is
  not today.

Add the route to navigation next to the existing credit-training entry, with a
matching permission gate.

Commit `feat(accounting): add payments and receipts training page`.

---

# PHASE 7 — Knowledge base RAG

`knowledge_documents` currently has 0 rows. The user will populate it. Build
the pipeline now so it activates the moment documents exist. Report clearly
that it will index nothing until then — do not present an empty index as a
working feature.

**Engine decision, already made:** Ollama is NOT configured in this
environment. Use the Lovable AI gateway, exactly as
`src/lib/messenger/embeddings.functions.ts` already does. Do not build an
Ollama path that cannot be tested.

7.1 Migration:
- Table `knowledge_document_chunks`: `id`, `document_id uuid NOT NULL
  REFERENCES knowledge_documents(id) ON DELETE CASCADE`, `chunk_index integer
  NOT NULL`, `content text NOT NULL`, `embedding vector(1536) NULL`,
  `created_at`, `updated_at`.
- Vector index copying `message_embeddings` exactly: HNSW,
  `vector_cosine_ops`.
- RPC `search_knowledge_chunks(p_query_embedding vector, p_limit int default 6)`
  returning `chunk_id`, `document_id`, `title`, `category`, `similarity`, and a
  short excerpt. Read `search_messenger_messages_semantic` first and mirror its
  shape and security model.
- RLS mirroring `message_embeddings`, and **enforcing `access_level`** — a
  finance-only document must never surface to a salesperson through search.
  Read how `/knowledge` enforces `access_level` today and match it exactly.

7.2 `src/lib/knowledge/chunking.ts` — split content into searchable chunks.
Must handle Persian text and ZWNJ correctly. Report the size and overlap chosen
and why.

7.3 `rebuildKnowledgeEmbeddings` — chunk published documents, embed them, upsert.
Skip any document whose text is corrupted (containing runs of `?`), and report
how many were skipped. Report documents processed and chunks created.
Add a button in `/knowledge/manage` for admin and manager, with loading state
and a result toast.

7.4 Ask endpoint following the auth pattern in
`src/routes/api/messenger/ai-chat.ts`: authenticate, embed the question,
retrieve chunks, build a prompt constraining the model to answer only from that
context. If the context does not contain the answer, reply exactly
«در اسناد موجود پاسخی پیدا نکردم.» Answer in Persian only, concise and
organizational, never guessing. Return sources: document id, title, a short
excerpt, similarity.

7.5 UI **inside `/knowledge` itself**, not a separate route: a clearly labelled
question input, an ask button, loading state, the answer in Persian RTL, and
the source documents listed beneath with links. The existing plain-text title
search must keep working unchanged.

7.6 Graceful degradation: if `LOVABLE_API_KEY` is missing or the gateway is
unreachable, the AI box hides or shows a plain message, `/knowledge` keeps
working exactly as before, and nothing throws. Handle 429 and 402 the way the
existing AI functions do.

Commit `feat(knowledge): add document-grounded AI question answering`.

---

# PHASE 8 — Complete orphan audit

The earlier attempt answered this at too high a level. Do it exhaustively.

8.1 **Backend → frontend.** Every table, view, and function in schema `public`,
classified as:
- **WIRED** — referenced in `src/` and reachable via a route a user can open
  from the menu
- **UNREACHABLE** — referenced in `src/` but no menu entry exposes it
- **ORPHAN** — nothing in `src/` references it

Separate genuine orphans from objects that are internal by design (helpers
called by other functions, trigger functions, audit plumbing). Do not report
internal helpers as problems.

8.2 **Frontend → backend.** UI promising what the backend cannot deliver:
routes querying missing tables or RPCs, empty or TODO handlers, features whose
backing table has zero rows and no writer, forms that submit nowhere.

For each: file, route, and **the Persian menu path** — module, then menu item,
then page. The user must be able to navigate there and look.

8.3 Fix only what is cheap and safe: a missing navigation entry for a route
that already exists with a correct guard. Everything needing new UI, new
schema, or a business decision goes in the report. State what you fixed and
what you left.

8.4 Write `docs/backend-frontend-coverage.md` in **Persian** — the user reads
this one. For every gap: what it is, where it lives, the Persian menu path, and
what is missing. Sort by impact. Include a plain-language section on the two
parallel pre-invoice designs and which is live.

Commit `docs(audit): backend/frontend coverage map`.

---

# PHASE 9 — Integration and validation

- `npm run typecheck` — report against the current baseline.
- `npm run build` — must pass on Windows without manual flags.
- Rebuild the LAN container, restart `afrakala-lan-rest`, confirm readiness by
  polling until 200.
- Smoke test, with one deliberately bogus route that must return 404 so the
  200s are meaningful:
  `/sales/quotes`, `/accounting/receipts/create`, the new receipts training
  route, `/gamification/admin/manual-metrics`, `/sales/search`, `/knowledge`,
  `/knowledge/manage`, `/this-route-does-not-exist-xyz`
- Confirm no PostgREST "relation does not exist" or schema-cache errors in logs.
- Confirm the served `APP_GIT_SHA` matches the final commit.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / DEFERRED / STOPPED, with commit SHAs and push status
2. **Phase 1: the 5-quote backfill table** — which linked, which stayed null,
   and whether the quote creation form now captures `customer_id`
3. Phase 2: answers to all four research-gate questions; the schema change;
   before/after employee score with collected now non-zero; confirmation the
   test receipt was cleaned up and the score recomputed
4. Phase 3: everything still depending on the invoices family; what you hid;
   whether waybills forced you to leave the menu entry
5. Phase 4: did `npx supabase` work? New typecheck count, or what is missing
6. Phase 5: what you did with the orphaned file and why
7. Phase 6: the training route and where the button was placed
8. Phase 7: chunk size and overlap; documents indexed vs skipped; whether the
   feature is live or waiting for content; required env vars
9. **Phase 8: the full coverage map** — every ORPHAN and UNREACHABLE item
10. Typecheck / build / smoke results
11. Anything you decided on your own that needs review
12. What still requires a human, with the Persian menu path for each

## START NOW
Begin at Phase 1.