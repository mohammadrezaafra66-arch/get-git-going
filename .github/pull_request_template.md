# AfraKala Pull Request Template

## 1. PR Identity

PR title:

-

Tool/source of change:

- [ ] Cursor
- [ ] Lovable
- [ ] Human manual edit
- [ ] Other:

Branch family:

- [ ] `lovable/ui-*`
- [ ] `cursor/api-*`
- [ ] `cursor/worker-*`
- [ ] `cursor/db-*`
- [ ] `cursor/docs-*`
- [ ] `cursor/phase6-*`
- [ ] `hotfix/*`
- [ ] Other:

Source branch:

-

Target branch:

- [ ] `staging`
- [ ] `main`
- [ ] Other:

---

## 2. Governance Confirmation

I confirm this PR follows:

- [ ] `docs/governance/LOVABLE_CURSOR_BOUNDARY.md`
- [ ] `docs/governance/BRANCH_STRATEGY.md`
- [ ] `docs/governance/LOVABLE_PROMPT_RULES.md` if Lovable is involved
- [ ] `.cursor/rules/**` if Cursor is involved

This PR must not bypass the approved branch flow.

Approved normal flow:

feature branch  
→ PR to `staging`  
→ automated checks  
→ human staging test  
→ PR from `staging` to `main`  
→ production release

---

## 3. Summary

What changed?

-

Why was this change needed?

-

What problem does it solve?

-

What is intentionally not included in this PR?

-

---

## 4. Scope Classification

Primary scope:

- [ ] UI only
- [ ] API/OpenAPI
- [ ] Backend/domain logic
- [ ] Worker/multi-robot
- [ ] Database/migration/RLS
- [ ] GitHub Actions/CI
- [ ] Governance/docs
- [ ] Deployment/self-hosting
- [ ] Hotfix

Risk level:

- [ ] Low
- [ ] Medium
- [ ] High
- [ ] Production-critical

---

## 5. Lovable Boundary Check

Complete this section if Lovable created or modified this PR.

Lovable work must be UI-only.

- [ ] This is Lovable UI work.
- [ ] Lovable worked only on the approved Lovable UI branch.
- [ ] Lovable did not work directly on `main`.
- [ ] Lovable did not work directly on `staging`.
- [ ] Lovable did not edit forbidden backend/worker/database/governance paths.
- [ ] Lovable did not invent API endpoints.
- [ ] Lovable used only approved API contracts.
- [ ] Lovable did not create database migrations.
- [ ] Lovable did not create Worker logic.
- [ ] Lovable did not change GitHub Actions.
- [ ] Lovable did not change deployment or production configuration.
- [ ] Lovable did not commit secrets or `.env` files.

If backend/API/database/Worker support is needed, describe it here:

-

---

## 6. Cursor Boundary Check

Complete this section if Cursor created or modified this PR.

- [ ] Cursor did not work directly on `main`.
- [ ] Cursor did not push directly to `main`.
- [ ] Cursor did not push directly to `staging` unless explicitly instructed.
- [ ] Cursor changes match the branch family.
- [ ] Cursor did not mix unrelated UI/backend/database/worker/governance work.
- [ ] Cursor did not create API behavior without OpenAPI update.
- [ ] Cursor did not expose unsafe Worker execution.
- [ ] Cursor did not commit secrets or `.env` files.

If Cursor touched UI, explain why it was required:

-

---

## 7. Changed Areas

Check every area touched by this PR.

UI:

- [ ] `src/components/**`
- [ ] `src/routes/**`
- [ ] `src/shared/components/**`
- [ ] `src/hooks/**`
- [ ] UI helper files

API / backend:

- [ ] `server/**`
- [ ] API route files
- [ ] backend/domain logic
- [ ] `src/lib/**` domain logic

OpenAPI:

- [ ] `automation/openapi/**`
- [ ] `openapi/**`

Worker / automation:

- [ ] `automation/**`
- [ ] `automation/worker-runtime/**`
- [ ] `docs/automation/**`

Database:

- [ ] `supabase/migrations/**`
- [ ] RLS policies
- [ ] database schema
- [ ] seed/sample data

Governance / CI / deployment:

