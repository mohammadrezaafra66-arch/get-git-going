# 03 — Requirements REQ-SH-001..015

- Purpose: معیارهای پذیرش رسمی self-host. هر فاز باید مشخص کند کدام REQ را تحت تأثیر قرار می‌دهد.
- Audience: همه.
- Last updated: 2026-05-09
- Related: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`, `05_MASTER_EXECUTION_PLAN.md`

| ID | عنوان | شرح | وضعیت |
|---|---|---|---|
| REQ-SH-001 | بدون secret در repo | هیچ secret/key/cert/.env واقعی commit نشود | ⬜ |
| REQ-SH-002 | فقط deploy/* برای production | docker-compose ریشه برای prod ممنوع | ⬜ |
| REQ-SH-003 | image از GHCR | production فقط pull، بدون build روی VPS | ⬜ |
| REQ-SH-004 | Supabase کامل | Postgres+Auth+REST+Storage+Kong+Meta سالم | ⬜ |
| REQ-SH-005 | RLS روی همهٔ جداول | بدون استثنا | ⬜ |
| REQ-SH-006 | RBAC در user_roles + has_role() | هیچ role در profiles | ⬜ |
| REQ-SH-007 | Backup زمان‌بندی‌شده | postgres + storage + env | ⬜ |
| REQ-SH-008 | Restore drill موفق | حداقل یک‌بار قبل cutover | ⬜ |
| REQ-SH-009 | Migration safety | طبق `07_MIGRATION_SAFETY.md` | ⬜ |
| REQ-SH-010 | Internet resilience | core بدون اینترنت بین‌الملل کار کند | ⬜ |
| REQ-SH-011 | Audit log | عملیات حساس ثبت شود | ⬜ |
| REQ-SH-012 | Healthz | `/api/healthz` فقط داخلی | ⬜ |
| REQ-SH-013 | TLS اجباری | Caddy + auto-renew | ⬜ |
| REQ-SH-014 | Rollback مستند | نسخهٔ قبلی image + restore plan | ⬜ |
| REQ-SH-015 | اسناد حاکمیت | بستهٔ `docs/self-host-governance/` کامل | ⬜ |

## قانون به‌روزرسانی وضعیت

- ⬜ todo / 🟡 in-progress / ✅ done / ❌ blocked
- هر تغییر وضعیت باید با ID فاز و تاریخ در `05_MASTER_EXECUTION_PLAN.md` ثبت شود.