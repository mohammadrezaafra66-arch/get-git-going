# 211/216 Business Flow Auth Setup

Date: 2026-07-30

## Current Blocker

The real-browser business-flow test for requirements 211 and 216 requires three separate authenticated browser sessions:

- `e2e/auth/accountant.storage.json`
- `e2e/auth/salesperson-a.storage.json`
- `e2e/auth/salesperson-b.storage.json`

All three files are currently missing. The business-flow test intentionally fails before performing any business action when these files are unavailable.

## Interactive Setup Command

Run this command locally in the LAN test environment:

```powershell
npx playwright test --config=playwright.auth.config.ts e2e/auth/save-role-sessions.spec.ts --headed
```

The browser will pause for each role. Log in manually in the browser only; never paste passwords into logs, markdown files, screenshots, or terminal output.

Expected accounts/roles:

| Storage file                          | Required role shown in UI | Suggested account                |
| ------------------------------------- | ------------------------- | -------------------------------- |
| `e2e/auth/accountant.storage.json`    | `حسابدار`                 | `test.accountant@afrakala.local` |
| `e2e/auth/salesperson-a.storage.json` | `فروشنده`                 | `test.sales@afrakala.local`      |
| `e2e/auth/salesperson-b.storage.json` | `فروشنده`                 | `test.sales2@afrakala.local`     |

Salesperson A and Salesperson B must be two distinct users.

## Validate The Saved Sessions

After the storage files are generated, run:

```powershell
npx playwright test --config=playwright.auth.config.ts e2e/auth/validate-role-sessions.spec.ts
```

This validation checks:

- each session is authenticated,
- the expected role label is visible,
- the expected route is accessible,
- the UI is not rendered as `بدون نقش`,
- the two salesperson sessions are different users.

## Run The Business Flow

After validation passes:

```powershell
npx playwright test e2e/business-flows/211-216-rejected-quote-notification.spec.ts
```

Then run the full suite:

```powershell
npx playwright test
```

## Safety Notes

- LAN only: `http://192.168.170.8:3100`.
- No production access.
- No migrations.
- No commit or push required.
- The business-flow test creates only prefixed data using `E2E_AUDIT_211_<timestamp>_`.
- Cleanup runs in `finally` and verifies that no prefixed rows remain.
- StorageState file contents, cookies, tokens, passwords, and secrets must never be printed.
