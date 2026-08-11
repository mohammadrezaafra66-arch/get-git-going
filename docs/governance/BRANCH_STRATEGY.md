# AfraKala Phase 6 - Branch Strategy

Status: Active Governance Rule
Phase: 6
Scope: GitHub branch model for Lovable and Cursor coordination
Source of truth: GitHub repository

---

## 1. Purpose

This document defines the approved branch strategy for the AfraKala platform.

The goal is to keep these areas separated:

- production work
- staging test work
- Lovable UI work
- Cursor API work
- Cursor Worker work
- Cursor database work
- Cursor governance work

This document must be used together with:

- `docs/governance/LOVABLE_CURSOR_BOUNDARY.md`

---

## 2. Core Branches

### `main`

`main` is the production branch.

Rules:

- Production only.
- Runs on the server laptop.
- Connects only to the production database.
- Must not receive direct experimental commits.
- Must be updated only after staging review.
- Lovable must not work directly on `main`.
- Cursor must not work directly on `main`.

Allowed source:

- Pull Request from `staging`
- Approved emergency `hotfix/*`

---

### `staging`

`staging` is the human testing branch.

Rules:

- Used for testing before production.
- Runs on the personal test computer.
- Connects only to the staging/test database.
- Must never connect to the production database.
- Must show a visible test-environment warning banner.
- Receives reviewed work from Lovable and Cursor branches.

Allowed sources:

- `lovable/ui-*`
- `cursor/api-*`
- `cursor/worker-*`
- `cursor/db-*`
- `cursor/docs-*`
- `cursor/phase6-*`
- `hotfix/*` after production back-merge

---

## 3. Lovable Branches

Pattern:

`lovable/ui-*`

Examples:

- `lovable/ui-staging`
- `lovable/ui-pricing-page`
- `lovable/ui-dashboard-polish`
- `lovable/ui-mobile-navigation`

Allowed work:

- UI pages
- React components
- Layout
- Forms
- Tables
- Dashboards
- RTL/Persian UI polish
- Responsive design
- Loading states
- Empty states
- Error states
- Navigation and menus
- UI connection to approved API contracts

Forbidden work:

- Database migrations
- Worker runtime
- Backend business logic
- API endpoint creation by guessing
- GitHub Actions
- Deployment scripts
- Secrets
- Production configuration
- Governance rules

Merge target:

- `staging`

Never merge directly to:

- `main`

---

## 4. Cursor Branches

### `cursor/api-*`

Used for:

- OpenAPI contracts
- API implementation
- API validation
- API documentation
- API tests

Rules:

- Every new API must be defined in OpenAPI first.
- API response shape changes must update the contract.
- Lovable must consume only approved API endpoints.

Merge target:

- `staging`

---

### `cursor/worker-*`

Used for:

- Worker runtime
- Multi-robot architecture
- Job queue contracts
- Driver SDK
- Checkpoint logic
- Output persistence
- Bot execution boundaries
- Safety gates
- Worker tests

Forbidden:

- Broad UI redesign
- Lovable UI replacement
- Real production bot execution without safety approval
- Direct production database access from test code

Merge target:

- `staging`

---

### `cursor/db-*`

Used for:

- Supabase migrations
- Database schema changes
- RLS policy changes
- Indexes
- Seed/sample data for staging
- Migration documentation

Rules:

- Migrations must be reviewed before staging.
- Migrations must be reviewed again before production.
- Lovable must not create database migrations.
- Staging migrations must not use production credentials.

Merge target:

- `staging`

---

### `cursor/docs-*`

Used for:

- Governance documents
- Runbooks
- SOPs
- Architecture notes
- Process rules
- Review checklists
- Cursor/Lovable operating rules

Merge target:

- `staging`

---

### `cursor/phase6-*`

Used only for Phase 6 governance.

Current Phase 6 branch:

`cursor/phase6-boundary-governance`

Allowed work:

- Lovable/Cursor boundary rules
- Branch strategy
- Cursor rules
- Lovable prompt rules
- PR template
- CODEOWNERS
- Boundary guard GitHub Actions
- Staging/production runbooks

Forbidden work:

- New product features
- Real bot execution
- Torob/WhatsApp implementation
- Pricing feature expansion
- UI redesign not related to governance

Merge target:

- `staging`

---

## 5. Hotfix Branches

