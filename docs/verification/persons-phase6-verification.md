# Persons Phase 6 — verification report

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
Root: `D:\AfraKalaTest\app`  
Origin: `mohammadrezaafra66-arch/get-git-going`

## Scope

Test-hardening only (no new Person capabilities, no migrations):

1. Phone Collision Browser e2e — `e2e/persons/phone-collisions-ui.spec.ts`
2. Mobile/RTL QA — `e2e/persons/mobile-rtl-qa.spec.ts`
3. Permission Matrix Regression — `e2e/persons/permission-matrix.spec.ts`
4. Phases 1–5 regression via full `e2e/persons/` + `e2e/security/persons-rls-ownership.spec.ts`

Audit: `docs/verification/persons-phase6-test-audit.md`

## Product fixes found by Phase 6 (legitimate)

| File | Why |
|---|---|
| `PageHeader.tsx` | Long titles wrap (`break-words` / `min-w-0`) — mobile overflow |
| `PersonIdentifiersForm.tsx` | Normalized values `break-all` |
| `_app.persons_.$personId_.edit.tsx` | Client `persons.update` gate + overflow |
| `_app.persons_.import.tsx` | Client admin\|manager gate (SSR deferral leak) |
| `_app.persons_.merge.tsx` | Client admin\|manager gate |

## Backend

| Check | Result |
|---|---|
| Migrations 298 / 299 / 300 on disk | Present |
| Downs `docs/verification/298\|299\|300-down.sql` | Present |
| Live `search_visible_persons` args | `p_query, p_limit, p_offset, p_kind, p_context_kinds, p_active_status, p_missing_identifier_kinds` (matches 299) |
| `person_fk_drift_report()` | **0** |
| P6 fixture leftovers (persons / identifiers / aliases / phone_collisions / customers / suppliers / external_parties) | **0** |

## Typecheck / build

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **70** (baseline) |
| `npm run build` | **green** (exit 0) |

## E2E

| Suite | Result |
|---|---|
| Phase 6A/B/C (phone-collisions + mobile-rtl + permission-matrix) | **46 passed / 1 skipped** (manager browser login) |
| Full `e2e/persons/` + `persons-rls-ownership` | **145 passed / 1 failed / 3 skipped** |
| Documented baseline red | `credit-uses-person.spec.ts` |
| New regressions | **0** |

## Cleanup

All Phase 6 prefixes verified zero leftovers; drift 0.
