# AfraKala — Data integrity, gamification wiring, and knowledge RAG
## Autonomous Claude Code prompt — 4 phases

Run unattended from Phase 1 to Phase 4. Never ask for confirmation. Stop only
for the hard stop conditions in 0.5.

---

## 0. GLOBAL RULES

### 0.1 Environment (verified — do not re-derive)
```
Repo            : D:\AfraKalaTest\app
Branch          : feature/navigation-modernization
DB container    : afrakala-lan-db
PostgREST       : afrakala-lan-rest
Database        : afrakala
Frontend        : container afrakala-lan-web, built from D:\AfraKalaTest\app\deploy\lan
                  docker compose --env-file .env.lan build web
                  docker compose --env-file .env.lan up -d web
LAN URL         : http://192.168.170.8:3100
npm scripts     : dev, build, build:dev, preview, lint, typecheck, format
Typecheck base  : ~70 pre-existing errors — BASELINE, not yours
AI backend      : Ollama, existing endpoint src/routes/api/messenger/ai-chat.ts
```

### 0.2 Database access — CRITICAL
Connect as `supabase_admin`; the `postgres` role lacks CREATE on schema public.
```powershell
docker exec -i -e PGPASSWORD=<from container env> afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala
```
Never print the credential. Never use `psql -c` with multiline or nested quotes.

### 0.3 Output rules
Print ALL terminal output in **English only**. No Persian/Arabic characters —
this terminal reverses RTL text when copied. Persian IS allowed inside files
you write. Keep paths, SQL, identifiers, SHAs verbatim.

### 0.4 Execution engine
After each phase: validate → self-repair → update
`docs/data-and-rag-progress.md` → commit (stage only that phase's files, never
`git add -A`) → push to `origin/feature/navigation-modernization` → continue
automatically.

Failure classification:
- **STOP**: DB/permission errors, destructive change not explicitly authorized,
  business rule ambiguity not covered here, production contact.
- **REPAIR (max 3 attempts)**: new TypeScript/ESLint/build failures you caused.
  After 3, revert only your own edits, mark DEFERRED, continue.
- **RECORD & CONTINUE**: the ~70 baseline typecheck errors.

Acceptance: zero NEW errors versus baseline. Never claim validation passed when
it did not.

### 0.5 Hard stop conditions
1. Any DB or permission error.
2. A phase would require deleting data not explicitly authorized here.
3. Live `calculate_employee_score` differs structurally from what Phase 3
   assumes.
4. pgvector cannot be enabled, or no embedding model is configured (Phase 4
   then degrades gracefully — see 4.9 — rather than stopping).
5. Context budget nearly exhausted: finish the current phase cleanly, commit,
   push, write "RESUME AT PHASE N" into the progress doc, stop. That is
   success, not failure.

### 0.6 Out of scope
- Navigation modernization (separate task, runs in Codex).
- The weight-validity fix (migration 142) — if in flight, do not touch it.
- Do not change route guards, permissions, or roles except where Phase 3
  explicitly requires it.
- Never `git reset --hard`, `git clean -fd`, `git push --force`.

---

# PHASE 1 — ENCODING CORRUPTION AUDIT (read-only)

## Context
Persian text in several tables was destroyed at insert time and now stores
literal `?` characters. Confirmed visually in the browser (UI chrome renders
Persian correctly on the same page, so this is data, not display):
- `/knowledge` — all ~14 document titles render as `??????????`
- Sales price lists — 20 products with `QA-` prefix, SKU `AFK-2026-00402`
  through `AFK-2026-00421`
- The receipt-form pre-submit warning dialog shows two `?????` lines, meaning
  at least one more table is affected

**Critical: this is NOT repairable.** Once a character became `?`, the original
byte sequence is gone. Do not attempt transliteration, guessing, or "recovery."
Your job is to measure the blast radius and find the root cause so it stops
happening.

## Tasks
**1.1** Enumerate every text/varchar column in schema `public` and count rows
where the value contains `?` in a pattern suggesting corruption (three or more
consecutive `?`, or `?` adjacent to Persian characters). Report table, column,
corrupted row count, total row count.

