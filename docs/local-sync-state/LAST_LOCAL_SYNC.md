# Last Local Sync — AfraKala LAN

این فایل نقطه مرجع آخرین انتقال موفق به نسخه Local افراکالا است.

از این فایل برای تشخیص تغییرات بعد از آخرین آپدیت Local استفاده می‌شود.

---

## Current Status

- Status: SUCCESSFUL_LOCAL_BOOTSTRAP
- Local app URL: http://localhost:3000
- LAN app URL: http://192.168.170.10:3000
- Local Supabase/Kong URL: http://localhost:8000
- LAN Supabase/Kong URL: http://192.168.170.10:8000

---

## What Was Successfully Completed

- Lovable/Dreamlit database export was extracted.
- Schema and data were imported into the local Supabase/Postgres stack.
- Auth users were reconstructed/imported for local compatibility.
- Main public data tables were populated.
- Local Supabase services were started via Docker Compose.
- Web app image was built as `afrakala-app:lan`.
- Web container was recreated successfully.
- Static assets serving was fixed in `server/node-entry.mjs`.
- The local web app successfully loaded at `http://localhost:3000`.
- Product/price data was visible in the local UI.

---

## Important Manual Fixes Applied During Bootstrap

These fixes must be preserved in future updates unless replaced by a better upstream implementation:

1. Dockerfile was adjusted for self-host/LAN build.
2. Build was hardened to avoid Lovable private npm cache URLs.
3. Static asset serving was added/fixed for `/assets/*` and `/fonts/*`.
4. Some problematic routes importing `src/server/*` from client routes/components were temporarily disabled to allow production build.
5. Frontend build required explicit Supabase build args:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`

---

## Local Data Ownership Rule

From this point forward, Local is the source of truth for operational data.

Do not restore full Lovable `data.sql` directly onto the Local database unless this file and `docs/LOCAL_UPDATE_PROTOCOL.md` explicitly allow it after backup and manual review.

---

## How To Compare Future Changes

For future updates, compare GitHub changes after this sync marker.

Use:

```powershell
git log --oneline <LAST_SYNC_COMMIT>..HEAD
git diff --name-status <LAST_SYNC_COMMIT>..HEAD
```

If Git is not installed, compare the latest GitHub ZIP against the current local source folder manually.

---

## Required Review Files Before Next Local Update

Before any future Local update, review:

1. `docs/lovable-change-reports/`
2. `docs/LOCAL_UPDATE_PROTOCOL.md`
3. `supabase/migrations/`
4. `Dockerfile`
5. `server/node-entry.mjs`
6. `deploy/lan/`
7. `.env.example` or any env-related report

---

## Backup Requirement

Before every future Local update, create a database backup.

See:

`docs/LOCAL_UPDATE_PROTOCOL.md`

---

## Last Sync Commit

This file was created as the first formal local sync marker after the initial successful Lovable-to-Local bootstrap.

Update this section after each successful Local update.

- LAST_SYNC_COMMIT: TO_BE_FILLED_AFTER_LOCAL_PULL
- LAST_SYNC_DATE: 2026-05-22
- LAST_SYNC_OPERATOR: ChatGPT + Mohammadreza
- LAST_SYNC_RESULT: Local app booted successfully and displayed live product/price data

---

## Next Update Rule

Any future Lovable or GitHub change must either:

- include a report in `docs/lovable-change-reports/`, or
- be manually reviewed against this sync marker before being applied to Local.
