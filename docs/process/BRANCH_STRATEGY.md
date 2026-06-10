# Branch Strategy Policy

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Proposed for Phase-0 governance  
Source of Truth: GitHub  
Related policies:

```text
docs/process/SOURCE_OF_TRUTH.md
docs/process/lovable-cursor-boundary.md
```

---

## 1. Purpose

This document defines the official branch strategy for AfraKala Automation Platform.

The goal is to make Lovable, Cursor, human testing, staging, production, and self-host deployment work without overwriting each other or leaking test changes into real company operations.

---

## 2. Final Decision

```text
main is the production-approved branch.
staging is the human-test candidate branch.
Lovable works on lovable/* branches by default.
Cursor works on cursor/* branches by default.
Docs/governance work uses docs/* branches.
No tool works directly on main.
```

No branch, preview, local machine, or generated output is official until the change is merged through GitHub PR review.

---

## 3. Branch Roles

| Branch pattern | Role | Owner / Tool | May deploy to production? |
|---|---|---|---|
| `main` | Official production-approved source | Human-approved GitHub merge only | Yes |
| `staging` | Human testing candidate | Human-approved merge from PRs | No |
| `lovable/*` | UI work generated or edited by Lovable | Lovable / UI reviewer | No |
| `cursor/worker-*` | Worker runtime and automation runtime work | Cursor / engineering review | No |
| `cursor/api-*` | API, OpenAPI, contract, server work | Cursor / engineering review | No |
| `cursor/db-*` | Supabase migration, RLS, RBAC work | Cursor / database review | No |
| `docs/*` | Governance, ADR, process, runbook, evidence docs | Human / docs review | No |
| `hotfix/*` | Urgent production fix | Human-approved emergency flow | Only after merge to main |

---

## 4. Required Flow

Default flow:

```text
feature branch
→ Pull Request
→ review
→ staging if human testing is needed
→ main only after acceptance
→ production update only from main
```

Allowed direct target:

```text
docs/* → main
```

Only when the PR is docs-only and has no implementation, migration, API, UI, worker, deployment, or production behavior change.

Preferred target for implementation work:

```text
lovable/* → staging → main
cursor/* → staging → main
```

---

## 5. Main Branch Rules

`main` means the latest approved version that may run in production.

Rules:

```text
No direct edits.
No direct Lovable sync.
No direct Cursor implementation.
No test-only change.
No experimental worker.
No unreviewed migration.
No preview-only UI.
```

A change may enter `main` only after:

```text
PR exists.
Scope is clear.
Boundary checklist is passed.
Tests/evidence exist when needed.
Human approval exists.
Production risk is documented.
Rollback note exists for risky changes.
```

---

## 6. Staging Branch Rules

`staging` is for human testing before production.

Rules:

```text
Staging may be unstable.
Staging must never use production database by mistake.
Staging must show a visible non-production warning in the UI.
Staging may use fake or anonymized data.
Staging must not be used by staff for real company work.
```

Staging accepts changes from:

```text
lovable/*
cursor/worker-*
cursor/api-*
cursor/db-*
docs/* when relevant
```

---

## 7. Lovable Branch Rules

Lovable must use branches like:

```text
lovable/ui-price-dashboard
lovable/ui-worker-monitor
lovable/ui-customer-credit
lovable/ui-status-banner
```

Lovable branches may change by default:

```text
src/routes/
src/components/
src/shared/components/
UI copy and layout files
```

Lovable branches must not change without explicit approval:

```text
supabase/migrations/
automation/worker-runtime/
server/
openapi/
automation/openapi/
automation/schemas/
deploy/
.env files
package manager lockfiles unless dependency change is approved
```

Lovable must not invent endpoints. If UI needs data, the API contract must exist first.

---

## 8. Cursor Branch Rules

Cursor must use branches like:

```text
cursor/worker-output-bridge
cursor/api-worker-jobs
cursor/db-driver-outputs
cursor/test-worker-runtime
cursor/refactor-pricing-contract
```

Cursor branches may change by default only inside the task scope.

Common allowed areas by branch type:

```text
cursor/worker-* → automation/worker-runtime/, automation/schemas/, tests, evidence docs
cursor/api-* → openapi/, automation/openapi/, server/, src/routes/api*, tests, evidence docs
cursor/db-* → supabase/migrations/, docs/ops/, migration evidence docs
```

Cursor must not change broad UI areas unless the task explicitly says UI.

Cursor must not add real source integrations unless the accepted task packet allows real source work.

---

## 9. Docs Branch Rules

Docs and governance branches use:

```text
docs/source-of-truth
docs/branch-strategy
docs/lovable-cursor-boundary
docs/tpc-i-evidence
```

Docs-only PRs may target `main` directly when they include no implementation.

Docs-only means:

```text
No app code.
No API implementation.
No migration.
No RLS/RBAC.
No worker runtime change.
No production deployment change.
No package/dependency change.
```

---

## 10. Hotfix Rules

Hotfix branches are only for urgent production issues.

Pattern:

```text
hotfix/<short-issue-name>
```

Rules:

```text
Hotfix must be minimal.
Hotfix must explain production impact.
Hotfix must include rollback note.
Hotfix must be merged back into staging after main if staging exists.
Hotfix must not become a hidden feature branch.
```

---

## 11. Production / Self-host Deployment Rule

Production host must run only from `main`.

```text
Production laptop/server:
branch = main
database = production database
purpose = real company work
```

Test computer must run only from `staging` or an approved test branch.

```text
Test computer:
branch = staging or approved feature branch
database = staging/test database
purpose = human testing only
```

Never connect a test branch to production database.

---

## 12. Pull Request Naming

Recommended PR title prefixes:

```text
docs(phase0): ...
feat(ui): ...
feat(worker): ...
feat(api): ...
feat(db): ...
fix(ui): ...
fix(worker): ...
hotfix(prod): ...
```

Examples:

```text
docs(phase0): define branch strategy
feat(ui): add staging environment banner
feat(worker): add controlled job claim contract
feat(api): define worker output endpoint contract
feat(db): add driver output migration
```

---

## 13. Pull Request Checklist

Every PR must answer:

```text
What branch type is this?
What boundary does this touch?
Is this docs-only, UI-only, worker-only, API-only, or database-only?
Does it need staging human testing?
Does it touch production behavior?
Does it need rollback instructions?
Does it change any contract?
Does it change any secret-sensitive file?
```

If the PR crosses multiple boundaries, split it unless an ADR or task packet explicitly approves the combined scope.

---

## 14. Stop Conditions

Stop and create a new task packet / ADR if:

```text
A Lovable branch changes worker, database, server contracts, or deployment.
A Cursor branch changes broad UI without UI scope.
A branch points staging to production database.
A PR mixes UI, database, worker, and API changes without approval.
A migration appears in a non-db branch.
A production deployment file changes without ops review.
A tool-generated change targets main directly.
```

---

## 15. Acceptance Criteria

This branch strategy is accepted when:

```text
main is protected by process.
staging is the only human-test branch.
Lovable work is isolated in lovable/* branches.
Cursor work is isolated in cursor/* branches.
Docs/governance work is isolated in docs/* branches.
Production runs only from main.
Staging never uses production data by mistake.
```

---

## 16. Final Rule

```text
Branch separates work.
Pull Request separates review.
Staging separates testing.
Main separates production.
```
