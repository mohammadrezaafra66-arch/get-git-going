# Staging Branch and Test Environment Setup Plan

Phase Label: PHASE-0  
Step: 7  
Owner: محمدرضا افرا  
Status: Proposed for Phase-0 governance  
Source of Truth: GitHub

Related policies:

```text
docs/process/SOURCE_OF_TRUTH.md
docs/process/lovable-cursor-boundary.md
docs/process/BRANCH_STRATEGY.md
docs/process/ENVIRONMENT_STRATEGY.md
docs/process/GITHUB_GUARDRAILS.md
```

---

## 1. Purpose

This runbook defines how to use the `staging` branch and a personal/test computer for human testing.

The goal is to test AfraKala web app changes without touching production data, production URLs, production secrets, or the production server laptop.

---

## 2. Current Decision

```text
staging branch exists and is the human-test candidate branch.
Production must run only from main.
Staging must run only from staging or an approved test branch.
Staging must use a separate database and a separate URL.
Staff must not use staging for real company work.
```

---

## 3. Environment Target

| Item | Production | Staging |
|---|---|---|
| Branch | `main` | `staging` |
| Host | server laptop / production host | personal/test computer |
| Database | production database | staging/test database |
| Data | real company data | fake/sample/anonymized data |
| URL | production URL / production LAN URL | staging URL / test PC LAN URL |
| Staff real work | allowed | forbidden |
| Worker mode | production-approved only | mock/test/limited only |

---

## 4. Required Staging Rules

Staging must follow these rules:

```text
Do not connect to production database.
Do not use production secrets.
Do not use production URL.
Do not let staff enter real customer/accounting/sales data.
Do not run real messaging automation.
Do not publish real prices.
Do not run production worker mode.
```

The staging UI must show:

```text
محیط تست افراکالا - اطلاعات این بخش واقعی نیست
```

---

## 5. Local Folder Plan

Recommended folder on the personal/test computer:

```text
C:\AfraKala\staging\get-git-going
```

Do not reuse the production server folder for staging.

---

## 6. PowerShell Setup Commands

Run these on the personal/test computer.

```powershell
1. cd C:\
2. mkdir AfraKala
3. cd C:\AfraKala
4. mkdir staging
5. cd C:\AfraKala\staging
6. git clone https://github.com/mohammadrezaafra66-arch/get-git-going.git
7. cd get-git-going
8. git checkout staging
9. git pull origin staging
10. npm install
```

If `npm install` fails because Node is missing or outdated, install Node 20 first, then repeat steps 7 to 10.

---

## 7. Staging Environment File

Create a local staging environment file on the personal/test computer.

Recommended file:

```text
.env.staging
```

This file must not be committed to GitHub.

Safe template rule:

```text
Use only staging URLs, staging public keys, and staging server-only keys.
Never paste production values.
Never put server-only secrets in client-visible variables.
Never commit real environment files.
Commit only example templates when needed.
```

Required categories:

```text
App environment name = staging
Visible environment banner = enabled
Staging database URL = staging only
Staging public client key = staging only
Staging server-only key = staging only, local file only
Port = 3000 unless changed intentionally
```

---

## 8. Staging Database Options

Choose one option before human testing.

### Option A — Empty staging database

Best for early testing.

Use when the purpose is checking screens, routes, forms, and basic flows.

Rules:

```text
Use fake customers.
Use fake products.
Use fake sales/accounting records.
Do not import production data.
```

### Option B — Sample seed database

Best for repeated QA.

Use when testers need predictable fake records.

Rules:

```text
Seed only fake data.
Use obvious names like تست مشتری ۱ and محصول تستی ۱.
Keep seed script versioned later if needed.
```

### Option C — Anonymized copy

Only allowed after a separate approved anonymization task.

Default for Phase-0:

```text
Use Option A or Option B.
Do not use Option C yet.
```

---

## 9. Run Staging in Development Mode

Use this for quick human testing.

```powershell
1. cd C:\AfraKala\staging\get-git-going
2. git checkout staging
3. git pull origin staging
4. npm install
5. npm run dev
```

Default local URL is usually:

```text
http://localhost:3000
```

If another port is shown by Vite, use the port printed in the terminal.

---

## 10. Run Staging in Production-like Mode

Use this when you want a closer test to the server behavior.

```powershell
1. cd C:\AfraKala\staging\get-git-going
2. git checkout staging
3. git pull origin staging
4. npm install
5. npm run build
6. npm run preview
```

This must still use staging/test database only.

---

## 11. Make Staging Visible on LAN

If another person needs to test from another computer on the company network:

```powershell
1. ipconfig
2. Find the IPv4 address of the test computer.
3. npm run dev -- --host 0.0.0.0
```

Example LAN URL:

```text
http://192.168.1.25:3000
```

Rules:

```text
Do not share staging URL with staff for real work.
Do not bookmark staging as production.
Keep the test warning banner visible.
```

---

## 12. Human Testing Checklist

Before testing:

```text
Branch is staging.
URL is staging/local/LAN test URL.
Database is staging/test database.
Banner is visible.
Data is fake/sample/anonymized.
No production secret is present.
```

During testing:

```text
Record what was tested.
Record pass/fail result.
Record screenshots only if they contain fake data.
Do not enter real customer/accounting/sales data.
Do not trigger real automation.
```

After testing:

```text
Report bugs against the PR or issue.
Do not merge to main until acceptance.
Do not copy staging data into production.
```

---

## 13. Worker Testing in Staging

Worker must be mock/test/limited by default.

Allowed:

```text
mock worker runtime
contract tests
fake jobs
fake outputs
staging-only evidence
```

Forbidden without explicit task packet:

```text
real external sending
real scraping
real browser automation
real external website calls
production credentials
```

---

## 14. Production Promotion Path

A staging-tested change may reach production only through this path:

```text
feature/lovable/cursor branch
→ PR to staging or review path
→ human staging test
→ PR/merge to main
→ production host pulls main
→ production runs from known main commit
```

Production must never pull directly from `staging`.

---

## 15. Stop Conditions

Stop immediately if:

```text
staging uses production database.
staging uses production privileged server key.
staging URL is confused with production URL.
staff enter real data into staging.
worker sends real messages from staging.
Lovable preview writes to production.
local computer contains production environment file.
```

---

## 16. Acceptance Criteria

This staging setup is accepted when:

```text
staging branch exists.
personal/test computer can checkout staging.
app runs locally from staging.
staging database is separate from production.
staging URL is separate from production.
staging banner is visible.
human testing checklist is used.
no real company data is entered in staging.
```

---

## 17. Final Rule

```text
Test safely in staging.
Approve carefully in GitHub.
Run real work only from production main.
```
