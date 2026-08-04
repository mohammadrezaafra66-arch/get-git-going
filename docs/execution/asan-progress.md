# ASAN Program Progress

## Status
Current mission: **M4 (build export)** — M3 complete and its gate **fully passed**, plus the
three owner-override phases O1–O3
Current phase: M4.4 next (4.1-4.3 done)
Last commit: `812dff79`
Baseline typecheck: 70 (verified at the M1 gate; still exactly 70)
Last full e2e: **231 green / 5 red / 4 skip** — the M3 gate's confirming run. All five reds are
documented baseline reds (`212`, `213`, `214-whatsapp`, `persons-credit-uses-person`,
`purchase/c5-permissions` E2E-9). The flaky `business-flows/215` passed this time. **Zero new
reds**, so migration 287 is confirmed to have closed the 285 merge regression.

**Owner overrides in force:** `docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md` supersedes
conflicting instructions in the mission files and in `docs/asan/UNVERIFIED-LAYOUTS.md`. It
raises the execution pace (mission control section 1 is relaxed: still one complete, tested,
committed phase at a time, but no longer deliberately slow), reinstates the product importer as
a human-operated staging tool, and resolves the currency unit as **Rial** (AfraKala Toman ×10).

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
- [x] M1.4 clean the repository — commit `cdc172be` — 3 strays deleted, 2 Asan workbooks moved
      to `docs/asan/reference/`, 27 root markdown files relocated under `docs/`, `.claude/`
      ignored. Typecheck still exactly 70.
- [x] M1.5 clean-tree guard on the LAN deploy scripts — commit `bf49fc7f` — 7 cases tested
      with docker stubbed; nothing deployed during the test.
- [x] M1.6 emergency admin dormant — migration 282 — commit `0dcf78e9` — harness repointed at
      `test.admin@afrakala.local`, `page.pause()` trap retired; spec 4/4 green.
- [x] **M1 MISSION GATE PASSED** — typecheck 70, tree clean, three deploy signals match HEAD,
      e2e 202/5/4 with no new red.
- [x] **M2 research complete, gate passed** — docs/asan/research-asan-bridge.md, 1067 lines,
      R1-R8 with evidence; 8 blocking issues and 7 owner questions recorded.
- [x] M3.0 Asan layout specification — commit `a1ba226d` — 4 layouts VERIFIED, 8 open items.
- [x] M3.1 Asan code fields — migration 283 — commit `2a9f47c0` — products.accounting_code,
      person_identifiers kind asan_person_code, bank_accounts uniqueness; 11 + 3 backfilled.
- [x] M3.2 phone normalization + collision queue — migration 284 — commit `5c4c0a12` —
      9 triggers, 3 collisions queued exactly as predicted, spec 9/9 green.
- [x] M3.3 staged Asan person import — migration 285 — commit `aab2c158` — parser, staging,
      classify/commit RPCs, conflict guard; spec 7/7 green on the real 488-row export.
- [x] M3.3 UI — commit `41225d80` — `/admin/asan-import`, no migration; `e2e/asan/` **21/21 green**
      on the deployed build (`APP_GIT_SHA=41225d80`).
- [x] M3.4 staged Asan product import — migration 286 — commit `da6a6f60` — parser, staging,
      classify/commit RPCs, guard trigger, products tab on the same route;
      spec **8/8 green** on the real 7 256-row export. No product created, asserted at the table.
- [x] **M3 MISSION GATE PASSED** — the confirming full-suite run came back **231 green / 5 red /
      4 skip**, all five reds documented, **zero new**. Migration 287's fix for the 285 merge
      regression is confirmed on the wire, not merely on the two specs that caught it.
- [x] O1 Bank Mellat Asan code — migration 288 — commit `abdb2c6a` — `TEMP-CHANGE-ME` → `8`.
- [x] O2 Asan product code on the product forms — migration 289 — commit `004477bd` — create
      form, edit form, detail view, audit diff, duplicate-code message; normalisation moved
      into a trigger; spec **5/5 green** through the real browser form.
- [x] M4.1 stable Asan document numbering — migration 290 — `asan_export_numbers`, idempotent
      SECURITY DEFINER assignment under an advisory lock, three burn triggers;
      spec **8/8 green**.
- [x] O3 `docs/asan/UNVERIFIED-LAYOUTS.md` refreshed — five of seven questions resolved by the
      owner and moved to a RESOLVED table; three genuinely open items remain, plus MODEL GAPS.
- [x] M4.2 shared export shell — migration 291 — commit `960abd2f` — `/admin/asan-export`,
      the four layouts, the selection model, the Rial conversion, and a batch numbering RPC;
      spec **30/30 green** on the deployed build (`APP_GIT_SHA=960abd2f`).
- [x] M4.3 export 1, sales invoices — migration 292 — commit `812dff79` — `asan_list_sales_export`,
      the 18-column فروش mapping, cash/bank from allocated receipt amounts;
      spec **20/20 green** on the deployed build (`APP_GIT_SHA=812dff79`), file verified with openpyxl.

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

## M1.5 detail — the clean-tree guard

`deploy/lan/build.ps1` now takes `param([switch]$Force)` and refuses to build when
`git status --porcelain` is non-empty. **Untracked files count**: the build context is
`../..`, the whole tree, so an untracked file lands in the image exactly like a modified
tracked one. `-Force` still allows it, and the script's pre-existing `-dirty` SHA suffix then
makes the stamp honest instead of silent.

`deploy/lan/up.ps1` got the same guard, but **only when `--build` is among its arguments** —
it otherwise just starts containers, which is safe and useful with a dirty tree mid-development.

**Phase test** — `docker` stubbed on `PATH` so nothing was deployed:

| case | expected | result |
|---|---|---|
| `build.ps1 web`, dirty tree | exit 1 with the message | exit 1 |
| `build.ps1 -Force web`, dirty tree | proceeds, stamps `cdc172be-dirty` | exit 0 |
| `build.ps1 web`, clean tree | proceeds, stamps `bf49fc7f` | exit 0 |
| `build.ps1 web`, one untracked scratch file | exit 1, lists `?? scratch-guard-test.txt` | exit 1 |
| `up.ps1 --build`, dirty | exit 1 | exit 1 |
| `up.ps1 --build -Force`, dirty | proceeds | exit 0 |
| `up.ps1`, dirty | proceeds (no build requested) | exit 0 |

The scratch file was deleted in the same step.

## M1.6 detail — the emergency admin goes back to sleep (migration 282)

`afra-admin@local.test` is back to `status='inactive'`, `is_active=false`.
`src/routes/_app.tsx` redirects any profile whose status is not `active` to
`/pending-approval`, so that is what actually closes the door.

**The harness did depend on it**, in two places, which is presumably why it was left active:
`e2e/auth/admin.storage.json` held an afra-admin session and `playwright.config.ts` loads it as
the default `storageState`; and `ADMIN_USER_ID` in `e2e/helpers/pgrest.ts` minted admin JWTs
from its id. Both are repointed at `test.admin@afrakala.local`, which already held the admin
role and only needed activating — migration 282 does both changes together and refuses to
apply if the replacement does not actually hold `admin`.

