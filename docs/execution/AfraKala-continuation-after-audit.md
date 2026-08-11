# AfraKala — Continuation after the Phase 1 corruption audit

Resume the work from `docs/docs/research/AfraKala-data-gamification-rag.md`.
Phase 1 is complete and its findings are accepted. This document **replaces**
Phases 2, 3, and 4 of that file. Where the two conflict, this one wins.

Run unattended from Phase A to Phase E. Never ask for confirmation.

---

## 0. RULES (unchanged from the original, restated)

Environment, DB access as `supabase_admin` with `PGPASSWORD` from the container
env, English-only terminal output, one commit per phase staging only that
phase's files, push to `origin/feature/navigation-modernization`, never
`git add -A`, never `git reset --hard` / `git clean -fd` / `git push --force`.

Failure classes: DB/permission errors and unauthorized deletion → STOP. New
typecheck/lint/build errors you caused → repair up to 3 attempts, then revert
your own edits and mark DEFERRED. The ~70 baseline typecheck errors → record
and continue.

Migration 142 (weight validity) is not yours. Do not touch it.
Navigation modernization is not yours — it runs separately in Codex.

**Accepted Phase 1 conclusions — do not re-derive:**
- Corruption is unrecoverable; never guess, transliterate, or reconstruct text.
- Root cause: ANSI/OEM codepage transcode in a Windows console pipe before the
  bytes reached Postgres. Clustered 2026-07-11 16:56–19:39, plus an earlier
  2026-05-24 run for `product_suppliers`.
- `server_encoding` and `client_encoding` are both UTF8; the database is not at
  fault.
- Core business data is intact: `products.name` 354/354, `customers.name` 6/6,
  `dynamic_scoring_parameters.label_fa` 16/16.
- Receipt warning dialog strings are DATA (`validation_rules.message`), not
  source code. Nothing in `src/` needs repair.

---

# PHASE A — RESOLVE THE TWO BLOCKERS (evidence, not guesswork)

## A.1 Where are the QA products?
You correctly found zero matches in `afrakala`. Before concluding they never
existed, check the other databases on the same server. A stale `postgres`
database holding an older copy of this data is known to exist.

```sql
SELECT datname FROM pg_database WHERE datistemplate = false;
```
For every non-`afrakala` database that has a `public.products` table, report:
total product count, max SKU, and the count matching
`sku LIKE 'AFK-2026-004%'` or `name LIKE 'QA-%'`.

Report findings only. **Do not delete anything in any database.** If the QA
products are found in a stale database, that database is a separate cleanup
decision for the user — say so and move on.

## A.2 Are the 42 knowledge documents seed data or real?
Use the creation window as the discriminator, since Phase 1 established that
corruption clusters in one seeding run.

For all 42 rows in `knowledge_documents`, report: `id`, `created_at`,
`created_by`, `is_published`, `category`, version number, and whether
`created_at` falls inside 2026-07-11 16:56–19:39.

Then classify:
- **All 42 inside the corruption window** → they came from the bad seeding run.
  They are disposable. Back them up to
  `public.knowledge_documents_backup_20260722`, verify the count, delete them,
  and report. This authorization covers exactly the rows you prove fall inside
  that window — no more.
- **Any row outside the window** → that row is real content a human wrote.
  Leave it, and list it separately for manual re-entry.
- **Ambiguous timestamps** → leave them and report.

Also report whether any row is referenced by another table before deleting.

Commit `fix(data): remove corrupted seeded knowledge documents` if anything was
deleted; otherwise commit only the progress doc. Continue.

---

# PHASE B — GAMIFICATION WIRING

Unchanged from Phase 3 of the original document. Execute it exactly as written
there, including:
- the business rule: automatic invoice data is authoritative for
  `sales_amount` and `profit_amount`; manual entry is backfill-only for dates
  with no automatic data; calls and talk-minutes are manual-only and additive
- adding `accountant` to the select/insert/update RLS policies, delete stays
  admin-only
- the mandatory `pg_get_functiondef` gate before editing
  `calculate_employee_score` — your earlier audit says the structure matches,
  so this should pass
- the three before/after verification tests, including the one proving
  sales/profit do not double-count

**One addition:** `gamification_kpis.label_fa` and `.description` are 12/12
corrupted. The wiring will work, but leaderboard KPI labels will render as
`?????` until they are re-entered. Include these 12 rows in the Phase C
worksheet. Do not attempt to invent labels.

Commit `feat(gamification): wire manual daily metrics with automatic-source precedence`.
Continue.

---

# PHASE C — RE-ENTRY WORKSHEET FOR CORRUPTED CONFIG

~460 corrupted values are real configuration a human must retype. Your job is
to make that as cheap as possible, not to guess the content.

