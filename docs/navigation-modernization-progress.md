# Navigation Modernization Progress

Date: 2026-07-23
Branch: feature/navigation-modernization
Starting commit: a22e0984
Host: Windows LAN development host
Base URL: http://192.168.170.8:3100
Test route: /sales/search

## Runtime

Frontend container: afrakala-lan-web
Frontend image: afrakala-app:lan
Runtime mechanism:

```powershell
cd D:\AfraKalaTest\app\deploy\lan
docker compose --env-file .env.lan build web
docker compose --env-file .env.lan up -d web
```

Port 3100 is published by afrakala-lan-web as 0.0.0.0:3100->3000/tcp.

## Stage A Verification

Read-only database checks only. No database write was executed.

- public.staff_daily_performance_metrics: present
- public.dynamic_scoring_parameters counts: customer=10, salesperson=6
- public.v_dynamic_customer_capital_balances: present
- public.v_dynamic_salesperson_capital_balances: present

## Stage B Repository Baseline

Repository root: D:/AfraKalaTest/app
Current branch: feature/navigation-modernization
Remote: origin https://github.com/mohammadrezaafra66-arch/get-git-going.git

Existing untracked files recorded and left untouched:

- .claude/
- docs/execution/AfraKala-continuation-after-audit.md
- docs/research/AfraKala-data-gamification-rag.md
- docs/execution/AfraKala-navigation-codex-FINAL.md
- docs/execution/AfraKala-weight-fix-continuation.md
- docs/AfraKala-fix-weight-validity.md
- supabase/migrations/20260722230000_142_fix_weight_validity_month_start.sql

## Baseline Commands

`npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` fail locally before running their tools because Bun-generated `.bin` shims are still corrupted.

Repair attempts:

- `bun install --force`: failed in `workerd` postinstall.
- `bun install --force --ignore-scripts`: succeeded, but npm script shims still fail.

Direct validation entrypoints:

- Typecheck: `node .\node_modules\typescript\bin\tsc --noEmit --pretty false`
  - exit code: 2
  - TypeScript error count: 70
  - classification: baseline, zero new navigation errors at start
- Lint: `node .\node_modules\eslint\bin\eslint.js .`
  - exit code: 1
  - problems: 1286 total, 869 errors, 417 warnings
  - classification: baseline formatting/lint debt before navigation edits
- Build: `node .\node_modules\vite\bin\vite.js build`
  - exit code: 0
  - result: pass
- Test script: none exists in package.json.

## Stage B Smoke Gate

- /gamification/admin/manual-metrics: 200
- /accounting/receipts/create: 200
- /sales/invoices: 200
- /sales/search: 200
- /knowledge: 200
- /this-route-does-not-exist-xyz: 404

## Known Risks

- Local npm script wrappers are broken by Bun remap issues. Use direct Node entrypoints for validation unless repaired later.
- Lint has a large pre-existing baseline and must be compared against touched files rather than claimed clean.
- Typecheck baseline is 70 errors.
- Existing untracked docs and one migration belong to other work and must not be staged or modified by navigation phases.
- No database migration may be created or applied during this navigation task.

## Stage C Audit Before Phase 1

Existing search findings:

- The desktop Sidebar already has an inline Persian search input with a visible `Ctrl K` badge.
- That search is not a command palette. No global `Ctrl+K` command dialog is wired.
- Existing Sidebar search matches only the visible item label through `normalizeSearchText`.
- `cmdk` and shadcn `Command` components exist, but are used in forms/selectors, not as global navigation.

Scope decision:

- Phase 4 should improve the existing Sidebar search instead of replacing it.
- Phase 9 should add the actual global command palette because no global palette exists.

## Stage C Phase 1

Commit pending at this checkpoint.

Changes:

- Added `src/lib/navigation/types.ts`.
- Added `src/lib/navigation/registry.ts`.
- Added `src/lib/navigation/selectors.ts`.
- Added `src/lib/navigation/search.ts`.
- Converted `src/components/layout/nav-items.ts` into a compatibility adapter derived from `NAVIGATION_REGISTRY`.

Registry invariant checks:

- route count: 97
- duplicate routes: none
- duplicate generated IDs: none
- `NAV_ITEMS` derived from Registry: yes
- manual `NAV_ITEMS` array retained: no

Validation:

- touched-file eslint: pass
- typecheck: 70 baseline errors, no new errors
- build: pass

Notes:

- No route URL changed.
- No route guard changed.
- No permission was broadened.
- No migration was created or applied.
- Existing UI should remain visually unchanged in Phase 1.

