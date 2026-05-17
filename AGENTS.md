# AGENTS.md — AfraKala Development Rules

This repository belongs to the AfraKala smart assistant project.

Before any change, read:
- docs/AFRAKALA_ACCEPTANCE_CRITERIA.md
- README.md
- .lovable/plan.md if present

## Mandatory principles

1. Keep the project self-hostable on Linux + Docker + Supabase Self-host.
2. Do not add critical dependency on CDN, online fonts, external APIs, or non-self-hostable cloud services.
3. External integrations must be optional, feature-flagged, server-side secret safe, and have manual fallback.
4. Never commit real secrets, .env files, service role keys, JWT secrets, passwords, certificates, backups, dumps, or storage exports.
5. No server secret may use VITE_ prefix.
6. Frontend-only authorization is not acceptable.
7. Sensitive features require UI guard, route/server guard, and database RLS/RBAC/backend permission.
8. Database changes require timestamped migrations.
9. Sensitive tables require RLS.
10. Sensitive actions require audit logs.
11. Large queries require limit, pagination, indexes, and debounced search/filter.
12. UI must remain Persian, RTL, mobile-first, and responsive.
13. Fonts and critical assets must be local.
14. Do not create parallel modules, routes, tables, services, hooks, or components if an existing implementation exists.
15. Do not redesign architecture, rename tables/fields, delete code, or refactor broadly unless explicitly approved.
16. Keep every change small, incremental, low-risk, and testable.

## Phase rule

Phase 1 architecture is already implemented/stabilizing.
Future work must extend existing architecture.

Any customer, supplier, account party, receiver, driver, referrer, marketer, representative, complainant, return-related person, staff member, or credit-related person belongs to Phase 2: unified persons core. Do not create separate person systems.

## Verification

For code changes, run and report:
- npm run build
- npm run lint
- typecheck if an independent script exists
- relevant tests if available
- manual test path if UI changed

If a script does not exist, report that explicitly. Do not claim it passed.

## Required delivery report

Every delivery must include:
- Files inspected
- Files changed
- Why each file changed
- Migration impact
- RLS/RBAC impact
- Audit log impact
- Build/lint/typecheck/test results
- Manual test path
- Self-Host Acceptance Check
- Remaining risks