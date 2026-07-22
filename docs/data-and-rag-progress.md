# Data integrity, gamification wiring, and knowledge RAG — progress

Task source: `AfraKala-data-gamification-rag.md` (repo root).
Branch: `feature/navigation-modernization`.

| Phase | Status |
|---|---|
| 1 — Encoding corruption audit | **OK** (read-only, complete) |
| 2 — QA test product cleanup | **SUPERSEDED** by Phase A |
| 3 — Gamification wiring | superseded by Phase B |
| 4 — Knowledge RAG | superseded by Phase E |
| A — Resolve the two blockers | **OK** |
| B — Gamification wiring | NOT STARTED |
| C — Re-entry worksheet | NOT STARTED |
| D — Prevention guide | NOT STARTED |
| E — Knowledge RAG | **BLOCKED** — zero clean documents (see A.2) |

**RESUME AT PHASE B.**

---

## PHASE A — Blockers resolved

### A.1 The QA products live in the stale `postgres` database

Three databases exist on this server: `afrakala` (146 MB), `afrakala_test`
(127 MB), `postgres` (134 MB).

| database | products | max SKU | `name LIKE 'QA-%'` |
|---|---|---|---|
| afrakala | 354 | AFK-2026-00359 | 0 |
| afrakala_test | 354 | AFK-2026-00359 | 0 |
| **postgres** | **374** | **AFK-2026-00379** | **20** |

The 20 QA products are in `postgres`, with SKUs **`AFK-2026-00360`..`00379`**,
created **2026-07-19**. The original task document's range
(`AFK-2026-00402`..`00421`) is wrong — no such SKU exists in any database.

Their names are corrupted too (`QA- ????? ??? 1` .. `20`), and the 2026-07-19
creation date is a **third corruption event**, distinct from the 2026-07-11 and
2026-05-24 runs Phase 1 identified.

Nothing was deleted in any database. Whether the stale `postgres` database
should be dropped is a separate decision for the user.

### A.2 All 42 knowledge documents were seeded — deleted

Every one of the 42 rows was: corrupt, `created_by` NULL, `category` `general`,
`version` 1, `is_published` true, and inside the corruption window — in three
batches of 14 (`16:56:58`, `19:30:52`, `19:39:34`). The original document's
"~14 documents" was one batch of the three.

| metric | value |
|---|---|
| total | 42 |
| inside corruption window | 42 |
| outside window | 0 |
| corrupt | 42 |
| with a human author | 0 |

`knowledge_confirmations` is the only table referencing `knowledge_documents`
(ON DELETE CASCADE) and holds **0 rows**, so nothing cascaded.

Migration `20260722235000_143_remove_corrupted_seeded_knowledge_documents.sql`
backed all 42 up to `public.knowledge_documents_backup_20260722`, then deleted
exactly the rows proven both corrupt and inside the window. The migration
aborts if those two sets disagree. Result: **42 deleted, 42 preserved in backup,
0 remaining.**

### E.1 decision, determined by A.2

`knowledge_documents` now holds **0 rows**, therefore **0 clean documents**.
Per E.1, the RAG feature is **BLOCKED** and must not be built: a retrieval
system over an empty corpus can only ever answer "not found". It resumes once
real documents are entered via `/knowledge/manage`.

---

## PHASE 1 — Encoding corruption audit

### 1.1 Inventory

Swept every `text` / `character varying` column of every base table in schema
`public`, counting values with three or more consecutive `?` or a `?` adjacent
to a character in the Persian/Arabic block (U+0600..U+06FF).

**22 tables affected, 706 corrupted values.**