## Resume Point

Resume at Stage C Phase 2.

## Stage C Phase 2 Guard Audit

User-directed mismatch fix:

- `/sales/credit-rules` navigation visibility was narrowed to `admin` and `accountant`.
- The route guard remains unchanged: `requireAnyRole(["admin", "accountant"])`.
- No guard was widened.

Additional Registry audit:

- Added route-level allowlists for Registry entries guarded by stricter `requireAdmin` or `requireAnyRole` checks.
- Added action overrides for Registry entries that point directly at create/update screens:
  - `/products/new`: `products:create`
  - `/pricing/purchase-prices`: `pricing:create`
  - `/pricing/recompute-prices`: `pricing:update`
- Automated audit result:
  - Registry entries scanned: 97
  - Registry routes matched to direct route guards: 95
  - Guard/navigation mismatches: 0
  - Two parser misses were manually verified:
    - `/sales/invoices`: route literal uses a TanStack path group and guards `invoices:view`.
    - `/sales/customers`: route literal uses a TanStack path group and guards `sales:view`.

No route guard, route URL, business logic, database object, or migration was changed.

Phase 2 validation after mismatch fix:

- touched-file eslint: pass
- guard/navigation audit: 0 mismatches
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 3

Changes:

- Added a Registry-driven primary action selector.
- Added deterministic multi-role precedence: admin, manager, accountant, sales, viewer.
- Rendered the primary action near the top of the Sidebar.
- Kept the action permission-filtered through the shared navigation selector.
- Added collapsed-sidebar support through an icon button and tooltip.

Validation:

- touched-file eslint: pass
- primary-action invariant check: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 4

Scope finding:

- The existing Sidebar search was improved rather than replaced.
- The global command palette remains Phase 9 scope.

Changes:

- Sidebar search now uses `searchNavigationEntries`.
- Results are still permission-filtered through visible Registry entries only.
- Search now ranks title, keywords, description, and route aliases instead of matching label text only.
- Existing normalization already covered Persian/Arabic digits, ZWNJ, whitespace, diacritics, and Arabic/Persian letter variants.

Validation:

- targeted search check: pass
- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 5

Changes:

- Added a typed Needs Action source abstraction.
- Added compact Sidebar rendering for up to three actionable entries.
- Added real sources only:
  - pending users
  - unhealthy pricing recompute queue
- Kept zero-count sources hidden.
- Kept source resolution permission-aware through Registry visibility.
- Removed polling from the pricing queue Sidebar query.
- Did not create any migration or backend object.

Validation:

- needs-action resolver check: pass
- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 6

Changes:

- Added localStorage-backed Favorites with key `afrakala.navigation.favorites.v1`.
- Stored stable Registry IDs only.
- Capped favorites at five.
- Removed duplicates, ignored invalid IDs, and hid inaccessible entries.
- Added keyboard-accessible pin/unpin controls on Sidebar rows.
- Rendered `My Shortcuts` only when at least one accessible favorite exists.
- No migration or backend persistence was added.

Validation:

- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 7

Changes:

- Added localStorage-backed Recent destinations with key `afrakala.navigation.recent.v1`.
- Stored stable Registry IDs only.
- Recorded exact Registry routes only; query strings and dynamic detail URLs are never persisted.
- Deduplicated entries, capped the list at five, and filtered by current permissions.
- Ignored entries marked `recentEligible=false`.
- Rendered a compact Recent section only when there is something useful to show.

Validation:

- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 8

Changes:

- Added a route metadata resolver for title, short title, description, module, group, analytics key, and breadcrumbs.
- Static Registry routes resolve exactly.
- Dynamic child routes use generic safe labels and never expose raw IDs.
- Added a compact breadcrumb strip in the app shell without replacing or duplicating page `PageHeader` content.
- Corrected the sales primary-role mapping to point at the existing Registry route `/sales`.

Validation:

- metadata resolver check: pass
- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage C Phase 9

Scope finding:

- No global command palette existed before this phase.
- Existing Sidebar `Ctrl K` text was only a visual affordance near the inline search input.

Changes:

- Added a Ctrl+K / Cmd+K command palette using existing shadcn `CommandDialog` / `cmdk`.
- The shortcut does not fire while typing in inputs, textareas, selects, or contenteditable fields.
- Commands are navigation-only and permission-filtered through Registry visibility.
- Search reuses the Phase 4 Registry search.
- Palette includes Favorites, Recent, and suggested navigation groups.
- No destructive commands, raw database actions, dynamic sensitive detail routes, or placeholder commands were added.

