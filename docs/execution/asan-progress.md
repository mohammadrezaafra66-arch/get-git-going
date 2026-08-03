# ASAN Program Progress

## Status
Current mission: M1
Current phase: 1.1 complete → next 1.2
Last commit: (see below)
Baseline typecheck: 70 (not re-run in 1.1 — no TypeScript changed; mission gate will run it)
Last e2e: not yet run this program (documented baseline 155 green / 6 red / 4 skip)

## Environment verified at bootstrap
- Branch `feature/navigation-modernization`, HEAD `1b9f63ff` at start.
- Containers up: `afrakala-lan-web` (3100), `afrakala-lan-db`, `afrakala-lan-kong` (9000),
  `afrakala-lan-rest`, `afrakala-lan-auth`, `afrakala-lan-storage`, `afrakala-lan-meta`.
- DB reachable: `afrakala` as `supabase_admin`, PostgreSQL 15.6.
- Mission files were delivered inside `docs/execution/files.zip`; extracted in place.

## Completed
- [x] M1.0 bootstrap — commit `a6edafbf` — mission files extracted and committed, progress file created.
- [x] M1.1 repair every corrupted Persian label — migration 279 — 702 findings scanned,
      687 repaired (421 row values + 266 observatory cells + 1 function literal),
      15 left for owner input. Re-scan shows zero A/B rows remaining.
- [x] M1.2 remove the legacy capital allocation path — migration 280 — 2 empty tables,
      8 functions, 1 stray trigger and 5 policies removed; 1 dynamic-path RLS policy repaired.
- [x] M1.3 restrict the `viewer` role — migration 281 — viewer-readable relations 58 → 28;
      88 restrictive policies, 8 views guarded, 4 tables that had RLS switched off closed;
      new spec `e2e/security/viewer-restrictions.spec.ts` 40/40 green.
- [x] M1.4 clean the repository — 3 strays deleted, 2 Asan workbooks moved to
      `docs/asan/reference/`, 27 root markdown files relocated under `docs/`, `.claude/`
      ignored. Typecheck still exactly 70.

## M1.1 detail

**Method.** The 2026-07-11 incident replaced every UTF-8 *byte* of each non-ASCII character
with a literal `?`. That makes recovery provable rather than a guess: a candidate is the
original iff `mask(candidate)` equals the stored value byte for byte, where `mask` replaces
each non-ASCII character with one `?` per UTF-8 byte. Every repaired value satisfies that
identity against a string still present in `supabase/migrations/` or `src/`. No wording was
invented, which is why bucket C is only 15 rows and not "everything I could not guess".

**Scan.** `docs/verification/asan/scan-corrupted-text.sql` builds itself from
`information_schema` and covers all 652 text columns of all 218 base tables in `public`.
702 findings; detail in `docs/verification/asan/scan-detail.tsv`.

**Classification.** `docs/asan/corrupted-labels-scan.md` — A 71, B 350, C 15,
plus 266 `dynamic_table_cells` values repaired at their source.

**Root cause found for 266 of the 702.** They were not corrupted individually.
`sync_product_price_observatory_rows()` joins product labels with `string_agg`, and its
separator literal had been corrupted from `'، '` (U+060C + space) to `'?? '`. A diff of the
live `pg_get_functiondef` against migration `20260516161314` shows that separator is the only
difference between live and repo. Migration 279 fixes the function first, then rewrites the
266 cells it had already written.

**Verification.**
- Discovery scan re-run after apply: only the 15 bucket-C rows remain
  (`journal_entries.description` × 1, `knowledge_documents_backup_20260722.content` × 14).
- Round-trip: zero `?` and zero U+FFFD across the repaired columns.
  `gamification_kpis.deals_registered.label_fa` now reads correctly, ZWNJ intact.
- PostgREST after `docker restart afrakala-lan-rest`, with a real HS256 authenticated JWT:
  `gamification_kpis` 13 rows, `market_indicators` 11, `achievements` 10, zero `?` in any,
  non-ASCII confirmed by codepoint dump.
- Dry run inside `BEGIN … ROLLBACK` first: 421 guarded UPDATEs each hit exactly 1 row,
  0 hit zero rows, no errors.
- Rollback script: `docs/verification/279-down.sql` (no BEGIN/COMMIT).

## Decisions made this session
1. **Mission files arrived zipped** as `docs/execution/files.zip`; extracted into
   `docs/execution/` because the kickoff README names exactly that destination.
   `files.zip` itself is left for phase 1.4 stray-artefact cleanup.