**`save-admin-session.spec.ts` was the trap rule 2.9 warns about.** It called `page.pause()`
and waited for a human; headless does not block, so it wrote an *empty* storageState and
saved it successfully. The admin session is now generated by
`e2e/auth/generate-role-sessions.spec.ts`, extended with a fourth target rather than a new
parallel spec. All four sessions regenerated non-interactively and revalidated in 18s.

**Verification.** `e2e/security/emergency-admin-dormant.spec.ts` — **4/4 green**. It asserts
the account exists but is inactive, that `_app.tsx` still carries the guard it depends on, that
the harness no longer references the emergency account *and* that the storage state is not
empty, and that the replacement really is an active admin.

**Residual risk for the owner.** `status='inactive'` closes the *application*. It does not stop
GoTrue issuing a token to anyone holding that account's password, and the account still holds
the `admin` role, so a direct PostgREST call would still be privileged. Closing that too would
mean `banned_until` or removing the role — neither was asked for, and both would make the
break-glass account harder to use in the emergency it exists for. Flagged, not done.

## M1 MISSION GATE — PASSED

| gate item | result |
|---|---|
| 1. typecheck exactly 70 | **70** |
| 2. everything committed, tree clean | clean at `0dcf78e9` |
| 3. build + deploy, three signals match HEAD | `APP_GIT_SHA=0dcf78e9`, `APP_BUILD_TIME=2026-08-04T06:02:15Z`, `git HEAD=0dcf78e9` |
| 4. `docker restart afrakala-lan-rest` | done; web healthy, db-role-fix `Exited (0)`, all others `Up` |
| 5. full e2e vs baseline 155/6/4 | **202 passed / 5 failed / 4 skipped** — no new red |

The build was the first real exercise of the M1.5 guard: it ran against a clean tree and
stamped `0dcf78e9` with no `-dirty` suffix.

### Test arithmetic — why 202, and why 5 reds is not a regression

Baseline 155 + 6 + 4 = 165 tests. Today 202 + 5 + 4 = 211. The difference is exactly the
46 tests this mission added: `viewer-restrictions` 40, `emergency-admin-dormant` 4, and
`no-override` net +2 (one legacy-RPC case replaced by three). 165 + 46 = 211. ✔

Reds went **6 → 5**. Four are the named documented reds (`212`, `213`, `214-whatsapp`,
`persons-credit-uses-person`); the documented flaky `business-flows/215` passed today.

### The fifth red — `purchase/c5-permissions` E2E-9 — investigated, not mine

The brief names 5 of the 6 baseline reds, so one was unnamed. This is it, and it fails for a
reason that predates this mission:

- The spec asserts the "آپلود رسید" button appears iff
  `purchase_requests.assigned_to` is **non-empty**.
- `PurchaseRequestCard.tsx:36` renders it iff `request.assigned_to === user.id` —
  assigned **to me**, not assigned at all.
- Every new request is auto-assigned to `shop_settings.default_purchase_assignee_id`, which on
  this server is `4084224a-…` (`mohammadrezaafra66+old-restore@gmail.com`) — persistent live
  configuration, restored intact by `c4-assignment` E2E-15 and its `afterAll` guard.
- `4084224a` is neither the old harness admin (`48f7c9d5`, afra-admin) nor the new one
  (`05098088`, test.admin), **so the button is absent under either** while the expectation
  evaluates to 1 under either. The failure is independent of M1.6 by construction.

The spec's own comment states its premise — "with no default assignee configured … the request
is ownerless" — which is no longer true of this server.

**Not fixed, deliberately.** The brief says documented reds are not mine to fix, and I cannot
prove this was not one of the six. The one-line correction is ready if the owner wants it:
compare `assigned_to` to the current user instead of to the empty string.

## M2 MISSION GATE — PASSED

`docs/asan/research-asan-bridge.md`, 1 067 lines, **R1–R8 all written**, each with the required
Findings / UNKNOWN / Implications-for-build subsections, plus a blocking-issues section and a
seven-question summary for the owner.

| gate item | result |
|---|---|
| 1. covers R1 through R8 | 8 sections, 8× Findings, 8× UNKNOWN, 8× Implications |
| 2. no migration, no app code, nothing applied to the DB | `git status` shows only `docs/` — verified |
| 3. typecheck still exactly 70 | **70** |

### What the research changed about the build

- **R1 — product matching is effectively impossible from current data.** Barcode 0 % populated
  on *both* sides; exact name 0/355; normalized name **3/355**. Fuzzy matching is unsafe:
  0.90-similarity pairs are demonstrably *different* products (گلد vs لند, QH-2800 vs 2200,
  NA230 vs NA350). `products.easy_code` **does not exist** anywhere — nothing to extend.
  Softened later by R7: Asan mints codes for unknown items under group `101`.
- **R2 — person matching is tractable.** `customers.accounting_code` confirmed as the Asan code,
  cross-validated by code *and* by independent mobile match. Every phone in the database is
  already `09XXXXXXXXX`. The Asan code belongs in `person_identifiers` as a new `kind`.
- **R3/R4 — most of the machinery already exists.** SheetJS is a dependency; two importers and
  two exporters already work client-side. The five Asan adapters already exist in
  `export-modes.ts`, deliberately inert because no verified layout existed — **the appendix now
  supplies them**. What does *not* exist is a staging-then-approve queue, which is M3's largest
  new piece.
- **R5 — the double case needs no schema work.** `payment_receipts` already carries payer,
  receiver *and* `beneficiary_accounting_code`. `external_parties.accounting_code` exists too.
  Asan models banks as persons in one namespace — `ملت` is Asan code `3064`, the strong
  candidate for `TEMP-CHANGE-ME`, recorded but **not assumed**.
- **R6 — the brief names a table that does not exist.** Migration 276 created
  `product_service_types`, `category_required_services`, `sales_quote_item_services`, not
  `mandatory_category_services`. And `tasks.proof_requirement` **already allows
  `product_video`** while `tasks` holds 0 rows — mission control section 3's "built but never
  wired" pattern, in the exact table section 3 cites.
- **R7 — numbers must be assigned explicitly and stored.** Nothing today maps a document to an
  external number. First batch is small: 4 accepted quotes, 1 approved receipt, 1 journal entry,
  261 purchases.
- **R8 — the ×10 risk is real and unresolved.** AfraKala is provably Toman; Asan's unit is
  inferred from balance magnitudes only (median 6 000 000) and is **UNKNOWN**. Also: every
  Jalali formatter in the app calls `loadPersian({usePersianDigits:true})` on the shared moment
  instance, so M4 needs its own Latin-digit formatter and must not rely on import order.

## M3.0 — Asan layout specification

`docs/asan/asan-layouts.md` — all four layouts VERIFIED, every column with its header text,
mandatory flag, type and source; shared conventions for dates, digits, timezone, currency and
the account-code namespace; and the `account_kind` → `کد حساب` mapping showing what is and is
not resolvable today.