| table | column | corrupted | total |
|---|---|---|---|
| dynamic_table_cells | value_text | 266 | 3729 |
| daily_mood_questions | question_text | 93 | 93 |
| knowledge_documents | content | 42 | 42 |
| knowledge_documents | title | 42 | 42 |
| dynamic_table_columns | label | 35 | 84 |
| product_suppliers | notes | 22 | 31 |
| daily_mood_hafez_poems | interpretation | 21 | 21 |
| daily_mood_hafez_poems | poem_text | 21 | 21 |
| daily_mood_hafez_poems | title | 21 | 21 |
| market_rate_source_mappings | note | 13 | 15 |
| gamification_kpis | description | 12 | 12 |
| gamification_kpis | label_fa | 12 | 12 |
| market_indicators | title_fa | 11 | 11 |
| achievements | description | 10 | 10 |
| achievements | title_fa | 10 | 10 |
| daily_mood_scenarios | title | 10 | 10 |
| gamification_kpi_rules | description | 9 | 10 |
| gamification_kpi_rules | title_fa | 9 | 10 |
| league_settings | title_fa | 6 | 6 |
| market_rate_sources | title_fa | 6 | 6 |
| price_change_reasons | title | 6 | 18 |
| profile_field_definitions | label | 5 | 5 |
| validation_rules | message | 5 | 5 |
| invoice_workflow_stages | title | 4 | 5 |
| missions | description | 4 | 4 |
| missions | title_fa | 4 | 4 |
| payment_terms | name | 3 | 3 |
| dynamic_tables | description | 1 | 4 |
| dynamic_tables | name | 1 | 4 |
| pricing_rules | name | 1 | 11 |
| pricing_rules | rule_name | 1 | 11 |

This is materially wider than the task document assumed. The document named
`/knowledge`, QA products, and "at least one more table"; the real blast radius
spans 22 tables including business configuration.

### 1.2 Samples and clustering

`knowledge_documents`: all 42 rows created `2026-07-11`, `created_by` NULL for
every row (0 distinct actors) — inserted programmatically, not by a user.
Titles follow a numbered sequence ("... 1.", "... 2.", ...), consistent with
generated content rather than authored documents.

`product_suppliers.notes`: 22 corrupted rows, all sharing an identical note
value, created `2026-05-24`.

Creation windows for affected tables:

| table | first seen | last seen | rows |
|---|---|---|---|
| product_suppliers | 2026-05-24 12:49 | 2026-07-13 12:43 | 31 |
| daily_mood_questions | 2026-07-11 16:56 | 2026-07-11 19:39 | 93 |
| gamification_kpis | 2026-07-11 16:56:53 | 2026-07-11 16:56:53 | 12 |
| achievements | 2026-07-11 16:56:54 | 2026-07-11 16:56:54 | 10 |
| missions | 2026-07-11 16:56:54 | 2026-07-11 16:56:54 | 4 |
| knowledge_documents | 2026-07-11 16:56:58 | 2026-07-11 19:39:34 | 42 |
| payment_terms | 2026-07-11 16:57:05 | 2026-07-11 16:57:05 | 3 |

### 1.3 Root cause

Evidence:

- `server_encoding = UTF8`, `client_encoding = UTF8`. The database is not
  misconfigured.
- Persian text elsewhere is **fully intact**: `products.name` 354/354 rows
  contain real Persian, `customers.name` 6/6, `dynamic_scoring_parameters.label_fa`
  16/16. Corruption is not systemic and is not a display problem.
- No file under `supabase/` or `docs/` contains `???` in place of Persian, and
  `supabase/seed-data.sql` does not exist. The corrupted source is therefore
  **not a committed file in this repo**.
- Corruption clusters almost entirely in a single window on 2026-07-11 between
  16:56 and 19:39, across tables written in sequence seconds apart.

**Most likely cause:** a one-off seeding/import run on 2026-07-11 executed
through a channel that transcoded Persian to the ANSI/OEM codepage before the
bytes reached Postgres — the classic Windows console / PowerShell pipe default,
where unmappable characters are replaced with literal `?`. The substitution
happened *upstream* of the database, which is why the server encoding is clean
and every other write is intact.

`product_suppliers.notes` (2026-05-24) predates that window, so at least one
earlier run through the same channel also occurred.

**Not repairable.** Each `?` is a lossy substitution; the original bytes are
gone. Recovery requires re-entering the text.

