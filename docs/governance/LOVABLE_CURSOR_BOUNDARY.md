# AfraKala Phase 6 - Lovable and Cursor Boundary

Status: Active Governance Rule
Phase: 6
Scope: AfraKala platform development workflow
Source of truth: GitHub repository

---

## 1. Purpose

This document defines the exact working boundary between Lovable and Cursor for the AfraKala platform.

The goal is to prevent tool collision, hidden API drift, database damage, staging/production confusion, and uncontrolled production risk.

This document is mandatory for all work in Phase 6 and after.

---

## 2. Source of Truth

GitHub is the single source of truth for:

- Code
- Technical documentation
- Governance documents
- Branch history
- Pull Requests
- Review decisions
- Release decisions

Google Drive is allowed only for:

- Human-readable SOPs
- Training files
- PDFs
- Videos
- Archived outputs
- Review packs

Google Drive must not be used as the authoritative source for code.

Lovable must not be treated as the final source of truth.

Cursor must not be treated as the final source of truth.

All changes must return to GitHub through branches and Pull Requests.

---

## 3. Environment Boundary

Production environment:

- Branch: `main`
- Machine: server laptop
- Database: production database
- Data: real company data
- Purpose: real staff operation

Staging environment:

- Branch: `staging`
- Machine: personal test computer
- Database: staging/test database
- Data: fake or sample data only
- Purpose: human testing before production

Staging must never connect to the production database.

The staging UI must clearly show a test-environment warning banner.

---

## 4. Branch Ownership

Approved branch model:

- `main`: production only
- `staging`: human testing before production
- `lovable/ui-*`: Lovable UI work only
- `cursor/api-*`: Cursor API and OpenAPI work
- `cursor/worker-*`: Cursor worker and multi-robot work
- `cursor/db-*`: Cursor database migration work
- `cursor/docs-*`: Cursor documentation and governance work
- `hotfix/*`: emergency production fixes only

Current Phase 6 working branch:

`cursor/phase6-boundary-governance`

No direct work is allowed on `main`.

No direct experimental work is allowed on `staging`.

---

## 5. Lovable Allowed Scope

Lovable is allowed to work on:

- UI pages
- React components
- Layout improvements
- Forms
- Tables
- Visual dashboards
- RTL and Persian interface polish
- Responsive mobile design
- User-facing copy
- Empty states
- Loading states
- Error states
- Navigation and menu improvements
- UI connection to approved API contracts

Lovable may usually edit:

- `src/components/**`
- `src/routes/**`
- `src/shared/components/**`
- `src/hooks/**` only when directly related to UI behavior
- `src/lib/**` only when it is clearly UI helper logic
- `.lovable/**`

Lovable must keep changes small and reviewable.

---

## 6. Lovable Forbidden Scope

Lovable must not edit:

- `automation/**`
- `automation/worker-runtime/**`
- `automation/openapi/**`
- `openapi/**`
- `supabase/migrations/**`
- `server/**`
- `.github/workflows/**`
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `deploy/**`
- `docs/governance/**`
- `.cursor/**`
- `.env`
- `.env.*`
- secret files
- database policies
- RLS policies
- worker runtime code
- bot execution logic
- pricing engine logic
- authentication security logic

Lovable must not create API endpoints by guessing.

Lovable must not create database migrations.

Lovable must not create worker logic.

Lovable must not change production deployment settings.

If Lovable needs a backend or API change, it must stop and report the need in the Pull Request or task note.

---

## 7. Cursor Allowed Scope

Cursor is allowed to work on:

- OpenAPI contracts
- Backend/API logic
- Worker runtime
- Multi-robot architecture
- Driver SDK
- Job queue contracts
- Database migrations
- GitHub Actions
- Tests
- Type checking
- Lint and formatting
- Self-host deployment scripts
- Security rules
- Governance documents
- Technical documentation
- Refactors with clear scope

Cursor may usually edit:

- `automation/**`
- `automation/worker-runtime/**`
- `automation/openapi/**`
- `openapi/**`
- `supabase/migrations/**`
- `server/**`
- `.github/**`
- `.cursor/**`
- `docs/governance/**`
- `docs/automation/**`
- `deploy/**`
- `src/server/**`
- `src/lib/**` when related to backend/domain logic