`docs/asan/UNVERIFIED-LAYOUTS.md` — 8 open items, each stating exactly what the owner must
supply: sales column K, the six uncaptured radio options (deliberately unbuilt), the currency
unit, the `TEMP-CHANGE-ME` bank code, the three control-account codes, the account called "12",
which quote status means finalized, and the product-code strategy for 352 unmatched products.

Phase test: both files exist; every layout carries a status; the unverified file contains no
layout marked VERIFIED (0 matches).

### Where the M3 brief and the research disagree — the research wins

Phase 3.1 says to backfill products "by exact barcode" and phase 3.4 calls barcode "the
strongest match key per R1". **R1.5 measured barcode as 0 % populated on both sides**
(`products.barcode` 0/355, `کالا.xlsx` `بارکدکـالا` 0/7 256). Product backfill will therefore
match **3 rows by normalized name**, not by barcode, and the phase report will say so rather
than quietly reporting a zero as if the strategy had been tried and found nothing.

Phase 3.4 also states "I have 374 products"; the live count is **355**.

## M3.1 — Asan code fields (migration 283)

- **`products.accounting_code`** added, nullable, partial unique index. `products.easy_code`
  does not exist anywhere in the schema (R1.3), so there was nothing to extend.
- **`person_identifiers` kind `asan_person_code`** — the code is a property of the person, not
  the customer role (R2.2). CHECK extended, partial unique index added.
- **`bank_accounts.accounting_code`** had **no uniqueness at all** — two accounts could have
  claimed one code. Partial unique index added.
- **`external_parties`** untouched: column and unique constraint already existed (R5.2).

**Surprise, chased down.** The CHECK was not the only gate. `trg_person_identifiers_normalize`
calls `normalize_identifier()`, whose `ELSE` branch rejected the new kind outright
(`نوع شناسه پشتیبانی نمی‌شود`). That function was rebuilt from its **live** definition with one
branch added (rule 2.3), and `src/lib/persons/identifiers-normalize.ts` — which deliberately
mirrors it — got the matching branch plus a Persian label in `PersonIdentifiersForm`.

**Backfill:** 11 person codes (`status='provisional'` — 6 of them do not appear in the Asan
export, and phase 3.3 is what promotes a code to `confirmed`), 3 product codes.
**Barcode backfill is absent because barcode is 0 % populated on both sides**, not because it
was tried and found nothing.

Dry run proved: duplicate product code rejected, duplicate person code rejected, 352 NULL codes
coexist (the index really is partial), unknown kind still rejected, and `۶۰۱۵۰۶` → `601506`.

## M3.2 — phone normalization + collision queue (migration 284)

Canonical mobile form `09XXXXXXXXX`, enforced by a `BEFORE INSERT OR UPDATE` trigger on **nine
tables** so a direct PostgREST `PATCH` cannot dodge it. `normalize_phone_local()` reuses
`normalize_identifier()` rather than reimplementing parsing, and is **non-strict**: an
unparseable value is returned untouched, because a phone column must never abort a sales quote.

Deliberate exception, recorded so nobody "fixes" it later:
**`person_identifiers.value_normalized` keeps `+989…`** — the kind is literally `mobile_e164`
and the identity model's contract is E.164.

`phone_collisions` table + `detect_phone_collisions()` + admin page
`/admin/phone-collisions`. **The page has no merge button by design**; `/persons/merge` remains
the only merge path. Detection found **exactly the three collisions R2.4 predicted**.

The backfill **detects first, normalises second**, so it cannot abort halfway through a phone
rewrite. It changed 0 rows — every phone was already canonical, which was a fact about the
data and is now a property of the schema.

`e2e/asan/phone-normalization.spec.ts` **9/9 green**; `e2e/asan/` registered in
`playwright.config.ts`.

### Two traps worth remembering
- `e2e/helpers/db.ts` **refuses anything that is not a SELECT**. A `DELETE` handed to
  `dbScalar` is silently ignored, so test cleanup must go through PostgREST. This left a stray
  collision row and reddened a later test until fixed.
- **Never run `prettier --write` on `src/integrations/supabase/types.ts`.** It is not in
  `.prettierignore` but is unformatted in the repo, so a write reflows all ~11 500 lines
  (10 762 insertions / 10 818 deletions). Edit it surgically. `eslint.config.js:15` already
  ignores it.
- The route tree is regenerated with
  `node -e "import('@tanstack/router-generator').then(async m => { const c = await m.getConfig({}, process.cwd()); await new m.Generator({config:c, root:process.cwd()}).run(); })"`.

## M3.3 — staged Asan person import (migration 285) — DB + parser + tests DONE, UI NOT BUILT

**Built and verified.** `asan_import_batches` + `asan_import_person_rows`,
`asan_classify_person_batch()`, `asan_commit_person_batch()`, guard trigger,
`src/lib/asan/parse-persons.ts`, `e2e/asan/import-persons.spec.ts` **7/7 green** against the
real 488-account export.

- Matching order: **Asan code → mobile → name**. A name-only hit is **always** a `conflict`,
  never a silent update, because R2.6 measured name as the weakest signal.
- A `conflict` row can never be accepted — enforced by a **trigger**, so a direct PostgREST
  `PATCH` is refused too. The spec constructs a conflict rather than hoping the data provides
  one.
- An update **never overwrites a non-empty AfraKala value**; only a blank field is filled.
- **Idempotent**: staging the same file twice and committing produces `created: 0, updated: 0`.
- Parser reads **by header text**; the spec reverses every row of the real workbook and
  asserts an identical parse.
- `role_permissions` seeded for all **7** roles; only `admin` and `accountant` can view.

**Two real bugs found by testing**, both fixed before commit: `min(uuid)` does not exist in
Postgres, and the commit RPC did not record which person a `new` row created — leaving nothing
to trace or clean up.

### M3.3 UI — `/admin/asan-import` (commit `41225d80`, no migration)

