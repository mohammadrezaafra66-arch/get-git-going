# ASAN Program Progress

## Status
Current mission: **M3 (build foundation)**
Current phase: M2 complete, gate passed → starting phase 3.0
Last commit: `0dcf78e9`
Baseline typecheck: 70 (verified at the M1 gate)
Last e2e: **202 green / 5 red / 4 skip** — baseline was 155/6/4; +46 tests added by M1,
reds 6 → 5, no new red

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

## HANDOFF STATE
Next action: M3 — `docs/execution/M3_BUILD_FOUNDATION.md`, starting with phase 3.0
(formalise the four verified Asan layouts into `docs/asan/asan-layouts.md`).
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