**1.2** For each affected table, sample up to 5 corrupted rows showing primary
key, `created_at`, and `created_by` if present.

**1.3** Determine the root cause. Check:
- `SHOW server_encoding;` and `SHOW client_encoding;`
- whether affected rows cluster around a single `created_at` window or actor
- whether `supabase/seed-data.sql` or any file under `docs/qa/` or
  `supabase/migrations/` contains `?` in place of Persian text (that would
  prove corruption happened before the DB, in the source file)
- git history for when those seed files were added

Report the most likely cause with evidence.

**1.4** For the warning-dialog strings specifically: locate where the receipt
pre-submit warning text comes from (a table, or hardcoded in
`src/shared/components/PaymentReceiptForm.tsx`). If it is data, include it in
the inventory. If it is source code, report the file and line — source code
corruption is repairable and should be flagged as such.

**1.5** Classify every corrupted row into one of three buckets and report
counts:
- **TEST DATA** — safe to delete (QA products, seeded demo documents)
- **REAL DATA** — must be re-entered by a human, never deleted
- **UNCERTAIN** — needs the user to decide

Do not delete anything in Phase 1. Report only.

Commit the progress doc. Continue.

---

# PHASE 2 — QA TEST PRODUCT CLEANUP

## 2.1 Dependency report (before any change)
For the 20 products with `QA-` prefix / SKU `AFK-2026-00402`..`00421`, report
whether each is referenced by:
- computed prices (`product_computed_prices_public` and its source tables)
- sale price list rows
- invoices / invoice line items
- product interaction events
- responsible-person assignments
- labels, attributes, supplier links, stock alerts
- any other foreign key referencing `products`

Produce a table: product SKU, and a count per referencing table.

## 2.2 Decide per product, using this rule
- **Zero references anywhere** → safe to DELETE.
- **Referenced only by derived/cache data** (computed prices, interaction
  events) → DELETE the product and let cascades clean up, but report which
  cascades will fire before doing it.
- **Referenced by any business document** (invoice, sale price list, quote) →
  do NOT delete. Set the product inactive so it disappears from sales views,
  and report it.

## 2.3 Backup first
```sql
CREATE TABLE IF NOT EXISTS public.products_backup_qa_20260722 AS
  SELECT * FROM public.products WHERE sku LIKE 'AFK-2026-004%';
```
Verify count = 20. If not, STOP.

## 2.4 Execute
Write a migration
`supabase/migrations/<YYYYMMDDHHMMSS>_143_remove_qa_test_products.sql`
containing the backup command and rollback SQL in a header comment, then the
deletes/deactivations decided in 2.2. Apply it.

## 2.5 Verify
- Confirm no `QA-` product appears in the sales search RPC result for an admin
  role.
- Confirm no `QA-` product appears in any active sale price list.
- Confirm no foreign key violation occurred.
- Report the final count of remaining `QA-` products and why each remains.

## 2.6 Corrupted knowledge documents
The ~14 `/knowledge` documents whose titles are `??????` are seeded test data
with unrecoverable content. Apply the same treatment: back them up to
`public.knowledge_documents_backup_20260722`, then delete them, and report the
count. If Phase 1.5 classified any of them as REAL or UNCERTAIN, leave those
alone and report them for the user to re-enter.

Commit `fix(data): remove corrupted QA test products and seeded documents`.
Continue.

---

# PHASE 3 — GAMIFICATION WIRING

## 3.1 The business rule (decided by the user — implement exactly this)

> Salesperson sales must be recorded **automatically by the system**, never
> manually. Manual entry exists **only** so an accountant can backfill **past
> dates**.

This resolves the double-counting risk. Concretely:

| Metric | Authoritative source | Manual entry role |
|---|---|---|
| `sales_amount` | automatic, from `invoices` | backfill only — used ONLY for a date where no automatic data exists |
| `profit_amount` | automatic, from `invoices` | backfill only — same rule |
| `inbound_calls` | none (no phone integration) | manual is the only source |
| `outbound_calls` | none | manual is the only source |
| `talk_minutes` | none | manual is the only source |

**Precedence rule:** for a given (employee, date), if automatic invoice data
exists for that date, the automatic value wins and the manual sales/profit
value is IGNORED — never summed. Calls and talk minutes are always additive
because they have no automatic source.

