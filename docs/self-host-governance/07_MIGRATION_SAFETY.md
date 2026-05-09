# 07 — Migration Safety

- Purpose: سیاست ایمنی migration.
- Audience: Dev/DBA/Operator.
- Last updated: 2026-05-09
- Related: `docs/MIGRATION_SAFETY_POLICY.md` (مرجع کامل و حاکم)

## اصول اجباری

- production migration **فقط دستی**.
- GitHub Actions **هرگز** migration روی production اجرا نمی‌کند.
- قبل از هر migration: **backup تازه + بازبینی + ترجیحاً تست staging**.
- ابتدا `DRY_RUN=true`، سپس اجرای واقعی با تأیید اپراتور.
- هر تغییر دیتابیس → migration در `supabase/migrations/` با timestamp جدید (idempotent، reversible).
- جدول جدید → RLS از همان migration فعال.
- نقش‌ها فقط در `user_roles` با `has_role()` security definer.
- هیچ تغییری در schemaهای `auth/storage/realtime/supabase_functions/vault`.

## الگوهای خطرناک (نیازمند dual approval + staging)

- `DROP`, `TRUNCATE`, `DELETE` بدون `WHERE`
- `ALTER TYPE`, `ALTER COLUMN`, تغییر enum
- تغییر RLS حساس
- تغییر auth/storage
- جداول مالی: invoices, payments, accounting, pricing

## ترتیب اجرای production

1. backup → `bash deploy/backups/scripts/backup-postgres.sh`
2. `git pull`
3. بازبینی migrationهای جدید
4. اجرای دستی → `DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh`
5. deploy app → `docker compose pull web && up -d web`
6. smoke test → `bash deploy/migration/scripts/smoke-test.sh`

## Rollback

- App: pull image قبلی از GHCR + restart (سریع و امن).
- DB: سخت‌تر؛ یا restore کامل، یا migration معکوس.
- پس فقط destructiveهای واقعاً لازم.

## کامنت اجباری بالای migration حساس

```sql
-- SAFETY: destructive | requires backup | tested on staging YYYY-MM-DD
-- ROLLBACK: <راهکار یا "restore from backup">
```

## فیلدهای الزامی گزارش migration

- نام فایل migration
- نوع تغییر (add/alter/drop/rls/...)
- آیا destructive است؟
- backup ID
- نتیجهٔ DRY_RUN
- نتیجهٔ اجرای واقعی
- smoke test passed?
- rollback plan