2. **Repaired the `knowledge_documents_backup_20260722` snapshot too** (70 of its 84 corrupted
   values). Rejected alternative: leave backups untouched as historical evidence. Chosen
   because the live `knowledge_documents` table holds only 1 row, so this snapshot is the only
   surviving copy of 42 documents; making it readable again is worth more than preserving a
   record of the corruption, which is preserved in this file and in git anyway.
3. **Repaired the corrupted `price_change_reasons` rows rather than deleting them.**
   The 2026-07-11 re-run inserted a *third* corrupted copy of the six seed rows instead of
   corrupting the existing ones, because the seed's `WHERE NOT EXISTS (… title = t.v)` guard
   compared against already-masked incoming text. Deleting duplicates from a table other rows
   reference is an owner decision; repairing text is reversible. Recorded as an observation.
4. **Left `journal_entries.description` (1 row) alone.** It is financial data with no anchor
   in the repo beyond an ASCII invoice number. Rule: never invent financial wording.
5. **Repaired the two `gamification_kpis.description` values whose Persian prefix was later
   suffixed** with `[auto-disabled: no profit/cost data]` × 3. Only the prefix was recovered;
   the ASCII suffix is carried over byte for byte.
6. **Kept phase 1.1 as one migration** despite its length (421 guarded single-row UPDATEs).
   The mission asks for one migration per phase, and per-row guarded statements are safer and
   more reviewable than a clever set-based rewrite.

## M1.2 detail — remove the legacy capital allocation path (migration 280)

Plan written before any change, from live catalogue state:
`docs/asan/legacy-capital-removal-plan.md`.

**Removed.** `customer_capital_allocations` and `salesperson_capital_allocations` (both 0 rows,
never used — `save_salesperson_capital_allocations` said so in its own body), their 6 indexes,
5 RLS policies and 7 triggers; `trg_archive_prior_allocations` on the surviving
`daily_capital_snapshots`; and 8 legacy-only functions.

**Edited, not dropped.** `person_merge(uuid,uuid,text)` lost one registry line;
`person_fk_drift_report()` lost one `UNION ALL` branch. Both rebuilt from live
`pg_get_functiondef` output snapshotted into `docs/verification/pre-280/` (rule 2.3).

**Kept deliberately.** `daily_capital_snapshots` (10 rows) and `daily_capital_inputs` (2 rows)
hold live data — rule 3 forbids dropping them, and they are the input/snapshot chain rather
than the allocation path. The three `/accounting/*-capital*` route stubs are kept because they
only redirect to `/accounting/dynamic-capital`; deleting them would 404 existing bookmarks.

**Surprise, chased down.** The first `DROP TABLE` was refused by a dependency:
`capital_allocation_ledger.cal_select_sales`. That ledger belongs to the *dynamic* path; only
its policy still pointed at the legacy tables, so since the dynamic path took over it had been
returning zero ledger rows to every salesperson instead of erroring (rule 2.5). Repointed at
the dynamic tables — an RLS widening for `sales`, recorded in the plan document.

**Verification.**
- Dry run in `BEGIN … ROLLBACK` ran the migration *and* `docs/verification/280-down.sql`:
  after up — legacy tables 0, dynamic rows 182, drift report 0; after down — tables 2,
  functions 8, policies 5. Both directions proven before applying anything.
- After apply + `docker restart afrakala-lan-rest`: legacy tables 0, legacy functions 0,
  dynamic rows 182, ledger policies 2, `person_fk_drift_report()` 0 rows.
- `src/` grep for the legacy identifiers: only `_dynamic` hits remain.
- `e2e/capital/no-override.spec.ts`: **6/6 green** (3 original + 3 added).
- `e2e/persons/credit-uses-person.spec.ts`: 2 passed, 1 failed — the failure is the documented
  red `persons-credit-uses-person` (a UI assertion), unchanged by this phase.

## M1.3 detail — restrict the `viewer` role (migration 281)

Plan, enumeration and result: `docs/asan/viewer-restriction-plan.md`.

**Measured, not assumed.** A real JWT was minted and all 234 relations were requested through
PostgREST. A viewer-only account could read **58**; it can now read **28**, and every survivor
is a name, a lookup, learning material or an aggregate.

**Method.** One `RESTRICTIVE` policy per denied table (88 tables), AND-ed with the existing
permissive policies so it can only subtract and only for viewer-only users. Nothing existing
was rewritten. Eight views that run with owner rights were re-created as their own unchanged
definition wrapped in one guard.