Upload → preview → stage → classify → confirm, in `src/routes/_app.admin.asan-import.tsx`.
Nothing reaches `persons` until the final button. The page deliberately **does not
re-implement** the two rules that matter — they stay in migration 285 where a direct
PostgREST call also hits them — it only makes them visible and never offers a control the
backend would refuse: there is no "accept" button on a `conflict` row at all, and each
matched row states which side of the never-overwrite rule it falls on ("آدرس پر است —
دست‌نخورده می‌ماند" vs "آدرس خالی است — از آسان پر می‌شود").

**The obvious flag was the wrong one.** `adminOnly` in the navigation registry does not mean
"admins only" — `selectors.ts:35` reads it as *admin or manager*. Using it would have hidden
the page from the **accountant** it is mainly built for while showing it to a **manager** the
backend refuses. The entry therefore carries no `adminOnly` and gets
`ROLE_ALLOWLIST_BY_ROUTE["/admin/asan-import"] = ["admin","accountant"]`, matching both the
route guard and the seed.

**Static/dynamic permission agreement.** `asan-import` was added to `ModuleKey` and to the
static `PERMISSIONS` matrix with exactly the roles migration 285 seeded into
`role_permissions`. That matrix is only the fallback for when the dynamic cache has not
loaded, but a fallback that disagrees with the table is how a menu ends up offering something
the backend refuses — the same failure the `purchases` comment in `roles.ts` records.

**Types were edited surgically**, never with `prettier --write`: `asan_import_batches`,
`asan_import_person_rows` and both RPCs were added to `src/integrations/supabase/types.ts` by
hand (a write reflows all ~11 500 lines).

Other decisions worth keeping:
- **A staged batch is adopted on mount.** Staging 488 rows and then losing the batch id on a
  refresh would strand them with no way back to the preview.
- **Rows are paged server-side** (50/page, `count: 'exact'`, filter by classification) rather
  than pulling 488 rows into the browser — and the matched-person lookup for the field diff is
  one `in (…)` per page, not one query per row.
- **Per-row accept/skip, not per-field.** The brief asks for per-field or per-row; the commit
  RPC's rule is stricter than either — a non-empty AfraKala value is never overwritten — so the
  only field a per-field control could govern is one that is currently blank. Per-row is the
  honest surface for what the database will actually do.
- `raw: false` on the sheet read, so an account code never loses a leading zero to numeric
  coercion.

**Verification.** `e2e/asan/` **21/21 green** against the deployed build: the 8 API-level cases
from `aab2c158`, 4 new browser cases (admin reaches it and merely opening it writes nothing —
person *and* batch counts asserted; accountant reaches it; salesperson and anonymous never see
it, asserted on page content rather than URL because the shell renders before the guard
resolves), and 1 source-level tripwire so nobody quietly widens the guard, the allowlist or the
static matrix later. Typecheck exactly **70**. Test data removed: persons back to **70**,
0 batches, 0 staged rows.

### Traps that cost time here, worth knowing before 3.4
- The classify/commit RPCs are `SECURITY DEFINER` and gate on `has_any_role(auth.uid(), …)`.
  **Calling them through `psql` fails with `forbidden`** — there is no JWT. Call them through
  PostgREST `/rpc/…`.
- **`persons` has no DELETE policy.** An API delete returns 204 and removes nothing (rule 2.5).
  Teardown must go through `e2e/helpers/db-write.ts` → `dbExecE2e()`, which is the only
  sanctioned write path and refuses SQL without an `E2E_AUDIT_20260729_` marker.
- A failed test run left 3 persons behind; they were found by `created_at` and removed, and
  `persons` is back to **70**. Always re-check the baseline count after a red run.

## M3.4 — staged Asan product import (migration 286)

Same staging-then-approve machinery as 285, reusing `asan_import_batches` with
`kind='products'` rather than building a second batch system. **One rule is inverted, and it
is the one the brief cares about: no product is ever created.** Asan carries 7 256 items and
AfraKala stocks 355. An Asan row with no AfraKala counterpart is `unmatched` and stays in
staging. There is deliberately **no `new` classification at all** — the value simply does not
exist in the CHECK constraint, so the state a person import treats as normal is not
representable here.

`asan_commit_product_batch` does not merely omit an INSERT. It counts `products` before and
after and **raises if the number moved**, rolling the whole commit back. The guarantee
therefore survives a future edit to the function body, which "we just didn't write an INSERT"
would not.

### The normalizer was measured before it was trusted

The whole matching design rests on one function reproducing what R1.5 measured. That was
verified **at full scale in a rolled-back transaction, before the migration was applied**: the
7 256 Asan descriptions were loaded into a temp table and matched against all 355 products.

| R1.5 measured | this normalizer |
|---|---|
| normalized-name matches: 3 | **3** |
| the three pairs | **AFK-2026-00039⇄7009, AFK-2026-00178⇄7243, AFK-2026-00179⇄7272** — identical |
| exact-name matches: 0 | **0** |
| Asan descriptions duplicated within Asan: 60, covering 122 rows | **60 / 122** |
| `کد کالا` distinct | **7 256 / 7 256** |

**Its character tables are ASCII `U&'\uXXXX'` escapes on purpose.** A fold table is exactly the
kind of literal where a corrupted byte would *not* raise — it would quietly stop folding one
letter and silently change which products match. Escapes cannot be corrupted by an encoding
accident. Persian is used only in the human-facing `RAISE` messages, and the applied
definitions were read back and confirmed to contain zero `?`.

**One thing the research did not report:** two AfraKala product names normalize to a key
shared with another AfraKala product. Those can never be resolved by name alone, and the
classifier already handles it — `hits > 1` is a `conflict`, not a guess.

### Matching, and where the brief is wrong

The brief calls barcode "the strongest match key per R1" and says to link on it. **R1.5
measured barcode as 0 % populated on both sides** (`products.barcode` 0/355, `بارکدکـالا`
0/7 256), so it is not a strategy that can be tried and found wanting — there is nothing to
try. Order is therefore **Asan code → normalized name → unmatched**, and the spec asserts the
barcode column is still empty so that "0 barcode matches" can never be misread later.

The brief also says "I have 374 products"; the live count is **355**.

### What a first import of the real file actually does — and why the spec constructs its case

Against this database the real workbook produces **3 `unchanged` and 7 253 `unmatched`, with
zero `update` rows** — because migration 283 already backfilled those three codes from exactly
these three name matches. So the real file exercises the link path not at all. Rather than
report a green suite that never ran the code under test, the spec **unlinks one real product**,
re-classifies (it becomes `update`), accepts, commits — and the commit writes the same code
back, so the fixture is restored *by the operation under test*. An `afterAll` restores it
unconditionally in case that test ever fails part-way.

### Timing (the brief asks for it)

7 256 rows staged in **484 ms** (15 requests of 500; one request per row would be 7 256), and
classified in **3.2 s**. Classification is five set-based statements, not a PL/pgSQL row loop.

### ⛔ The bug testing found that design did not

The guard trigger's `applied_at IS NULL` clause is load-bearing. Without it the guard refuses
**the commit function's own bookkeeping write**: after linking, the commit stamps `applied_at`
and moves the row to `unchanged` while `decision` is still `accept`, which the naive rule reads
as "accepting a non-update row" and rejects. Every commit failed with a Persian error that
looked like the guard working correctly. It does not open a hole — the commit only ever touches
rows with `applied_at IS NULL`, so a forged `applied_at` buys an attacker having their row
ignored.

**Migration 286 was edited and re-applied rather than fixed by a 287.** Rule 2.6 forbids editing
an existing migration because another environment may already have applied it; 286 had never
been committed or shared and existed only in the working tree and on this test server, and the
file is idempotent (`CREATE OR REPLACE`, `CREATE TABLE IF NOT EXISTS`, `DROP`/`CREATE TRIGGER`),
so re-applying leaves the database exactly as if 286 had always been correct. Shipping a broken
286 plus a 287 would make every future fresh install apply a bug and then repair it. Recorded
here because it is a deliberate departure.

### A second trap, in the harness rather than the code

`e2e/helpers/db.ts` refuses any statement containing the word `update` **anywhere, including
inside a string literal**, so `where classification='update'` is rejected as a write. The guard
is right to be blunt; the counts are read through a `GROUP BY` instead.

### One anomaly, reported rather than explained away

In the run where the two bugs above were failing, the final normalizer assertion also returned
0 instead of 3. It is not reproducible: after fixing the two real failures it returns 3 on every
run, including with both batches staged (14 512 rows). The diagnostic that would identify it if
it recurs was left in the spec. **It is recorded as unexplained rather than claimed as fixed.**

### Verification

`e2e/asan/import-products.spec.ts` **8/8 green** against the deployed build. Test data removed:
products **355**, linked codes **3**, batches **0**, staged rows **0**, persons **70**.
Typecheck exactly **70**.

## M3 MISSION GATE — the full suite found a real regression from phase 3.3

The gate's full-suite run came back **228 passed / 8 failed / 4 skipped**. Six of those eight
are the documented reds (`212`, `213`, `214-whatsapp`, `persons-credit-uses-person`,
`purchase/c5-permissions` E2E-9, plus the documented flaky `business-flows/215`). **Two were
new, and they were mine.**

### What broke, and why it was invisible

`e2e/persons/merge-ui.spec.ts` and `merge-ui-guard.spec.ts` both failed with
«ادغام متوقف شد: ستون «asan_import_person_rows…»». **Migration 285 added
`asan_import_person_rows.matched_person_id` — a new foreign key to `persons` — without
registering it**, and `person_merge` deliberately reads its work list from `pg_constraint` and
**halts on any key it does not recognise**. So from `aab2c158` onward, *every merge in the
system aborted*.

That is the protector doing its job rather than something breaking: the alternative is a merge
that silently leaves a staged import row pointing at a person that no longer exists. It is
**the same failure mode migration 271 fixed for `profiles.person_id`** during P1+D8 phase 4 —
the same trap, in the same costume, two missions later.

It was invisible because **phase 3.3 ran only `e2e/asan/`**. Nothing about the Asan suite
touches merging, so a green phase gate coexisted with a broken merge for two commits. The
lesson is already written into mission control section 2.9 (full suite at the end of every
*mission*) and it is exactly what caught this.

### Migration 287 — the fix, and a false positive in its own guard

Registered as **`generic`**, not `identity_root`: the column is not unique (many staged rows
may point at one person) and carries no financial state, so a plain repoint is right.

The migration **patches the live definition rather than rewriting it** (rule 2.3). The live
`person_merge` is ~15 KB and carries nine Persian message literals; retyping it to change one
line is precisely how a previous session nearly destroyed a function. So 287 reads
`pg_get_functiondef`, asserts its anchor matches **exactly once**, inserts one ASCII line, and
re-executes. Snapshot in `docs/verification/pre-287/person_merge.live.sql`.

**Its dry run caught a bug in its own corruption check**, which is the reason dry runs are
mandatory. The check began as "the rewritten definition must contain no `?`" — the 2026-07-11
corruption signature. It fired immediately, and it was wrong: `person_merge` legitimately
contains `IF NOT (_registry ? _key)`, where `?` is the **jsonb key-existence operator** and is
the very mechanism the registry is read with. Had that check been written to pass instead of
to fail, it would have silently never protected anything. It is now a **before/after count
comparison**: the inserted line is pure ASCII, so the `?` count must not move.

287 also adds **the assertion 285 should have carried**: every foreign key pointing at
`persons` must appear in the registry, so the next new column cannot repeat this silently.

**Verified:** `e2e/persons` back to **36 passed / 1 failed** — exactly the documented
`persons-credit-uses-person` — and `person_fk_drift_report()` returns 0 rows.

## OWNER OVERRIDE PHASES — O1, O2, O3

`docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md` arrived after M3 closed. Three of its
instructions are M3-shaped rather than M4-shaped, so they were executed first, one phase each.

### O1 — the Bank Mellat Asan code is `8` (migration 288)

The owner's number, **not** the researched candidate. `docs/asan/UNVERIFIED-LAYOUTS.md` had
proposed `3064` — the `اشخاص.xlsx` row whose `نام حساب` is exactly `ملت`, with no mobile and no
address, the shape of a ledger account rather than a person, and with no competing row. It is a
good inference and it is **wrong**: the owner says `8`. The migration records that explicitly so
a later session does not "correct" 8 back to the guess.

Scoped by **both** id and current value, so a code already changed by hand is never silently
overwritten, and guarded so no bank account is left carrying `TEMP-CHANGE-ME`. Verified by
reading the row back: `accounting_code = '8'`, length 1.

### O2 — the Asan product code becomes a real field (migration 289)

Owner requirement: the create form exposes it, the edit form updates it, it is optional, and it
survives a round trip. The column and its partial unique index already existed from migration
283 — this is the project's recurring pattern from mission control section 3, *the capability was
built and never wired up*. So no new column was created; the wiring was.

**Where the interesting decision was.** The obvious implementation is to trim and fold the value
in the form. That would have been wrong in a way that looks fine: 283's unique index is on the
**raw** column, so `۷۰۰۹` and `7009` are two rows claiming one Asan code and the index accepts
both, and a direct PostgREST `PATCH` never sees a form rule at all (rule 2.5). Migration 289 puts
normalisation in a `BEFORE INSERT OR UPDATE OF accounting_code` trigger and **reuses
`asan_normalize_code` from migration 286** rather than writing a second normaliser — a
hand-typed code and an imported code now normalise identically by construction, not by
coincidence. `asan_normalize_code` deliberately does not strip punctuation, so a future
non-numeric code such as `AFK-12` survives, and it returns NULL for a whitespace-only value,
which is what turns a cleared form field into a real NULL rather than a row claiming the
empty-string code.

The migration asserts that **no already-stored code would be rewritten** by the normaliser. If
that assertion had failed it would have meant the next ordinary UPDATE of any product silently
changed its Asan identity.

Also wired: the detail view shows the code, `FIELD_LABELS` names it so the product history logs
it like any other field, and a duplicate code now raises its own Persian message instead of the
generic "SKU already exists" one, which would have been actively misleading.

**Verification — `e2e/asan/product-asan-code.spec.ts` 5/5 green.** The first three cases drive
the **real browser form**, because the claim is not "the column accepts a value" but "a human
typing into the page ends up with that value in the database"; the database is the oracle, the
toast is not. A code typed with Persian digits and surrounding spaces lands as `9991234`. A
product created with the field left empty saves with `accounting_code IS NULL` — not `''`. An
existing product gets its code set through the edit form and reads back after a reload, which is
the owner's "inline edit" manual path proved rather than asserted. The last two cases are
API-level on purpose: a direct PATCH is normalised by the trigger, and a second product claiming
an existing code gets `409 products_accounting_code_unique`. Test data removed and the catalogue
re-counted: **355 products, 3 linked codes** — exactly the pre-test state.

### O3 — `docs/asan/UNVERIFIED-LAYOUTS.md` refreshed

Five of the seven open questions are resolved by the owner's answers (currency, Mellat code,
sales column K, the finalized-quote definition, product-code strategy). They moved to a
**RESOLVED — do not re-open** table rather than being deleted, so a future session does not
resurrect a settled question. What remains genuinely open: the `invoice_ar` code, the `other`
account, and per-party Asan codes for external parties. A `## MODEL GAPS` section now records
the two things the owner described that the data model may not be able to state — `clearing`
having no Asan counterpart, and the دوبل case where money owed to A lands in B's account.