## C.1 Priority tiers
Split the inventory into three tiers by operational impact:

**Tier 1 — small and user-visible (fix first).** Roughly 30 values:
`validation_rules` (5), `payment_terms` (3), `invoice_workflow_stages` (4),
`price_change_reasons` (6), `gamification_kpis` (12). These appear in daily
workflows and each table is tiny.

**Tier 2 — bulk, lower urgency:** `daily_mood_questions` (93),
`dynamic_table_columns.label` (35), `product_suppliers.notes` (22).

**Tier 3 — largest, assess separately:** `dynamic_table_cells.value_text` (266).

Adjust the tiers if your inventory shows something more urgent; explain any
change.

## C.2 Produce the worksheet
Write `docs/corrupted-config-reentry.md` **in Persian** (the user reads it).
For every Tier 1 and Tier 2 row, one entry containing:
- table and primary key
- the column(s) that are corrupted
- **every intact sibling column** — especially any English code, slug, key, or
  enum value, and any numeric or boolean setting. These are the strongest clue
  to what the Persian text should say.
- where the value appears in the UI: grep `src/` for the table name and report
  the file and line that renders it
- an empty field for the user to write the correct Persian text

Sort by tier, then by table. Make it something the user can work through in one
sitting.

## C.3 Provide the safe update path
At the end of the worksheet, give the exact command for applying corrected
values **without repeating the original mistake**. Emphasize: write the SQL to
a UTF-8 file and apply it with `-f`, or set the console to UTF-8 first. Never
pipe Persian text through a default Windows console.

Include a tested example of both the safe and the unsafe form so the difference
is unmistakable.

Commit `docs(data): add corrupted config re-entry worksheet`. Continue.

---

# PHASE D — PREVENTION

Write `docs/persian-data-safety.md` in Persian. Short and practical:
- what happened, in one paragraph
- the exact console setup that prevents it (`chcp 65001`,
  `[Console]::OutputEncoding` and `$OutputEncoding` set to UTF8)
- why `-f file.sql` is safer than piping
- a one-line verification query the user can run after any bulk insert to
  confirm no `?` corruption entered:
  a count of rows in the affected table where the text contains three or more
  consecutive `?`
- a note that `pg_dump` redirected with `>` in PowerShell defaults to UTF-16
  and must use `-f` instead

Also check whether any script under the repo (`.ps1`, `.sh`, `deploy/`,
`supabase/`) still uses an unsafe pipe pattern for Persian content. Report what
you find; fix only obvious script-level issues, and only if the fix is
self-evident.

Commit `docs(data): add Persian data safety guide`. Continue.

---

# PHASE E — KNOWLEDGE RAG (conditional)

## E.1 Decide whether to build now
Count the knowledge documents that survive Phase A and are not corrupted.

- **Zero clean documents** → do NOT build the RAG feature. Building a retrieval
  system over an empty corpus produces a feature that can only ever answer
  "not found." Record it as BLOCKED, explain that it resumes once the user has
  entered real documents, and skip to the final report.
- **At least one clean document** → build it per Phase 4 of the original
  document, with the mandatory exclusion of corrupted documents still in force.

State your decision and the document count that drove it.

## E.2 If building
Follow the original Phase 4 exactly: AI question box inside `/knowledge` itself
(not a separate route), pgvector, `knowledge_document_chunks` with the
embedding dimension read from the existing `message_embeddings` setup,
`search_knowledge_chunks` RPC, chunking utility, `rebuildKnowledgeEmbeddings`
with a button in `/knowledge/manage`, the ask endpoint following the existing
Ollama patterns, Persian-only answers, the exact not-found message
«در اسناد موجود پاسخی پیدا نکردم.», source attribution, and graceful
degradation if pgvector or an embedding model is unavailable.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / STOPPED / SKIPPED / BLOCKED, with commit SHAs and push
   status
2. **Phase A.1**: databases found, where the QA products actually live (or
   confirmation they exist nowhere on this server)
3. **Phase A.2**: the creation-window analysis, how many documents were deleted
   and how many were preserved, and why
4. **Phase B**: the three before/after verification results, the permission
   change, and confirmation that sales/profit do not double-count
5. **Phase C**: tier counts, worksheet path, how many rows have a usable
   English sibling key to guide re-entry
6. **Phase D**: any unsafe script patterns found in the repo
7. **Phase E**: build or blocked, with the clean-document count that decided it
8. Typecheck / lint / build vs baseline
9. Anything you decided on your own that needs review
10. **What still requires a human:**
    - the precise list of corrupted values needing re-entry, by tier
    - `dynamic_entity_scores` still has zero salesperson rows
    - whether the stale database (if found) should be dropped

## START NOW
Begin at Phase A.1.