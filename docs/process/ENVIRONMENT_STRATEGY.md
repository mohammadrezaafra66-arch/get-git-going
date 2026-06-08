# Environment Strategy Policy

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Proposed for Phase-0 governance  
Source of Truth: GitHub  
Related policies:

```text
docs/process/SOURCE_OF_TRUTH.md
docs/process/lovable-cursor-boundary.md
docs/process/BRANCH_STRATEGY.md
docs/self-host-governance/10_ENVIRONMENT_MATRIX.md
```

---

## 1. Purpose

This document defines how AfraKala Automation Platform must separate production, staging, local development, and Lovable preview environments.

The goal is to prevent real company data from being used in test work, prevent test branches from reaching production, and make self-host development safe for both Lovable and Cursor work.

---

## 2. Final Decision

```text
Production is real company work.
Staging is human testing only.
Local is developer/operator testing only.
Lovable Preview is UI preview only.
No test environment may use production database by mistake.
```

Production may run only from `main`.

Staging may run only from `staging` or an approved feature branch.

Lovable Preview is never production and must never be treated as source of truth.

---

## 3. Environment Roles

| Environment | Branch | Host | Database | Purpose | Real company use allowed? |
|---|---|---|---|---|---|
| Production | `main` | server laptop / production host | production database | real company operations | Yes |
| Staging | `staging` | personal/test computer or staging host | staging/test database | human testing before production | No |
| Local Dev | feature branch | developer computer | local/test database | isolated development/smoke testing | No |
| Lovable Preview | Lovable-managed branch/preview | Lovable cloud/preview | preview/test data only | UI preview | No |

---

## 4. Production Rules

Production is the only environment where real AfraKala staff may perform real work.

Production rules:

```text
branch = main
host = server laptop / production host
database = production database
data = real company data
purpose = real operations
```

Production must not run from:

```text
staging
lovable/*
cursor/*
docs/*
hotfix/* before merge to main
local uncommitted code
Lovable preview
Cursor-generated local state
```

Production updates require:

```text
PR merged to main
known commit SHA
risk review
rollback note for risky changes
production env file already present on host
no real secret committed to GitHub
```

---

## 5. Staging Rules

Staging is for human testing only.

Staging rules:

```text
branch = staging or approved test branch
host = personal/test computer or staging host
database = staging/test database
data = fake, sample, or anonymized data
purpose = pre-production human testing
```

Staging must show a visible UI warning:

```text
محیط تست افراکالا - اطلاعات این بخش واقعی نیست
```

Staging must not be used for:

```text
real customer registration
real sales activity
real accounting entry
real WhatsApp/Telegram automation
real price publishing
real production worker execution
```

---

## 6. Local Development Rules

Local development is for isolated testing by the operator/developer.

Local rules:

```text
branch = feature branch
host = local computer
database = local/test database
data = fake or disposable
purpose = developer smoke test
```

Local may be used for:

```text
UI smoke testing
worker mock mode
contract tests
unit tests
manual review before PR
```

Local must not connect to production database.

---

## 7. Lovable Preview Rules

Lovable Preview is for UI review only.

Lovable Preview may show UI behavior, layout, forms, tables, dashboards, and route flow.

Lovable Preview must not be used for:

```text
production approval by itself
real company data entry
real database migration
real automation execution
real staff operation
source-of-truth decision
```

A Lovable change becomes official only after:

```text
GitHub branch exists
PR exists
review is done
change is merged through GitHub
```

---

## 8. Environment File Rules

Environment files must be separated by host and purpose.

Recommended local file names:

```text
.env.production      = lives only on production host
.env.staging         = lives only on staging/test host
.env.local           = lives only on local development machine
.env.example         = safe template committed to GitHub
```

Rules:

```text
.env.production must never be copied to staging.
.env.staging must never point to production database.
.env.local must never contain production secrets.
.env.example may contain variable names only, not real secrets.
```

Server-only secrets must never use the `VITE_` prefix.

Client-visible variables may use `VITE_` only when the value is intentionally public/publishable.

---

## 9. Database Separation Rules

Required database separation:

```text
production database = real data only
staging database = fake/anonymized data only
local database = disposable data only
```

Forbidden:

```text
staging DATABASE_URL equals production DATABASE_URL
local DATABASE_URL equals production DATABASE_URL
Lovable preview writes to production database
worker test writes to production database
production data copied into staging without anonymization approval
```

Any migration must be reviewed in this order:

```text
local/test validation
staging apply/test
production apply only after approval
```

---

## 10. URL Separation Rules

URLs must make environment identity obvious.

Recommended pattern:

```text
Production: app.afrakala.local or production LAN URL
Staging: staging.afrakala.local or test PC LAN URL
Local: localhost with explicit port
Lovable Preview: Lovable preview URL only
```

The user must be able to tell production and staging apart by URL and UI banner.

Staging must not use the production URL.

Production must not use the staging URL.

---

## 11. Worker / Automation Environment Rules

Worker and automation execution must be more restricted than UI.

Production worker rules:

```text
branch = main
mode = production-approved mode only
source integrations = only approved integrations
credentials = production secrets on production host only
```

Staging worker rules:

```text
branch = staging or approved feature branch
mode = mock/test/limited execution only
data = fake or test data
real external execution = forbidden unless approved by task packet
```

Local worker rules:

```text
mode = mock by default
real source calls = forbidden unless explicitly approved
production credentials = forbidden
```

---

## 12. Human Testing Rules

Human testing must happen in staging, not production.

Human testing checklist:

```text
URL is staging/test URL.
UI shows test environment warning.
Database is staging/test database.
Data is fake/anonymized.
No real customer/staff action is performed.
No real automation message is sent.
Tester records pass/fail evidence.
```

If any condition fails, stop testing.

---

## 13. Production Release Gate

A change may reach production only when:

```text
PR merged to main.
Production host pulls main.
Production env file is already correct.
Staging test is completed when required.
Rollback note exists for risky changes.
No secret is committed.
No staging/test URL is used by production.
No test database is used by production.
```

Production release must be traceable to a GitHub commit SHA.

---

## 14. Stop Conditions

Stop immediately if:

```text
Staging points to production database.
Local points to production database.
Production is running from staging or feature branch.
Lovable preview writes to production data.
A secret appears in GitHub.
A VITE_ variable contains a server secret.
A worker test sends real messages or calls real external sources without approval.
Staff are using staging for real operations.
```

---

## 15. Acceptance Criteria

This environment strategy is accepted when:

```text
Production is tied to main.
Staging is tied to staging or approved test branch.
Production and staging have separate databases.
Production and staging have separate URLs.
Staging has a visible warning banner.
Lovable Preview is clearly non-production.
Local development cannot use production secrets.
Worker test execution is mock/limited by default.
```

---

## 16. Final Rule

```text
Production is for real work.
Staging is for human testing.
Local is for isolated development.
Lovable Preview is for UI review.
Never mix their data, URLs, branches, or secrets.
```