## M4.1 — stable Asan document numbering (migration 290)

**The rejected design matters more than the chosen one.** A `SEQUENCE` per document type is the
obvious implementation and it is wrong here: a sequence burns its value on *any* rolled-back
transaction, so a failed export attempt would silently create a gap the owner cannot explain.
`max+1` under a per-type advisory transaction lock leaves no trace when it rolls back, so
**every gap in this table is a deliberate, recorded burn** rather than an accident.

Assignment is a SECURITY DEFINER function and the table has **no INSERT/UPDATE/DELETE policy at
all**. That is stronger than "the API is not supposed to write here": a direct PostgREST call
cannot mint, edit or delete a number, which the spec proves by trying all three. It reads the
existing mapping *before* taking the lock (the common re-export path costs nothing) and again
*after* acquiring it, because a concurrent transaction may have inserted the same document while
this one waited.

**No foreign key to the source documents, on purpose.** A number must survive the deletion of
the document that consumed it — that is what "burned, not recycled" means. `ON DELETE CASCADE`
would erase the evidence and `RESTRICT` would block ordinary deletions, so three narrow triggers
record the disappearance instead: cancel-or-delete on `sales_quotes`, delete on `purchases`, and
delete on `journal_entries`. The quote trigger carries the migration-278 guard — writing a
status over itself is not a transition.