## 3.2 Permission change
Manual entry must be available to the **accountant** role, since backfilling
past sales is an accounting task. Currently the four RLS policies
(`sdpm_select_privileged`, `sdpm_insert_privileged`, `sdpm_update_privileged`,
`sdpm_delete_admin`) grant admin/manager.

Add `accountant` to select/insert/update. Leave delete as admin-only. Follow
the project's existing RBAC helper pattern — do not hand-roll a role check.

## 3.3 Past-dates rule
The current implementation allows today plus 5 days back. Given the rule above,
report whether the form should exclude **today** for sales/profit (since
today's sales should come from the system). Implement the safest reading:
keep the existing 5-day window for calls/talk-minutes, and add a clear UI note
that sales and profit entered for a date with automatic data will not be
counted. Do NOT silently change the window without saying so in the report.

## 3.4 Read the live function first — mandatory
```sql
SELECT pg_get_functiondef('public.calculate_employee_score'::regproc);
```
Known sources today: `call_logs` (x4), `invoices` (x3), `payment_receipts` +
`payment_receipt_links`, `gamification_kpis`, `customers`. It writes to
`employee_scores`.

If the live body differs structurally from this description, **STOP and
report**. Never rewrite this function from guesswork — it drives the entire
leaderboard and a silent error corrupts everyone's score.

## 3.5 Implement
Write `supabase/migrations/<YYYYMMDDHHMMSS>_144_wire_manual_daily_metrics.sql`:
- header comment with backup of the current function definition and rollback SQL
- `CREATE OR REPLACE FUNCTION public.calculate_employee_score(...)` copied
  verbatim from the live definition, with the **minimum** edit needed to apply
  3.1:
  - add `manual_daily_metrics_totals()` (or a direct read of
    `staff_daily_performance_metrics`) as an additional source
  - calls and talk minutes: add to the existing totals
  - sales and profit: include the manual value only for dates with no
    automatic invoice data for that employee
- the RLS policy change from 3.2

Keep the edit additive. Do not restructure the function.

## 3.6 Verify with before/after on a real employee
Pick one employee with existing data. Record their `employee_scores` row
before. Apply. Recompute. Report before vs after for every metric.

Then insert one manual record for a **past** date with no invoice activity,
recompute, and show the delta — this proves the backfill path works.

Then insert one manual record for a date that **does** have invoice activity,
recompute, and show that sales/profit did **not** double — this proves the
precedence rule works.

If either test fails, STOP and report.

## 3.7 Frontend
Update `src/routes/_app.gamification.admin.manual-metrics.tsx`:
- allow accountant access consistent with 3.2
- add the UI note from 3.3
- keep everything else unchanged

Run typecheck, lint, build. Commit
`feat(gamification): wire manual daily metrics with automatic-source precedence`.
Continue.

---

# PHASE 4 — KNOWLEDGE RAG (item 132.3)

## 4.1 Placement — important spec
The AI question box must live **inside the existing knowledge section**, not on
a separate page. Add it to `/knowledge` itself (the page with the
"organizational knowledge" header and the existing title search). Do **not**
create a separate `/knowledge/ask` route.

Keep the existing plain-text title search working. The AI box is an addition,
clearly labelled, positioned near the existing search.

## 4.2 Exclude corrupted documents — mandatory
After Phase 2, any remaining document whose title or content is corrupted must
be **excluded from the embedding index**. Indexing `?????` produces meaningless
vectors and pollutes every answer. Report how many documents were excluded and
why.

## 4.3 Database
`supabase/migrations/<YYYYMMDDHHMMSS>_145_knowledge_rag.sql`:
- `create extension if not exists vector;` if absent
- table `knowledge_document_chunks`: `id uuid primary key default
  gen_random_uuid()`, `document_id uuid not null references
  knowledge_documents(id) on delete cascade`, `chunk_index integer not null`,
  `content text not null`, `embedding vector(<dim>) null`, `created_at
  timestamptz default now()`, `updated_at timestamptz default now()`
- **Determine `<dim>` from the actual embedding model in use** — inspect the
  existing `message_embeddings` table and the Ollama config. Do not assume 1536.
- vector index copying the exact pattern (index type and distance operator) used
  by `message_embeddings`
- RPC `search_knowledge_chunks(p_query_embedding vector, p_limit int default 6)`
  returning `chunk_id`, `document_id`, `title`, `category`, `content`,
  `similarity`
- RLS: normal users see only `is_published = true`; admin/manager see all;
  honor `access_level` if that concept exists in this schema

## 4.4 Chunking utility
`src/lib/knowledge/chunking.ts` — split document content into searchable chunks
with sensible size and overlap. Report the values chosen and why. Must handle
Persian text and ZWNJ correctly.

## 4.5 Index build action
Server function or admin action `rebuildKnowledgeEmbeddings`:
- reads published, non-corrupted documents
- chunks them
- generates embeddings
- upserts into `knowledge_document_chunks`
- reports counts: documents processed, documents skipped (corrupted), chunks
  created

Add a button in `/knowledge/manage` for admin/manager, with loading state and a
result toast.

## 4.6 Ask endpoint
`src/routes/api/knowledge/ask.ts`, following the auth and Ollama patterns
already used in `src/routes/api/messenger/ai-chat.ts`:
- authenticate the user
- accept a question
- embed the question
- retrieve relevant chunks via `search_knowledge_chunks`
- build a prompt that constrains the model to answer **only** from the provided
  context
- if the context does not contain the answer, reply exactly:
  «در اسناد موجود پاسخی پیدا نکردم.»
- answer in Persian only, concise and organizational in tone, never guessing
- return `sources`: `document_id`, `title`, a short matched excerpt, `similarity`

## 4.7 Environment variables
Use the existing Ollama configuration (`OLLAMA_API_URL`, `OLLAMA_MODEL`,
`OLLAMA_API_KEY`) and whatever embedding variable the repo already defines. Do
not call any external service without an env var. Report the complete list of
required variables and which are already set.

## 4.8 UI in /knowledge
- a clearly labelled AI question input with an ask button
- loading state
- the answer rendered in Persian, RTL
- the source documents listed under the answer, each linking to its document
- a clear message when the feature is unavailable (see 4.9)

## 4.9 Graceful degradation — required
If pgvector cannot be enabled, or no embedding model is configured, the feature
must **disable itself cleanly**: the AI box either hides or shows a plain
message, `/knowledge` keeps working exactly as before, and nothing throws. Do
NOT stop the phase for this — implement the degraded path, report it, and
continue.

## 4.10 Verify
- run `rebuildKnowledgeEmbeddings` and report the counts from 4.5
- if at least one clean document exists, ask a question answerable from it and
  show the answer plus sources
- ask an unrelated question and confirm the "not found" response
- confirm `/knowledge` still works with the AI box present
- typecheck, lint, build; zero new errors vs baseline

Rebuild the frontend, restart `afrakala-lan-rest`, smoke test `/knowledge` and
`/knowledge/manage`.

Commit `feat(knowledge): add document-grounded AI question answering`.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / FAILED / DEFERRED, with commit SHAs and push status
2. **Phase 1**: full corruption inventory (table, column, counts), root cause
   with evidence, and the TEST / REAL / UNCERTAIN classification
3. **Phase 2**: dependency table, what was deleted vs deactivated and why,
   backup table names and counts, remaining `QA-` products
4. **Phase 3**: live function structure confirmation, the exact minimal edit
   made, the three before/after verification results from 3.6, the permission
   change, and whether the date window was altered
5. **Phase 4**: embedding dimension found and where, chunk size and overlap,
   documents indexed vs skipped, required env vars and which are missing,
   whether the feature is fully live or running degraded
6. Typecheck / lint / build vs baseline
7. Anything you decided on your own that needs review
8. **Remaining gaps — state plainly, fix nothing:**
   - corrupted REAL data that a human must re-enter, listed precisely
   - `dynamic_entity_scores` still has zero salesperson rows; salespeople score
     0 until values are entered via `/users/$userId`
   - navigation modernization (separate task)

## START NOW
Begin at Phase 1.1. Continue automatically through Phase 4.