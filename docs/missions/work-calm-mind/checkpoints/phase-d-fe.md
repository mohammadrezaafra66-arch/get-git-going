# Phase D FE — Taxonomies client + settings UI + select wiring

**Agent:** dev-frontend-engineer  
**Branch:** `feature/work-calm-mind`  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**HEAD_start:** `16c83608754206c097e27cd898604a468b3315ee`  
**deadline_at:** 2026-09-16T06:50:00+05:00  
**status:** COMPLETE (pending commit SHA fill)

## Heartbeat
- 03:39 — HEAD 16c83608; branch feature/work-calm-mind; migration 551 present (not edited)
- 03:42 — baseline `npm run typecheck` → EXIT=2, error_count=70
- 03:43 — `src/lib/work/taxonomies.ts` + export from `index.ts`
- 03:45 — settings page + route `/operations/work/settings` (admin|manager)
- 03:47 — TaxonomySelect wired into CreateWorkWizard confirm + WorkBoardPage group filter
- 03:48 — registry + primary-modules nav; `router-cli generate` EXIT=0
- 03:50 — unit surface test EXIT=0; typecheck after EXIT=2 OWNED_HITS=0

## How to open UI
1. Sign in as **admin** or **manager**.
2. Open `/operations/work/settings` (or تابلو → «طبقه‌بندی»).
3. Tabs: گروه‌ها / بخش‌ها / برچسب نوع — add, toggle active, sort_order, soft delete.
4. On board / create wizard: group (and wizard section) Select from active taxonomies; «سایر…» for free text.

## Files changed

| File | Role |
| --- | --- |
| `src/lib/work/taxonomies.ts` | NEW — listActive / list / create / update / softDelete |
| `src/lib/work/taxonomies.test.ts` | NEW — export surface smoke |
| `src/lib/work/index.ts` | Re-export taxonomies API |
| `src/components/work/WorkTaxonomiesSettingsPage.tsx` | NEW — RTL CRUD; `data-testid=work-taxonomies-settings` |
| `src/components/work/TaxonomySelect.tsx` | NEW — Select + «سایر» free-text |
| `src/routes/_app.operations.work_.settings.tsx` | NEW — requireAnyRole(admin\|manager) |
| `src/routeTree.gen.ts` | Generated `/operations/work/settings` |
| `src/components/work/CreateWorkWizard.tsx` | Confirm step: group/section from taxonomies |
| `src/components/work/WorkBoardPage.tsx` | Group filter from taxonomies + settings link |
| `src/lib/navigation/registry.ts` | Nav + ROLE_ALLOWLIST settings |
| `src/components/layout/primary-modules.ts` | Dashboard paths include settings |
| `docs/missions/work-calm-mind/checkpoints/phase-d-fe.md` | This checkpoint |

**Not changed:** migration 551, Phase E polish (morning cards, FAB, etc.)

## Pattern followed
- Table cast: `(supabase as any).from("work_taxonomies")` — same as `topics.ts` / `testReports.ts`
- Flat work route: `work_.settings` like `work_.topics`
- Gate: `requireAnyRole(["admin","manager"])` — mutations match RLS insert/update
- Soft-delete: `deleted_at` + no `.select()` after (SELECT RLS hides deleted rows)

## Evidence

### Baseline (before) E3
- HEAD `16c83608`
- `npm run typecheck` → EXIT=2, 70 errors (`_phase-d-fe-baseline-typecheck.*`)
- `git show HEAD:src/lib/work/taxonomies.ts` → path not in HEAD
- `git show HEAD:src/components/work/WorkTaxonomiesSettingsPage.tsx` → path not in HEAD
- Wizard confirm used free-text `Input` for group/section

### After (E3 + E4)
- `npx @tanstack/router-cli@1.167.36 generate` → EXIT=0; routeTree has `/operations/work/settings`
- `npx tsx --test src/lib/work/taxonomies.test.ts` → EXIT=0, 1 pass
- `npm run typecheck` → EXIT=2, 70 errors, **OWNED_HITS=0**
- Files present with TaxonomySelect / `work-taxonomies-settings` / listActiveTaxonomies call sites

### data-testid hooks
- `work-taxonomies-settings`, `work-wizard-group`, `work-wizard-section`

## Unverified
- Live browser e2e against real RLS / seed rows
- Soft-delete round-trip on live DB
- Sales role redirected from settings (route guard only)

## Out-of-scope recommendations
- Wire `kind_label` taxonomies into kind Select (still uses enum labels)
- Detail page group/section Inputs → TaxonomySelect
- Playwright for settings CRUD

## Commit / push
- **commit:** _(filled after commit)_
- **pushed:** _(filled after push)_