**Two traps this phase walked into, both worth recording.**

1. **A `RAISE NOTICE` probe proves nothing here.** The duplicate-number test first reported its
   verdict with `RAISE NOTICE`; psql writes notices to **stderr**, which `dbExecE2e` does not
   capture, so the test failed while the constraint was working perfectly. The verdict now goes
   into a temp table and is `SELECT`ed back. A probe whose success signal cannot reach the
   assertion is not a probe.
2. **A failing test made two healthy tests fail.** Playwright discards the worker after a
   failure and starts a new one, which runs `afterAll` — the cleanup — *mid-file*, and then
   `beforeAll` again. So one real failure wiped the fixture and two later tests failed against
   an empty table for reasons that had nothing to do with them. The later tests no longer assume
   numbers minted by earlier ones: they assign idempotently and compute expectations from the
   live high-water mark. **Worth remembering for every future spec in this program.**

Also caught by the cleanup assertion: the burn test deletes its own quote, so its mapping row
can no longer be reached *through* `sales_quotes` — the very survival the test asserts. Cleaning
by the captured id was needed to leave zero rows behind.

**Verified:** `e2e/asan/export-numbering.spec.ts` **8/8 green** — 1/2/3 in order, re-export
returns the same number and creates no second row, purchase starts again at 1 while sales has
reached 3, two simultaneous assignments get consecutive-but-distinct numbers, a duplicate is
rejected inside the database, PostgREST cannot mint/edit/delete, a salesperson gets a Persian
403, and a cancelled document's number is burned rather than handed to the next document.
Table left with **0 rows**.

## M4.2 — the shared export shell (migration 291)

One page for every Asan export. `src/routes/_app.admin.asan-export.tsx` knows nothing about any
particular layout: it takes a definition out of `ASAN_EXPORTS`, lists what that definition finds
in the chosen date range, lets the accountant untick what she does not want, and writes what the
definition builds. Phases 4.3–4.7 flip entries from `notBuiltYet` to real definitions; none of
them touches the page.

**A previous session had built this and left it applied-but-uncommitted.** Migration 291 was
already on the LAN database while nine source files sat untracked in the working tree — exactly
what rule 2.4 forbids, because `docker-compose` builds from the working tree and `APP_GIT_SHA`
would have lied. The phase had **no test at all**. It was finished rather than redone: the code
was reviewed, one inaccuracy corrected, the phase test written, and the whole thing committed as
one phase.

### The three decisions worth keeping

1. **The selection model stores what was *excluded*, not what was included.** "Everything is
   ticked" is then the zero state, and a row the accountant has never scrolled to is selected by
   construction. The obvious alternative — a set of selected ids — has to *add* a row the moment
   it becomes visible, and any bug there silently drops documents from an export. The test walks
   the same 30 rows at four different page sizes and asserts the one unticked row stays unticked
   at every size.
2. **"این صفحه" and "همهٔ N ردیف" are separate controls**, as the brief insists. Unticking one
   page of thirty leaves twenty selected; unticking all leaves zero. If those were one control
   the accountant could not tell the difference until the file was already inside Asan.
3. **A blocked document is shown, not hidden.** It appears with its Persian reason and is
   excluded from the file — not silently dropped (she would believe it exported) and not fatal
   to the export (she could not export the other forty-nine). `splitForExport` is the single
   place that decides, and it returns three lists: `exportable`, `blocked`, `skipped`. Blocked
   and skipped are different states and the preview says which is which.

**An export that is not built yet is visible and honest.** It appears in the selector marked
«هنوز ساخته نشده» and `buildRows` throws rather than emitting a half-guessed layout — the same
stance `src/lib/export/export-modes.ts` already took for the unconfigured Asan adapters.

### Why the phase test is mostly not a browser test

The selection semantics are the thing this phase promises, and they were deliberately factored
into pure functions so they could be asserted directly. That is not a shortcut around the
browser: the two select-all controls are exactly where a browser test proves the *widget* works
while the *rule* underneath is wrong. The page's guards **are** asserted in a real browser, and
a source-level tripwire ties the page to the functions under test (`splitForExport`,
`split.exportable`, `disabled={!!d.blockedReason}`, `AMOUNT_UNIT_LABEL_FA`, and the assertion
that `asan_assign_document_numbers` appears only inside the download path) so the two cannot
drift apart later.

Because no export is `available` yet, the file pipeline is exercised through a definition
constructed inside the spec. **The strongest case there is the blank column K**: the sales
layout's eleventh header is deliberately empty, and an unnamed column collapsing would shift
L..R one place left and post تخفیف into the نام حساب field. The test writes eighteen sentinels
into a real workbook, reads it back with `xlsx`, and asserts every cell is still where it was
written. That is also why `aoa_to_sheet` is used rather than `json_to_sheet` — a JSON row keyed
by header text cannot express an unnamed column.

### The currency conversion

`src/lib/asan/amounts.ts` carries the owner's decision: Asan is Rial, AfraKala is Toman, so
every amount is ×10 in integer arithmetic. Three properties are asserted: `null` in → `null`
out (an inapplicable amount must stay an **empty** cell, because Asan's `بدون مبلغ حذف شود`
drops zero-amount rows, so writing 0 changes what Asan imports); a **fractional** Toman value
throws rather than rounding; and amounts reach the sheet as numeric cells (`ws["E2"].t === "n"`),
never as separator-formatted strings. The refusal to round is only safe because the live data
supports it, so the spec **also queries the live database** and asserts zero `sales_quotes` rows
carry a fractional `final_amount`. The strict per-quote `T → T*10` assertion belongs to 4.3,
where a real quote exists to assert it against.

The unit is stated on screen, not assumed — the owner asked for that explicitly.

### Migration 291

Two things, both for the shell rather than for any one export:

