# AfraKala Phase 6 - Staging and Production Runbook

Status: Active Governance Rule
Phase: 6
Scope: Self-hosted staging and production separation
Source of truth: GitHub repository

---

## 1. Purpose

This runbook defines how AfraKala must separate the production web app from the staging/test web app.

The goal is to prevent:

- test work affecting real company data
- staff using the wrong web app for real operations
- staging connecting to production database
- production running unreviewed code
- Lovable or Cursor changes bypassing staging
- environment secrets being committed to GitHub
- unclear release ownership between machines

This runbook is mandatory for all self-hosted execution and release work.

---

## 2. Environment Definitions

AfraKala must operate with at least two separate environments:

1. Production
2. Staging

Production is the real company environment.

Staging is the human test environment before production.

These two environments must have separate:

- branch
- machine
- URL
- database
- environment variables
- user/data purpose
- operational meaning

---

## 3. Production Environment

Production is the real operational version of AfraKala.

Required production rules:

- Branch: `main`
- Machine: server laptop
- Database: production database
- Data: real company data
- Users: real company staff
- Purpose: real business operation
- URL: production URL or production LAN address
- Environment file: `.env.production`
- Example file in GitHub: `.env.production.example`

Production must not run from:

- `staging`
- `lovable/ui-*`
- `cursor/*`
- `hotfix/*` before merge approval
- any temporary branch

Production must not use:

- fake data
- staging database
- test credentials
- experimental APIs
- unreviewed Worker behavior
- unreviewed Lovable UI work

---

## 4. Staging Environment

Staging is the test version of AfraKala before production.

Required staging rules:

- Branch: `staging`
- Machine: personal test computer
- Database: staging/test database
- Data: fake, sample, or anonymized data only
- Users: testers only
- Purpose: human testing before production
- URL: local test URL or staging LAN address
- Environment file: `.env.staging`
- Example file in GitHub: `.env.staging.example`

Staging must not use:

- production database
- production credentials
- real customer data unless explicitly anonymized
- real staff operation as if it were production
- production messaging or real bot execution

---

## 5. Mandatory Visual Staging Warning

The staging web app must clearly show a warning banner.

Required meaning:

`TEST ENVIRONMENT - DATA IS NOT REAL`

Persian equivalent:

`⚠️ محیط تست افراکالا - اطلاعات این بخش واقعی نیست`

The warning must be visible enough that staff cannot confuse staging with production.

Recommended placement:

- top app shell
- login page
- dashboard
- shared layout

The staging banner must not be hidden behind a menu.

---

## 6. Database Separation Rule

Production database and staging database must be separate.

Forbidden:

- staging using production database URL
- production using staging database URL
- test users entering real operational data into staging
- importing real customer data into staging without anonymization
- running migrations against production before review
- sharing `.env.production` with the staging machine
- committing any real `.env` file to GitHub

Allowed:

- fake/sample data in staging
- anonymized data in staging when explicitly approved
- reviewed migrations on staging before production
- safe `.env.*.example` files in GitHub

---

## 7. Environment File Rules

The following files are allowed in GitHub:

- `.env.example`
- `.env.staging.example`
- `.env.production.example`

The following files are forbidden in GitHub:

- `.env`
- `.env.local`
- `.env.staging`
- `.env.production`
- `.env.development`
- `.env.test`
- any file containing real credentials, API keys, tokens, database passwords, or service role keys

Real environment files must exist only on the target machine.

Production server laptop may have:

- `.env.production`

Staging personal test computer may have:

- `.env.staging`

These real files must not be committed.

---

## 8. Branch to Machine Mapping

Production server laptop:

- branch: `main`
- environment: production
- env file: `.env.production`
- database: production database

Personal test computer:

- branch: `staging`
- environment: staging
- env file: `.env.staging`
- database: staging/test database

Feature development machines:

- branch: `cursor/*` or `lovable/ui-*`
- environment: local development only
- database: local or staging-safe database only
- production database: forbidden

---

## 9. Approved Release Flow

Normal flow:

