# 2026-05-22 16:10 — Fix Auth Loading Timeout

## 1. Summary

- Added frontend-only timeout handling for auth/session-related client requests so the app does not remain forever on «در حال بررسی جلسه کاربری...».
- Added a visible Persian retry state if auth/profile/roles loading takes too long.
- Added timeout fallback for dynamic role-permission loading to avoid route guards hanging on unstable network.

## 2. Changed Files

- `src/lib/auth/session.ts`
  - Added a 10-second timeout wrapper around `getSession`, profile loading, and role loading.
  - On timeout, loading flags are cleared and a Persian recoverable auth error is stored.
- `src/lib/rbac/dynamic-permissions.ts`
  - Added a 10-second timeout wrapper around role-permissions fetch.
  - On timeout/error, existing cached rows or static permission fallback remain usable.
- `src/routes/_app.tsx`
  - Added a 12-second UI fallback with Persian text and retry button instead of infinite loading.

## 3. New Files

- `docs/lovable-change-reports/2026-05-22-1610-fix-auth-loading-timeout.md`

## 4. Deleted Files

- None.

## 5. Environment Variables

- No environment variables were added, removed, or changed.

## 6. Database Changes

- None.
- No database schema, tables, columns, enums, triggers, functions, foreign keys, indexes, constraints, RLS, or policies were changed.

## 7. Schema Changes

- None.

## 8. Storage Changes

- None.
- No buckets or storage policies were changed.

## 9. Migration Required

- No.

## 10. Local Update Steps

1. Pull the latest code from GitHub into the Local environment.
2. Rebuild/restart only the web app container according to the existing Local runbook.
3. No database migration command is required.
4. No storage import/export command is required.

## 11. Backup Required

- No database backup is required for this change.
- `DATABASE_EXPORT_OR_BACKUP_REQUIRED` is not applicable because this is frontend/client-code only.

## 12. Export Required

- No Lovable data export is required.
- No schema export is required.
- No storage export is required.

## 13. Risk Level

- LOW.
- The change is limited to client-side timeout/error handling and does not alter access-control rules or backend data.

## 14. Rollback Plan

- Revert these files to the previous GitHub revision:
  - `src/lib/auth/session.ts`
  - `src/lib/rbac/dynamic-permissions.ts`
  - `src/routes/_app.tsx`
  - this report file
- Rebuild/restart the web app container.

## 15. Post-Update Tests

- Open `/dashboard` while logged in and confirm the dashboard loads.
- With an unstable/blocked network, confirm the app shows a Persian retry state instead of staying forever on «در حال بررسی جلسه کاربری...».
- Click «تلاش دوباره» and confirm auth/session retry starts.
- Confirm no DB migrations are pending or executed for this update.