- **`role_permissions` for `asan-export`, one row for every role.** Rule 2.5: a module with no
  row at all is granted to *all* roles by `has_dynamic_permission`, so an unseeded module is an
  open door. Only `admin` and `accountant` get `can_view`/`can_export`; the other five roles get
  an explicit all-false row. The migration's own gate refuses to apply if the row count does not
  equal the role count.
- **A batch form of 290's assignment.** One HTTP round trip per document does not scale to a
  purchase register, and a client-side loop would leave a half-numbered export if the browser
  were closed midway. `asan_assign_document_numbers` runs in one transaction: either every
  selected document has a number or none does. **It is a loop over the single-document function,
  never a second implementation** — idempotency, the advisory lock and the permission check stay
  in one place. The spec asserts that by reading the function body back and requiring it to
  contain no second `MAX(asan_number)` and no second `INSERT INTO`.

Ordering is by id, not by whatever order the client happened to send, so a batch of new
documents is numbered predictably.

### One inaccuracy corrected during review

`src/lib/rbac/roles.ts` claimed its `asan-export` entry "mirrors migration 291's seed exactly".
It does not: 291 seeds `can_create` and `can_update` **false for every role including admin**,
while the matrix lists `["admin"]`. Nothing behaves wrongly — `hasPermission` short-circuits to
true for admin whatever the matrix says, and every non-admin role does agree — but a comment
that overstates an agreement is how the next session stops checking. The comment now says what
is actually true, and the spec compares the matrix against the seeded rows **for every
non-admin role** so the claim is enforced rather than asserted in prose.

### Verification

`e2e/asan/export-shell.spec.ts` — **30/30 green** against the deployed build
(`APP_GIT_SHA=960abd2f`, `APP_BUILD_TIME=2026-08-04T14:41:17`, all three signals equal to HEAD;
PostgREST restarted). Typecheck exactly **70**. Test data removed: the batch RPC really does
mint numbers, so the phase really does give them back — `asan_export_numbers` holds **0** rows
from this phase.

## M4.3 — export 1, sales invoices (migration 292)

One sheet row per invoice **line**, the invoice number repeating across its lines, in the
verified 18-column `فروش` layout.

### What "finalized" actually is — measured, because the owner said not to assume

The owner asked for pre-invoices that are accountant-finalized **and** stock-deducted, and
explicitly said not to key off `status='accepted'` without checking. From the live database:

- **Stock deduction is bound to exactly one transition.** `trg_sales_quotes_stock_out` fires
  `AFTER UPDATE OF status WHEN (new.status = 'accepted' AND old.status IS DISTINCT FROM
  'accepted')` and writes `stock_movements` rows with `ref_type = 'sale_quote_confirm'`. So
  `accepted` **is** the stock-deducting status, and the material evidence is the movement row.
  The candidate set is `accepted` and nothing else: a draft has deducted nothing, and a cancelled
  quote is void (migration 290 burned its number).
- **Finalization is `accounting_registered_at`**, written only by
  `set_quote_accounting_marker(..., 'registered', true)`, which is restricted to
  admin/accountant/manager and refuses a cancelled quote. It is the only accountant-operated flag
  on the table.
- **On its own that marker means nothing.** 32 of the 50 quotes carry it while still in `draft`.
  It is a finalization signal only in conjunction with `accepted` — which is precisely why the
  owner asked for both conditions rather than either.

**The two signals disagree for three quotes, and the disagreement is history rather than a bug.**
SQ-2026-000003/4/5 were accepted on 2026-07-21 and 2026-07-23 — **before migration 210
(2026-07-26) created the stock-out trigger** — so no movement was ever written for them and none
ever will be. SQ-2026-000024 was accepted on 2026-07-28 and is the only accepted quote carrying
one. Confirmed against `audit_logs`, not inferred from `updated_at` (all four were touched again
on 2026-08-01).

They are therefore **listed and blocked with that reason spelled out**, never silently omitted.
The accountant must be able to see that three finalized invoices are being held back and why; a
set that quietly shrinks from four to one is how an invoice goes missing. Today the export
contains exactly **one** invoice and shows **three** blocked, with three different reasons.

### ⛔ Two real defects the dry run caught

1. **The payment columns summed the wrong amount.** They read `payment_receipts.amount` — the
   receipt total — where they had to read `payment_receipt_links.amount`, the sum **allocated to
   this invoice**. One receipt can settle several invoices, and on this database exactly that
   happens: receipt `fd8194a5` totals **10 100 000 000** Toman of which **100 100 000** belongs
   to SQ-2026-000003. The file would have carried a bank deposit **one hundred times** the
   invoice into live accounting — the precise class of silent financial corruption this program
   exists to prevent. The spec now asserts the two figures really do differ on this data, so the
   test cannot quietly become vacuous.
2. **`RETURNS TABLE` names collide with the query's own columns.** `quote_id`, `quantity`,
   `line_total` and the rest are simultaneously plpgsql variables and column names, so the
   function **created cleanly and raised `column reference is ambiguous` on first call**. Fixed
   with `#variable_conflict use_column` plus explicit aliasing. A migration that applies without
   error is not a migration that works.

### Decisions worth keeping

- **The rule lives in the database.** `asan_list_sales_export` is SECURITY DEFINER and refuses a
  caller who is not admin or accountant **loudly** rather than returning zero rows — upstream,
  zero rows reads as "there is nothing to export" (rule 2.5), which is the worst possible answer.
- **`LEFT JOIN` to the line items, not `INNER`.** A finalized quote with no lines must still
  appear, blocked and named; an inner join would delete it from the preview entirely, which is
  the one outcome the 4.2 shell exists to prevent.
- **Payment totals go on the first line only.** Repeating a document-level receipt on every line
  would multiply it by the line count inside Asan.
- **A zero amount is written as an empty cell, not `0`.** "No discount" and "a discount of zero"
  are the same fact, and Asan's `بدون مبلغ حذف شود` drops zero-amount rows anyway.
- **Three columns are deliberately empty**, recorded in `UNVERIFIED-LAYOUTS.md` section 6:
  `عوارض` (AfraKala records no duty), `گروه حساب/کد۲` (no counterpart), `سریال کد کالا` (products
  carry no serial). The tempting mapping for the last is AfraKala's own SKU, sitting right there
  in `sku_snapshot`; it was **not** used, because that puts an AfraKala identifier into a field
  Asan means for a manufacturer's serial, and a plausible wrong value is worse than a blank one.
- **The mapping is split into `export-sales-rows.ts`**, free of the Supabase import — the same
  split `receipt-export-rows.ts` got in P1+D8 phase 11 — so the spec exercises the **shipped**
  mapping rather than a retyped copy. Retyping a mapping is exactly how the «ردشده» label bug
  reached a file in that phase. Phase 4.8 reuses this module for the single-quote export.

### ⛔ A mistake this phase made against live data, and what changed because of it

The blocked-document test has to construct its case, because every accepted quote's customer
already has an Asan code. The first draft deleted the code and restored it with
`insert (person_id, kind, value)` — but `person_identifiers` has **no `value` column**. The
insert threw *inside* `finally`, its failure was masked by the assertion failure it was cleaning
up after, and **a real Asan person code stayed deleted** (11 → 10). It was restored from
`customers.accounting_code`, the exact source migration 283 backfilled it from, and read back
field by field.