1. Work happens on a feature branch.
2. Pull Request targets `staging`.
3. GitHub checks run.
4. Human staging test is performed.
5. If staging is approved, merge to `staging`.
6. A release Pull Request is opened from `staging` to `main`.
7. Final review is performed.
8. Production server laptop pulls `main`.
9. Production is restarted/rebuilt using production environment variables.

Production must not be updated directly from feature branches.

---

## 10. Staging Update Procedure

Use this procedure on the staging/test computer.

Required branch:

`staging`

Steps:

1. Confirm the machine is the staging/test computer.
2. Confirm the app is not connected to production database.
3. Checkout `staging`.
4. Pull latest `staging`.
5. Install dependencies if needed.
6. Run build/checks if needed.
7. Start the staging app.
8. Confirm staging warning banner is visible.
9. Confirm test URL is different from production URL.
10. Perform human testing.

Staging must not be used for real staff operation.

---

## 11. Production Update Procedure

Use this procedure only on the server laptop.

Required branch:

`main`

Steps:

1. Confirm the machine is the production server laptop.
2. Confirm branch is `main`.
3. Confirm working tree is clean.
4. Pull latest `main`.
5. Confirm `.env.production` exists locally and is not committed.
6. Confirm database target is production.
7. Install dependencies if needed.
8. Build the app.
9. Restart the production process.
10. Test login and main business flow.
11. Confirm staff are using the production URL.

Production must not be updated from `staging`, `cursor/*`, `lovable/*`, or temporary branches.

---

## 12. Pre-Staging Checklist

Before testing on staging:

- [ ] Branch is `staging`.
- [ ] URL is staging/test URL.
- [ ] Database is staging/test database.
- [ ] Staging warning banner is visible.
- [ ] No production credentials are used.
- [ ] No real customer data is entered.
- [ ] Latest PR changes are included.
- [ ] App starts successfully.
- [ ] Login works.
- [ ] Browser console has no critical errors.
- [ ] API calls match approved OpenAPI contracts.

---

## 13. Pre-Production Checklist

Before production release:

- [ ] Release source is `staging`.
- [ ] Target branch is `main`.
- [ ] Pull Request from `staging` to `main` exists.
- [ ] GitHub checks passed.
- [ ] Code owner review is complete when required.
- [ ] Human staging test is complete.
- [ ] Database migrations are reviewed.
- [ ] OpenAPI changes are reviewed.
- [ ] Worker changes are reviewed.
- [ ] Production environment variables are verified.
- [ ] Rollback plan is known.
- [ ] Server laptop is ready.

---

## 14. Rollback Rule

For production rollback:

1. Identify the last known good production commit.
2. Confirm the issue is production-impacting.
3. Create or use an approved hotfix/rollback path.
4. Do not guess.
5. Do not use Lovable to patch production directly.
6. Do not run staging code in production.
7. Document what was rolled back and why.

Rollback must be controlled and reviewable.

---

## 15. Lovable and Staging

Lovable must not work directly on production.

Recommended Lovable active branch:

`lovable/ui-staging`

Safe flow:

`lovable/ui-staging`
→ Pull Request to `staging`
→ human staging test
→ later release through `staging` to `main`

Lovable must not connect staging to production data.

Lovable must not create migrations or backend logic.

---

## 16. Cursor and Staging

Cursor must work on the correct branch family.

Examples:

- `cursor/api-*`
- `cursor/worker-*`
- `cursor/db-*`
- `cursor/docs-*`
- `cursor/phase6-*`

Cursor must not push directly to `main`.

Cursor must not push directly to `staging` unless explicitly instructed.

Cursor changes must go through Pull Requests.

---

## 17. Worker and Bot Safety

Worker, bot, scraping, messaging, and automation execution must not be enabled in production unless explicitly reviewed.

Forbidden in staging unless approved:

- real WhatsApp sending
- real scraping at production scale
- real customer messaging
- production credentials
- production database writes
- unsafe Worker trigger from UI

Allowed in staging:

- mock jobs
- read-only tests
- fake/sample data tests
- status display tests
- output schema review

---

## 18. Final Rule

Production is for real business.

Staging is for testing.

A workflow that mixes these two is unsafe.

If there is any doubt about the current environment, stop and verify:

- branch
- URL
- database
- env file
- machine
- data type
- user intent

Do not continue until the environment is confirmed.