Cursor can edit UI only when the task explicitly requires it.

---

## 8. Cursor Forbidden Scope

Cursor must not:

- Work directly on `main`
- Push directly to `main`
- Push directly to `staging` unless explicitly instructed
- Rewrite Lovable UI broadly without a clear UI task
- Create large UI redesigns inside backend tasks
- Create API endpoints without updating the OpenAPI contract
- Commit secrets
- Connect staging to production database
- Replace Lovable-generated UI without review
- Mix unrelated fixes in one task

Cursor must keep each task small, reviewable, and tied to a specific branch.

---

## 9. API Contract Rule

The API contract is the shared language between Lovable and Cursor.

Rules:

- Every new API must first be defined in an OpenAPI file.
- Cursor may implement APIs only after the contract is defined.
- Lovable may consume only approved API endpoints.
- Lovable must not invent endpoint names.
- Cursor must not change API response shapes without updating the contract.
- Any API-breaking change must be documented in the Pull Request.

Approved contract locations:

- `automation/openapi/automation-v1.yaml`
- `openapi/**` if introduced later

---

## 10. Pull Request Flow

All changes must follow this flow:

Feature branch
→ Pull Request to `staging`
→ automated checks
→ human staging test
→ Pull Request from `staging` to `main`
→ production release

Lovable flow:

`lovable/ui-*`
→ PR to `staging`
→ UI review
→ human test
→ later release to `main`

Cursor flow:

`cursor/*`
→ PR to `staging`
→ technical review
→ human test
→ later release to `main`

No tool may bypass Pull Requests for production changes.

---

## 11. Review Rules

A Pull Request must clearly state:

- What changed
- Why it changed
- Which tool created the change: Lovable or Cursor
- Which branch it came from
- Which files were touched
- Whether OpenAPI changed
- Whether database migrations changed
- Whether staging was tested
- Whether production is affected

A PR must be rejected if:

- Lovable edits forbidden backend or migration paths.
- Cursor makes broad UI changes without a UI task.
- API changes are made without OpenAPI updates.
- `.env` or secrets are committed.
- Staging is connected to production data.
- The change mixes unrelated work.
- The PR cannot be manually tested.

---

## 12. Database Safety

Production database and staging database must remain separate.

Forbidden:

- Running test work against production database
- Using production credentials in staging
- Importing real customer data into staging without anonymization
- Letting Lovable create migrations
- Letting UI work silently alter database structure

Allowed:

- Cursor-created migrations on dedicated branches
- Migration review before staging
- Migration review before production
- Fake/sample data in staging

---

## 13. Worker and Multi-Robot Boundary

Worker and multi-robot code belongs to Cursor-controlled branches.

Lovable must not edit:

- worker runtime
- driver SDK
- job queue logic
- checkpoint logic
- bot execution rules
- scraping logic
- automation safety rules

Lovable may only display worker status if the API contract already exists.

Cursor must not expose unsafe worker execution to UI without a reviewed API and safety gate.

---

## 14. Lovable Sync Rule

Lovable must work only on the approved active UI branch.

Recommended active branch:

`lovable/ui-staging`

If Cursor changes API or backend behavior, Lovable must receive those changes through GitHub branch synchronization, not through guesswork.

Safe sync path:

Cursor branch
→ PR to `staging`
→ merge into `staging` after review
→ update Lovable active branch from `staging`
→ Lovable continues UI work with the latest context

Lovable should not be pointed at `main` for experimental work.

---

## 15. Emergency Rule

Emergency production fixes must use:

`hotfix/*`

Hotfixes must be:

- small
- directly related to the production issue
- reviewed after the fact if urgent
- merged back into `staging` after production is fixed

Hotfix branches must not be used for feature development.

---

## 16. Final Rule

If there is any doubt about whether a change belongs to Lovable or Cursor:

Do not implement it immediately.

First document the needed change in the PR or task note.

Then route it to the correct branch and tool.

The purpose of this rule is to protect the AfraKala platform from tool collision, hidden API drift, database damage, and uncontrolled production risk.