Three things changed so it cannot recur: the restore now runs the migration-283 backfill
statement itself (idempotent by its own two `NOT EXISTS` guards); `beforeAll` **heals before
asserting**, so a run that died mid-test does not redden every later test for an unrelated
reason; and both `beforeAll` and `afterAll` assert the count is exactly **11**. The test also
proves the restore source agrees with the row *before* deleting anything.

### Verification

`e2e/asan/export-sales.spec.ts` — **20/20 green** on the deployed build (`APP_GIT_SHA=812dff79`,
`APP_BUILD_TIME=2026-08-04T15:06:02`, all three signals equal to HEAD; PostgREST restarted).

The workbook is read back with **openpyxl**, an independent reader, because verifying a file with
the same library that wrote it proves only that the library round-trips. The owner's headline
assertion is made against a known live quote with the database as the oracle: `sum(H)` is exactly
`final_amount * 10`, and per line `G * F = H` with every Rial amount ending in 0 — so a x10
applied twice to one cell and once to another cannot pass. Also asserted: the header row matches
`SALES_HEADERS` character for character through openpyxl, dates match `YYYY/MM/DD` in Latin
digits, column K is empty, a line whose product has no Asan code still exports with column D
empty, and the same selection exported twice is byte-identical.

Test data removed: `asan_export_numbers` back to **0** rows for the quote the numbering test
touched, `asan_person_code` back to **11**.

## HANDOFF STATE

All five M3 phases (3.0–3.4) are built, tested and committed, plus migration **287**, the
forward fix for the regression the gate's full suite found in phase 3.3's migration, plus the
three owner-override phases O1–O3 (migrations **288** and **289**). Tree is clean at
`004477bd`, the deployed build matches HEAD on all three signals, PostgREST has been restarted,
and the LAN database is in the state the commits describe.

**M3 mission gate — PASSED, all six items.**

| gate item | result |
|---|---|
| 1. typecheck exactly 70 | **70** |
| 2. every new module seeded for every role, *proved by query* | `asan-import` **7 rows / 7 roles**, `can_view` = `accountant,admin` exactly; **0** tables in `public` without RLS |
| 3. everything committed, tree clean | clean at `8b48c4b2` |
| 4. build + deploy, three signals match | all three `8b48c4b2`; `docker restart afrakala-lan-rest` done |
| 5. full e2e | first run **228/8/4** → found 2 real reds from migration 285, fixed by **287**; the confirming re-run came back **231 passed / 5 failed / 4 skipped** — the five documented baseline reds and **nothing else**. `business-flows/215`, documented as flaky, passed this time, which is what flaky means |
| 6. three `e2e/asan/*.spec.ts` registered | `playwright.config.ts` matches `/asan\/.*\.spec\.ts/` — covers all three |

**Finding for the owner, pre-existing and out of scope for this mission.** The same query that
proved gate item 2 shows two *older* modules are **not** seeded for every role, which is the
`has_dynamic_permission` fallback risk rule 2.5 describes: `persons` is missing
`purchase_specialist` and `site`; `warehouse` is missing `site`. Not fixed here — widening or
narrowing an existing module's access is a permission change, not a gate item, and it belongs
in its own reviewed phase.

Next action: **M4.4** (`docs/execution/M4_BUILD_EXPORT.md`) — export 2, purchase invoices — then
4.5 through 4.8, the M4 gate, then **M5** (`docs/execution/M5_VIDEO_AND_FINAL.md`), finishing
with `docs/execution/asan-final-report.md`.

The suite now totals **303** tests: 240 at the M3 gate + 5 for O2 + 8 for M4.1 + 30 for M4.2 +
20 for M4.3.

**M4 must carry these owner decisions, none of which may be re-derived or guessed:**
- **every exported amount is Toman × 10**, in integer arithmetic, because Asan expects Rial —
  and the export UI must say so visibly. The strict per-quote assertion (`T` Toman → cell
  `T*10`) is the single most important test in M4.
- bank Mellat's code is `8` (already in the database).
- sales column **K stays empty**.
- export only quotes that are **accountant-finalized AND stock-deducted** — establish the real
  signal from the data and record the evidence; do not assume `status='accepted'`.
- a product with no Asan code **still exports**, with column D empty. A person, account or
  external party with no code **blocks the whole document**. These two rules are deliberately
  different and must not be merged.
- `invoice_ar` and `other` lines block their document and name the reason; `clearing` is never
  emitted.

Blocked on: nothing technical. Three owner questions remain open in
`docs/asan/UNVERIFIED-LAYOUTS.md` (the `invoice_ar` code, the `other` account, external-party
codes); M4 must surface them in the UI and refuse to guess.

Files in flight: none.

### Original phase-3.3 brief, kept for reference
Parse
`docs/asan/reference/اشخاص.xlsx` (488 accounts) **by header text**, never by column index.
Required behaviour: staging table first, preview, commit only on explicit confirmation;
classify each row `new` / `update` / `conflict`; conflicts never auto-resolved; updates never
silently overwrite a non-empty AfraKala value; **idempotent** — a second import of the same
file must produce zero changes. Admin + accountant only, with `role_permissions` seeded for
**every** role (the `has_dynamic_permission` fallback opens unseeded modules to everyone).
Then 3.4 (products, 7 256 rows, batched, **no auto-creation of AfraKala products**), the M3
gate, M4 and M5.

Expected classification from research, to check the implementation against: 5 match by Asan
code, 4 by normalized mobile, 3 by normalized name; 6 AfraKala codes are absent from the
workbook; `کد ملی` is 0 % populated so it cannot be a match key.

Blocked on: nothing. Seven owner questions remain open in
`docs/asan/UNVERIFIED-LAYOUTS.md`; four affect financial correctness and M4 must surface them
rather than guess.
Blocked on: nothing — but seven owner questions are recorded at the end of the research
document, four of which (currency unit, Bank Mellat code, control-account codes, sales column K)
affect financial correctness and must be surfaced in the UI rather than guessed.
Files in flight: none — M2 artefacts are committed under `docs/verification/asan/`.

### M2 groundwork already done (inert, file-only)
Both reference workbooks were read and their headers verified against the brief's mapping —
it is correct: `اشخاص` AB=`کد حساب`, Z=`نام حساب`, I=`موبایل`, Y=`تلفن`, E=`کد ملی`,
X=`آدرس`; `کالا` V=`کد کالا`, S=`شرح کالا`, T=`بارکدکـالا`, U=`سریال کـالا`, Q=`واحد 1`.

Two findings that change R1.5 and R2.6 before they are written:
- **`بارکدکـالا` is 0 % populated** across all 7 256 product rows. Barcode matching, one of
  the three strategies R1.5 asks me to test, is **impossible from this export**.
- **`کد ملی` is 0 % populated** across all 488 person rows, so national id cannot be a match
  key either.
- `کد حساب` 488/488 distinct and `کد کالا` 7 256/7 256 distinct — both are clean primary keys.
- `موبایل` 342/488 filled, `تلفن` 180/488.
