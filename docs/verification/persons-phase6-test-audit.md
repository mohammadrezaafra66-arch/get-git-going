# Persons Phase 6 — test audit (read-only)

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
HEAD at audit: `e6723c5e`  
Root: `D:\AfraKalaTest\app` (primary worktree; sibling `afrakala-deploy-sidebar` detached, unused)

## Root / worktree verification

| Check | Result |
|---|---|
| `Get-Location` | `D:\AfraKalaTest\app` |
| `git rev-parse --show-toplevel` | `D:/AfraKalaTest/app` |
| Branch | `feature/navigation-modernization` |
| Origin | `https://github.com/mohammadrezaafra66-arch/get-git-going.git` |
| Worktree | Primary at `D:\AfraKalaTest\app` |
| Verdict | SAFE — proceed |

## Current Persons test inventory (`e2e/persons/`)

| Spec | Coverage |
|---|---|
| `person-profile.spec.ts` | Phase 1 profile / مشاهده / roles |
| `search-visible-persons.spec.ts` + `search-ui.spec.ts` | Phase 2 JWT + UI search |
| `filters-visible-persons.spec.ts` + `filters-ui.spec.ts` | Phase 3 JWT + UI filters |
| `aliases-crud.spec.ts` + `aliases-ui.spec.ts` | Phase 4 alias RLS + UI |
| `profile-dossier-jwt.spec.ts` + `profile-dossier-ui.spec.ts` | Phase 5 dossier |
| `merge-ui.spec.ts` + `merge-ui-guard.spec.ts` | Merge review |
| create/edit/normalize/forms/links/credit… | Integration / regression |
| `credit-uses-person.spec.ts` | **Documented baseline red** |

Related: `e2e/asan/phone-normalization.spec.ts` (API only, not `/admin/phone-collisions` UI), `e2e/security/persons-rls-ownership.spec.ts`, `e2e/security/viewer-restrictions.spec.ts`.

## Untested / thin browser paths

- `/admin/phone-collisions` UI (resolve/ignore, badges, empty, no-merge)
- Cross-role browser denial matrix for phone-collisions / merge / import / asan-import
- Mobile viewports **390×844** and **430×932** on persons routes
- Document-level overflow on list/merge/import/asan-import/phone-collisions
- Permission matrix that pairs UI + PostgREST for all actors in one place
- Manager browser (no `manager.storage.json`; API via `userWithRole` only)

## Role coverage gaps

Storage states available: admin, accountant, salesperson-a/b. Viewer via live login (`test.viewer@afrakala.local`). Manager/purchase_specialist/site: JWT when present; browser login opportunistic.

Phone-collisions route guard: **admin + manager only**. RLS SELECT also allows accountant — UI must still deny accountant (route guard stricter than RLS).

## Mobile / RTL gaps

Partial: aliases-ui 375, filters-ui mobile, profile-dossier 320/375 (main overflow). Missing: list/edit/merge/import/asan-import/phone-collisions at 320/375/390/430 with `documentElement` overflow gate.

## Known baseline red

- `e2e/persons/credit-uses-person.spec.ts` — credit page figure mismatch (documented Phases 1–5).

## Flaky / harness notes

- Do not run interactive `save-admin-session.spec.ts` headless.
- Playwright browsers path on this host: `C:\Users\AFRA\AppData\Local\ms-playwright`.
- PowerShell `$` in filenames needs escaping when staging git paths.

## Cleanup risks

Fixtures must use `E2E_PREFIX` / Phase 6 tag and delete: persons, identifiers, aliases, context links, merge candidates, phone_collisions, customers/suppliers/external_parties, audit_logs by entity. Never leave collision phones that poison ASAN M3.2 “three predicted collisions” assertions.

## Phase 6 plan

A. Phone collision browser e2e  
B. Mobile/RTL QA matrix  
C. Permission matrix (UI + JWT)  
D. Full `e2e/persons/` + security ownership + typecheck 70 — no new product features