Pattern:

`hotfix/*`

Used only for urgent production fixes.

Rules:

- Must be small.
- Must fix one urgent production problem.
- Must not include feature work.
- Must not include broad refactors.
- Must be merged back into `staging` after production is fixed.

Allowed targets:

- `main` for emergency fix
- `staging` for back-merge

---

## 6. Standard Development Flow

Normal flow:

1. Create a feature branch from `staging`.
2. Work in the correct branch family.
3. Push the feature branch to GitHub.
4. Open a Pull Request to `staging`.
5. Run automated checks.
6. Perform human staging test.
7. Merge into `staging`.
8. Open a Pull Request from `staging` to `main`.
9. Release to production only after review.

---

## 7. Lovable Flow

Lovable flow:

`lovable/ui-*`
→ Pull Request to `staging`
→ UI review
→ human staging test
→ later release through `staging` to `main`

Lovable must not:

- work directly on `main`
- use production as an experiment
- create backend code
- create database migrations
- create worker logic
- invent API endpoints

If Lovable needs backend support, it must stop and report the need.

---

## 8. Cursor Flow

Cursor flow:

`cursor/*`
→ Pull Request to `staging`
→ technical review
→ automated checks
→ human staging test
→ later release through `staging` to `main`

Cursor must not:

- work directly on `main`
- push directly to `staging` unless explicitly instructed
- mix unrelated backend, UI, database, and governance work
- create APIs without OpenAPI updates
- commit secrets

---

## 9. Production Release Flow

Production release flow:

`staging`
→ Pull Request to `main`
→ final review
→ production release on server laptop

Before release:

- staging must be tested
- database target must be verified
- environment variables must be checked
- OpenAPI changes must be reviewed
- migration changes must be reviewed
- UI changes must be reviewed
- Worker changes must be reviewed
- rollback plan must be known

---

## 10. Forbidden Actions

Forbidden:

- Direct commits to `main`
- Direct experimental commits to `staging`
- Lovable work on `main`
- Cursor experimental work on `main`
- Running staging against production database
- Committing `.env` or secrets
- Creating API endpoints without OpenAPI updates
- Letting Lovable create database migrations
- Letting Worker changes merge without safety review
- Mixing unrelated features in one branch

---

## 11. Branch Naming Rules

Recommended patterns:

- `lovable/ui-<short-purpose>`
- `cursor/api-<short-purpose>`
- `cursor/worker-<short-purpose>`
- `cursor/db-<short-purpose>`
- `cursor/docs-<short-purpose>`
- `cursor/phase6-<short-purpose>`
- `hotfix/<production-issue>`

Bad names:

- `changes`
- `fix`
- `test`
- `new`
- `work`
- `update`
- `final`
- `final2`

A branch name must show:

- owner/tool
- area
- purpose

---

## 12. Review Rules

Every Pull Request must answer:

- Which branch does this come from?
- Which branch does this target?
- Is this Lovable work or Cursor work?
- Is this UI-only?
- Does this touch backend/API?
- Does this touch OpenAPI?
- Does this touch database migrations?
- Does this touch Worker or automation?
- Does this affect production?
- Was staging tested?

Reject examples:

- `lovable/ui-*` touching `supabase/migrations/**`
- `lovable/ui-*` touching `automation/worker-runtime/**`
- `cursor/worker-*` making broad UI redesigns without approval
- API behavior changes without OpenAPI updates

---

## 13. Staging Sync Rule

`staging` is the shared integration branch.

Before starting work:

- fetch latest GitHub state
- checkout the correct branch
- pull with fast-forward only
- confirm working tree is clean
- create or update the feature branch from the approved base

Lovable active branch must receive backend/API updates through GitHub branch synchronization, not by guessing.

---

## 14. Main Safety Rule

`main` is not a workspace.

`main` is not a test branch.

`main` is not a Lovable branch.

`main` is not a Cursor branch.

`main` is the production source.

Any process that treats `main` as an experiment is unsafe for AfraKala.

---

## 15. Final Rule

When in doubt, do not merge.

First identify:

- the correct branch family
- the correct target branch
- whether OpenAPI is affected
- whether database is affected
- whether staging has been tested
- whether production risk exists

The goal is to make AfraKala development predictable, reviewable, and safe while using both Lovable and Cursor.