**Prevention:** any future seeding must pipe UTF-8 end to end — write the SQL to
a file and feed it with `psql -f`, with `PGCLIENTENCODING=UTF8`, rather than
echoing Persian through a console pipe.

### 1.4 Receipt pre-submit warning strings

`src/shared/components/PaymentReceiptForm.tsx:1054` evaluates `validation_rules`
before submit. `public.validation_rules.message` is **5/5 corrupted**.

**This is data, not source code.** A sweep of `src/` for `???` returned
**zero files**, so no source-code corruption exists anywhere in the frontend and
there is nothing repairable in code. The dialog text must be re-entered into
`validation_rules` via `/admin/validation-rules`.

### 1.5 Classification

**TEST DATA — safe to delete: none confirmed.**
The QA products the task document targets do not exist in this database (see
Phase 2 below), and no other affected table is unambiguously disposable.

**REAL DATA — must be re-entered by a human, never deleted (~460 values):**
business and feature configuration whose rows are live and referenced —
`payment_terms` (3), `invoice_workflow_stages` (4), `price_change_reasons` (6),
`validation_rules` (5), `profile_field_definitions` (5), `gamification_kpis`
(24), `gamification_kpi_rules` (18), `achievements` (20), `missions` (8),
`league_settings` (6), `market_indicators` (11), `market_rate_sources` (6),
`market_rate_source_mappings` (13), `pricing_rules` (2), `dynamic_tables` (2),
`dynamic_table_columns` (35), `dynamic_table_cells` (266),
`product_suppliers.notes` (22).

**UNCERTAIN — user must decide (~250 values):**
- `knowledge_documents` (84 values across 42 rows). The task document expected
  ~14 seeded test documents; there are 42, and they are the corpus Phase 4 would
  index. Programmatic creation (`created_by` NULL) points to seed data, but the
  count mismatch means deleting them is not covered by the authorization given.
- `daily_mood_*` (124 values: questions 93, hafez_poems 63 across 21 rows,
  scenarios 10). Seeded feature reference content — deleting it disables the
  feature rather than cleaning up test rows.

---

## PHASE 2 — STOPPED

`2.3` requires the 20 QA products to exist and says to STOP if the count is not
20. **The count is 0.**

- `sku LIKE 'AFK-2026-004%'` → 0 rows
- `name LIKE 'QA-%'` → 0 rows, `name ILIKE '%QA%'` → 0 rows, `sku ILIKE '%QA%'` → 0 rows
- 354 products total; the highest SKU is `AFK-2026-00359`, so the target range
  `AFK-2026-00402`..`00421` sits **above the maximum SKU that exists**

The QA products are either in a different environment or were already removed.
Nothing was backed up, deleted, or deactivated. `2.1`–`2.5` have no subject.

`2.6` (corrupted knowledge documents) is **not executed by the document's own
rule**: it instructs leaving rows classified REAL or UNCERTAIN alone, and Phase
1.5 classifies all 42 as UNCERTAIN because the population is 42, not the ~14 the
authorization describes.

---

## PHASE 3 / PHASE 4 — not started

No work performed. Phase 3's mandatory `3.4` gate is expected to pass: the live
`calculate_employee_score` was read during an earlier audit and matches the
described structure (`call_logs` x4, `invoices` x3, `payment_receipts` +
`payment_receipt_links`, `gamification_kpis`, `customers`; writes to
`employee_scores`). It must be re-read and re-confirmed at execution time.

Note for Phase 3: `gamification_kpis.label_fa`/`description` are 12/12 corrupted,
so leaderboard KPI labels will display as `?????` regardless of the wiring work.

Note for Phase 4: with all 42 `knowledge_documents` corrupted, `4.2` would
exclude **every** document from the embedding index, leaving the RAG feature
with an empty corpus. Phase 4 should not start until the knowledge corpus
question in Phase 2 is resolved.

---

## Out of scope, untouched

- Migration `142` (weight validity) — in flight and unapplied, per rule 0.6.
- Navigation modernization.
