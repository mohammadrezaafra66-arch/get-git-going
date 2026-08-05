# Platform Update History — Audit (Phase 1)

Date: 2026-08-06  
Branch: `feature/navigation-modernization`  
Root: `D:\AfraKalaTest\app`  
HEAD at audit: `0fe35c19`

## 1. Current update-button behavior

| Fact | Detail |
|------|--------|
| Location | Toast from `src/lib/pwa/register-sw.ts` (`promptForUpdate`) |
| Trigger | Poll `GET /api/version` every 15 min + on tab focus (throttled 5 min). Also SW waiting worker on HTTPS. |
| Label | «به‌روزرسانی» (action) + «بعداً» (cancel) |
| Effect | Reload page (deploy poll) or `SKIP_WAITING` then reload (SW). **Never auto-reload.** |
| LAN | No SW on plain HTTP; deploy poll still works via `VITE_BUILD_ID` vs `/api/version`. |
| Version API | `src/routes/api.version.ts` — `commit`, `buildTime`, `app` (branding). `cache-control: no-store`. |

## 2. Existing infrastructure

| Area | Finding |
|------|---------|
| Release / changelog tables | **None** (`platform_releases` absent) |
| Docs release notes | `docs/baseline/RELEASE_NOTES_*.md` — ops/docs only, not user-facing |
| Audit logs | `audit_logs` — activity audit; **must not** be reused as changelog |
| Navigation | No «تغییرات» entry; knowledge/academy under `knowledge-comms` |
| Jalali helpers | `formatDateFa` / `formatDateTimeFa` in `src/lib/i18n/formatters.ts` — Persian calendar; **timezone not forced to Tehran** |
| Branding | `src/config/branding.ts` — use for page titles |
| Unread tracking | `profiles.last_seen_at` only — no release-seen column |
| Permissions | Dynamic `role_permissions` + static `PERMISSIONS` fallback |

## 3. Proposed data model

**Single table** `platform_releases` with `items jsonb` (array of change bullets).  
No child table — releases are edited/published as one unit (matches knowledge/academy CRUD).

Key columns: `release_number` (nullable until publish), `version`, `git_sha`, `build_time`, `title_fa`, `summary_fa`, `details_fa`, `category`, `status` (`draft`\|`published`\|`archived`), `published_at`, audit columns.

Numbering: sequence `platform_release_number_seq` assigned **only on publish** via `publish_platform_release(uuid)` (SECURITY DEFINER). Drafts do not consume numbers.

## 4. Permission matrix

| Actor | Published SELECT | Draft SELECT | Insert/Update draft | Publish/Archive |
|-------|------------------|--------------|---------------------|-----------------|
| anonymous | deny | deny | deny | deny |
| viewer / sales / accountant / manager | yes | no | no | no |
| admin | yes | yes | yes | yes |

Module key: `platform-releases` — view for all seeded roles; create/update/delete admin only.

## 5. Migration need

Yes — **302** (`20260806010000_302_platform_releases.sql`). Latest prior: **301**.

## 6. Security risks

- XSS if admin HTML rendered raw → plain text / safe expand only  
- Leaking drafts via count/title → RLS filters drafts from non-admin  
- Auto-publishing git commits → **not done**; manual publish only  
- Reusing `audit_logs` as UI changelog → **rejected**  
- Service-role in browser → **forbidden**

## 7. Hard-stop assessment

No existing release-history system. Safe to implement.  
Unread badge **deferred** (optional enhancement).  
Update toast keeps «به‌روزرسانی»; add «مشاهده تغییرات» link to `/updates`.

## 8. Routes / nav

| Route | Audience |
|-------|----------|
| `/updates` | Authenticated — «تغییرات و به‌روزرسانی‌ها» |
| `/admin/platform-releases` | Admin CRUD |

Nav: sidebar under `knowledge-comms` + admin entry; toast secondary link.