**Two surprises, both chased down.**
1. *The first measurement was of the wrong account.* `where role='viewer' limit 1` returns the
   owner's account, which also holds admin/manager/sales/accountant, so the "before" figure of
   146 relations was an administrator's. Rule 2.9's trap in a different costume. The probe and
   the spec now both assert the subject holds `viewer` and nothing else.
2. *Four backup tables had RLS switched off entirely* —
   `payment_receipts_backup_20260722`, `knowledge_documents_backup_20260722` and two
   `dynamic_parameter_weights_backup_*`. No policy on them had any effect and every
   authenticated user could read them whole. RLS enabled, admin-only read policy added, and
   both the migration and the spec now assert zero tables in `public` lack RLS.

**Decision.** The restriction keys on `public.is_viewer_only(uuid)` — sole role is `viewer` —
not on "holds viewer". Rejected the literal reading because it would blind the owner's own
account and would be the only place in this codebase where gaining a role removes access.

**Verification.**
- Dry run in `BEGIN … ROLLBACK` first; applied with `--single-transaction`; PostgREST restarted.
- `e2e/security/viewer-restrictions.spec.ts` — **40 tests, all green**. It logs in as
  `test.viewer@afrakala.local` through GoTrue exactly as the brief specifies, counts rows rather
  than trusting status codes, checks the `persons → person_identifiers` embed, proves a
  salesperson is unaffected, and proves the viewer cannot write.
- Rollback: `docs/verification/281-down.sql`.

**Left for the owner** (in the plan document): a viewer cannot see product listings because
`role_permissions.viewer.products.can_view` was already `false` before this phase. Granting it
is a widening, so it was not done inside a restriction phase.

## M1.4 detail — clean the repository

**Deleted** (untracked, and stray by the phase's own definition — not config, not referenced by
build tooling, not imported by source, not documentation of this project):
`homemarkett_audit_dashboard.html`, `photo_6016924066016595302_y.jpg` (a photo of a Docker
error), `docs/execution/files.zip` (the delivery archive; its seven files are extracted and
committed). `homemarkett-checklist.xlsx` did not exist.

**Moved to `docs/asan/reference/` and kept tracked:** `اشخاص.xlsx` (489 rows × 29 columns) and
`کالا.xlsx` (7 257 rows × 23 columns). Both verified to open with `openpyxl`. `*.xlsx`/`*.xls`
added to `.gitattributes` as `binary` so no end-of-line normalisation can corrupt the zip
container. **Later missions read the workbooks from `docs/asan/reference/`.**

**Renamed:** `docs/research/New Text Document.txt` → `docs/research/exec-prompt-194-209.md`.

**Relocated 27 root-level markdown files**, all documentation of this project rather than
strays, so they were moved rather than deleted:
- `docs/research/` — 9 research briefs (`AfraKala-*-research*.md`, `-research-pass-*`,
  `-ai-research-codex`, `-data-gamification-rag`, `-prod-banner-research`)
- `docs/audits/` — `AfraKala-audit-211-218-codex.md`
- `docs/execution/` — 13 execution plans/prompts plus `EXECUTION_P1_D8.md` and
  `PHASE_6/7/8_COMPLETE.md`
- `docs/asan/` — `ASAN_BRIDGE.md`

`git mv` was used so history follows the files. 28 files carried references to the old paths
and were rewritten, including one comment block in `src/lib/export/export-modes.ts`.
`PROGRESS.md`, `AGENTS.md`, `CLAUDE.md`, `README.md` and `CONTRIBUTING.md` stay at the root —
`AGENTS.md`/`CLAUDE.md` name `PROGRESS.md` as the root coordination notebook.

**`.gitignore`:** added `.claude/`. `.cursor/` (4 files) and `.lovable/` (2 files) are tracked
and deliberately left alone; `backups/`, `.output`, `.tanstack/**`, `.wrangler/`,
`test-results/` were already covered.

**Phase test.**
- `git status --porcelain` clean after commit.
- `npx tsc --noEmit` → **exactly 70 errors**, the documented baseline. Unchanged.
- `npx prettier --check src/lib/export/export-modes.ts` → clean.
- Both Asan workbooks open with `openpyxl` at the new path.

## HANDOFF STATE
Next action: M1 Phase 1.5 — add the uncommitted-tree guard to `deploy/lan/build.ps1`
(and `up.ps1` if it also builds), then test dirty / `-Force` / clean without deploying.
Blocked on: nothing
Files in flight: none
