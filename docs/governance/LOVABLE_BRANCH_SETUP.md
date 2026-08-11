# AfraKala Phase 6 - Lovable Branch Setup

Status: Confirmed
Phase: 6
Scope: Lovable GitHub branch configuration
Source of truth: GitHub repository

---

## 1. Purpose

This document records the confirmed Lovable GitHub branch setup for the AfraKala platform.

The purpose is to make sure Lovable does not work directly on `main` and does not bypass the approved staging flow.

---

## 2. Confirmed Repository Connection

Lovable project repository:

`mohammadrezaafra66-arch/get-git-going`

Connection status:

`Connected`

Confirmed active branch:

`lovable/ui-staging`

---

## 3. Required Lovable Rule

Lovable must work only on:

`lovable/ui-staging`

Lovable must not work directly on:

- `main`
- `staging`
- `cursor/api-*`
- `cursor/worker-*`
- `cursor/db-*`
- `cursor/phase6-*`
- `hotfix/*`

---

## 4. Approved Lovable Flow

The approved flow is:

`lovable/ui-staging`
→ Pull Request to `staging`
→ human staging test
→ Pull Request from `staging` to `main`
→ production release

Lovable must not bypass Pull Requests.

Lovable must not push directly to production.

---

## 5. Scope Reminder

Lovable is allowed to work on UI only.

Allowed:

- UI pages
- React components
- forms
- tables
- dashboards
- layout
- Persian/RTL UI polish
- responsive UI
- loading, empty, and error states
- UI connection to approved API contracts

Forbidden:

- backend logic
- database migrations
- Worker runtime
- automation logic
- OpenAPI ownership
- GitHub Actions
- deployment settings
- production configuration
- secrets
- real environment files

---

## 6. Final Confirmation

Lovable is now configured to use the safe UI branch:

`lovable/ui-staging`

This satisfies Phase 6 Step 11.