Validation:

- touched-file eslint: pass
- typecheck: 70 baseline errors, no new navigation errors
- build: pass

## Stage D Runtime Validation

Build/deploy:

- Stamped local LAN build metadata:
  - `GIT_SHA=18d2f417`
  - `BUILD_TIME=2026-07-23T07:24:48Z`
- Rebuilt LAN web image with Docker Compose.
- Restarted `afrakala-lan-web`.
- Restarted `afrakala-lan-rest`.
- Confirmed `afrakala-lan-web` is healthy.
- Confirmed REST endpoint returns 200 through Kong/PostgREST.

HTTP smoke checks:

- `/gamification/admin/manual-metrics`: 200
- `/accounting/receipts/create`: 200
- `/sales/invoices`: 200
- `/sales/search`: 200
- `/knowledge`: 200
- `/sales/credit-rules`: 200
- `/accounting/dynamic-capital`: 200
- `/this-route-does-not-exist-xyz`: 404

Runtime logs:

- Web logs: no fatal/error/schema-cache/missing-relation matches in the checked window.
- PostgREST logs: normal schema-cache reload observed; no missing relation error found.

Browser automation:

- No Playwright/Cypress app smoke script was found in `package.json`.
- Remaining visual checks require a logged-in user:
  - desktop Sidebar expanded/collapsed
  - seven module order
  - active route highlight
  - primary action
  - Needs Action
  - Favorites add/remove
  - Recent list
  - breadcrumb strip
  - Ctrl+K palette open/search/Escape/navigate
  - mobile bottom navigation

Regression note:

- Navigation phase commits did not create a migration and did not edit `src/routeTree.gen.ts`.
- A separate non-navigation commit appeared in the branch history during the session:
  - `26d0d2a8 fix(scoring): align weight validity dates with month-start period semantics`
  - It adds `supabase/migrations/20260722230000_142_fix_weight_validity_month_start.sql`.
  - This was not part of the navigation work and was not staged by the navigation phase commits.

## Stage D Refresh After Branch Continuation

Date: 2026-07-24
Branch: feature/navigation-modernization
Validated HEAD: `35216bb0`
Required test route: `/gamification/admin/manual-metrics`

Scope:

- Phase 1 through Phase 9 were already implemented in earlier commits and remained intact.
- This continuation completed the local validation/reporting pass only.
- No Registry, route guard, permission, business logic, SQL migration, or live database data was changed.
- Known unrelated untracked local artifacts were left untouched and unstaged.

Validation commands:

- `npm.cmd run typecheck`
  - exit code: 1
  - TypeScript error count: 70
  - classification: existing baseline, no new navigation validation errors introduced by this pass
- `npm.cmd run lint`
  - exit code: 1
  - result: `1289 problems (872 errors, 417 warnings)`
  - classification: existing branch lint debt; this documentation-only pass did not add lintable source files
- `npm.cmd run build`
  - exit code: 0
  - result: pass
- Package test script:
  - none exists in `package.json`

Local LAN rebuild:

- Stamped local LAN build metadata:
  - `GIT_SHA=35216bb0`
  - `BUILD_TIME=2026-07-23T22:04:03Z`
- Rebuilt `afrakala-lan-web`.
- Recreated/restarted `afrakala-lan-web`.
- Restarted `afrakala-lan-rest`.
- Confirmed the running web container exposes the stamped metadata above.

HTTP smoke checks after rebuild:

- `/`: 200
- `/gamification/admin/manual-metrics`: 200
- `/sales/search`: 200
- `/knowledge`: 200
- `/this-route-does-not-exist-xyz`: 404

Runtime logs after rebuild:

- Web logs: no fatal/error/schema-cache/missing-relation matches in the checked tail.
- PostgREST logs: current schema cache reload was observed; no current missing relation/schema-cache failure was found in the checked tail. Historical startup retry lines from an older timestamp were not caused by this validation pass.

Browser automation:

- Attempted to start the in-app browser automation runtime.
- The Node REPL browser bridge failed before page control due to a local filesystem permission error while resolving `C:\Users\AFRA\AppData`.
- Result: interactive browser QA was not completed in this pass.
- Manual logged-in QA remains required for visual and permission-sensitive behavior.

Final documentation produced by this pass:

- `docs/navigation-modernization-manual-test.md`
- `docs/navigation-modernization-final-report.md`
