# AfraKala Phase 6 - Release to Main Rules

Status: Active Governance Rule
Phase: 6
Scope: Rules for promoting staging to main
Source of truth: GitHub repository

---

## 1. Purpose

This document defines the rules for moving AfraKala changes from `staging` to `main`.

`main` is production.

No change may enter `main` unless it has passed the approved staging and review process.

The goal is to prevent:

- unreviewed changes reaching production
- Lovable UI changes bypassing staging
- Cursor backend/Worker/database changes bypassing review
- database migrations being applied without review
- Worker execution reaching production unsafely
- API changes reaching production without OpenAPI updates
- production using staging or temporary branches

---

## 2. Main Branch Rule

`main` is not a workspace.

`main` is not a test branch.

`main` is not a Lovable branch.

`main` is not a Cursor branch.

`main` is the production source.

Only reviewed and accepted changes may enter `main`.

---

## 3. Approved Release Flow

The normal release flow is:

1. Feature work happens on the correct branch family.
2. Pull Request targets `staging`.
3. GitHub checks run.
4. Human staging test is completed.
5. Changes merge into `staging`.
6. A Pull Request is opened from `staging` to `main`.
7. Final production review is completed.
8. Production server laptop pulls `main`.
9. Production is built/restarted using production environment variables.

Forbidden release flow:

- feature branch directly to `main`
- Lovable directly to `main`
- Cursor directly to `main`
- local uncommitted changes to production
- staging branch deployed as production
- production updated from temporary branches

---

## 4. Required Conditions Before Main Merge

Before merging into `main`, all must be true:

- [ ] Source branch is `staging`, unless approved `hotfix/*`.
- [ ] Target branch is `main`.
- [ ] Pull Request exists.
- [ ] GitHub checks have passed.
- [ ] CODEOWNERS review is complete when required.
- [ ] PR template is complete.
- [ ] Human staging test is complete.
- [ ] Production risk is understood.
- [ ] Rollback path is known.
- [ ] No real `.env` files are committed.
- [ ] No secret is committed.

---

## 5. API Release Rule

If API behavior changed:

- [ ] OpenAPI was updated first.
- [ ] Request shape is documented.
- [ ] Response shape is documented.
- [ ] Error responses are documented.
- [ ] UI uses the approved contract.
- [ ] Breaking changes are documented.
- [ ] Staging test confirms API behavior.

Relevant files:

- `openapi/openapi.yaml`
- `automation/openapi/automation-v1.yaml`
- `docs/governance/API_CONTRACT_RULES.md`

---

## 6. Database Release Rule

If database behavior changed:

- [ ] Migration files are included.
- [ ] Migration purpose is explained.
- [ ] RLS/security impact is reviewed.
- [ ] Migration was tested on staging first.
- [ ] Production database was not used for development testing.
- [ ] Rollback or recovery notes exist.
- [ ] Lovable did not create migration files.

Relevant paths:

- `supabase/migrations/**`
- `src/integrations/supabase/**`

---

## 7. Worker Release Rule

If Worker, automation, job, driver, bot, scraping, or messaging behavior changed:

- [ ] Worker safety boundary is documented.
- [ ] Real bot execution is explicitly approved.
- [ ] Production scraping is explicitly approved.
- [ ] Production messaging is explicitly approved.
- [ ] Output persistence/checkpoint behavior is reviewed.
- [ ] UI does not expose unsafe Worker triggers.
- [ ] Staging test confirms safe behavior.

Relevant paths:

- `automation/**`
- `automation/worker-runtime/**`
- `docs/automation/**`

---

## 8. Lovable Release Rule

If Lovable changed UI:

- [ ] Work came from `lovable/ui-staging`.
- [ ] Work was UI-only.
- [ ] Work did not touch forbidden paths.
- [ ] Work did not create API endpoints.
- [ ] Work did not create migrations.
- [ ] Work did not change Worker runtime.
- [ ] Work did not change GitHub Actions.
- [ ] Work used approved API contracts.
- [ ] Staging test passed.

---

## 9. Cursor Release Rule

If Cursor changed code/docs:

- [ ] Work came from correct `cursor/*` branch family.
- [ ] Work did not bypass staging.
- [ ] Work did not mix unrelated scopes.
- [ ] API changes updated OpenAPI.
- [ ] Database changes included review.
- [ ] Worker changes included safety boundaries.
- [ ] Governance changes are documented.
- [ ] Staging test passed when applicable.

---

## 10. Production Server Rule

Production server laptop must run only:

- branch: `main`
- environment: production
- env file: `.env.production`
- database: production database

Production server laptop must not run:

- `staging`
- `lovable/ui-*`
- `cursor/*`
- `hotfix/*` before merge
- uncommitted local changes

---

## 11. Emergency Hotfix Rule

A `hotfix/*` branch may target `main` only when:

- the issue is production-impacting
- the fix is small
- the scope is limited
- the rollback path is clear
- the change is reviewed as soon as possible
- the hotfix is back-merged into `staging`

Hotfix branches must not contain feature work.

---

## 12. Final Rule

If the release path is unclear, do not merge.

If staging was not tested, do not merge.

If production risk is unknown, do not merge.

If API/database/Worker impact is undocumented, do not merge.

If secrets or real env files are present, do not merge.

Production stability is more important than speed.