- [ ] `.github/**`
- [ ] `.cursor/**`
- [ ] `docs/governance/**`
- [ ] `deploy/**`
- [ ] environment examples

Security-sensitive:

- [ ] auth/session/security logic
- [ ] secrets handling
- [ ] production config
- [ ] database credentials
- [ ] none of the above

---

## 8. API and OpenAPI Check

Does this PR change API behavior?

- [ ] No
- [ ] Yes

If yes:

- [ ] OpenAPI contract was updated before implementation.
- [ ] Request payload shape is documented.
- [ ] Response payload shape is documented.
- [ ] Error responses are documented.
- [ ] UI usage matches the approved contract.
- [ ] Breaking changes are clearly explained.

OpenAPI files changed:

-

Affected endpoints:

-

Compatibility notes:

-

---

## 9. Database and Migration Check

Does this PR touch database structure, RLS, migrations, or seed data?

- [ ] No
- [ ] Yes

If yes:

- [ ] Migration files are included.
- [ ] Migration purpose is explained.
- [ ] RLS/security implications are explained.
- [ ] Staging database target is confirmed.
- [ ] Production database was not used for testing.
- [ ] Rollback or recovery notes are included.
- [ ] Lovable did not create the migration.

Migration files:

-

Rollback/recovery notes:

-

---

## 10. Worker and Multi-Robot Check

Does this PR touch Worker, automation, drivers, jobs, checkpoints, or bot execution?

- [ ] No
- [ ] Yes

If yes:

- [ ] Worker safety boundary is documented.
- [ ] Real bot execution is not enabled without approval.
- [ ] No production scraping is enabled without approval.
- [ ] No production messaging is enabled without approval.
- [ ] No direct production database access is introduced.
- [ ] Output persistence/checkpoint behavior is documented.
- [ ] Tests or review evidence are included.

Affected Worker areas:

-

Safety notes:

-

---

## 11. Staging Test Checklist

Before merging to `staging`, confirm:

- [ ] App starts successfully.
- [ ] Login works.
- [ ] Target URL is staging/test URL, not production.
- [ ] Staging warning banner is visible when applicable.
- [ ] Staging database is used.
- [ ] Production database is not used.
- [ ] Main user flow still works.
- [ ] Browser console has no critical errors.
- [ ] API calls match approved contracts.
- [ ] No real company data is entered into staging unless explicitly approved and anonymized.

Manual test notes:

-

---

## 12. Production Risk Check

Does this PR affect production behavior after release?

- [ ] No
- [ ] Yes
- [ ] Unsure

If yes or unsure:

- [ ] Production risk is explained.
- [ ] Rollback plan is known.
- [ ] Environment variables are documented.
- [ ] Database impact is documented.
- [ ] User-facing impact is documented.
- [ ] Release timing is considered.

Production impact:

-

Rollback plan:

-

---

## 13. Secrets and Environment Safety

Confirm:

- [ ] No `.env` file was committed.
- [ ] No `.env.production` file was committed.
- [ ] No `.env.staging` file was committed.
- [ ] No API keys were committed.
- [ ] No database credentials were committed.
- [ ] No tokens or passwords were committed.
- [ ] Only safe `.env.example` files were changed, if any.

Environment files changed:

-

---

## 14. Review Decision Gate

This PR must be rejected if any of these are true:

- [ ] Lovable touched `supabase/migrations/**`.
- [ ] Lovable touched `automation/worker-runtime/**`.
- [ ] Lovable touched backend/domain logic without explicit approval.
- [ ] API behavior changed without OpenAPI update.
- [ ] Database changed without migration/review.
- [ ] Worker execution was enabled without safety gate.
- [ ] Secrets or real `.env` files were committed.
- [ ] Staging connects to production database.
- [ ] PR mixes unrelated work.
- [ ] PR cannot be tested.

If any item above is checked, explain why this PR should not be rejected:

-

---

## 15. Final Checklist

- [ ] Branch name matches the work type.
- [ ] Target branch is correct.
- [ ] Scope is clear.
- [ ] Changed files match the declared scope.
- [ ] Governance documents were followed.
- [ ] Tests/checks were run where applicable.
- [ ] Staging test notes are included where applicable.
- [ ] Production risk is understood.
- [ ] This PR is ready for review.
