# Migration Safety Policy

هر migration قبل از اجرا روی staging و سپس production باید با این چک‌لیست بررسی شود.

## ۱. الگوهای نیازمند Manual Approval
اگر migration شامل هر یک از موارد زیر باشد، **اجبار** به: backup قبلی + تست staging + دو-نفره approval.
- `DROP TABLE` / `DROP COLUMN` / `DROP INDEX` / `DROP TYPE`
- `DELETE FROM ... ` بدون `WHERE` ایمن
- `TRUNCATE`
- `ALTER TYPE` (تغییر enum یا type)
- `ALTER COLUMN ... TYPE` (تغییر نوع ستون)
- تغییرات اساسی RLS policy روی جداول حساس
- تغییر در schema های `auth` / `storage` / `realtime`
- تغییر روی جداول مالی (invoices, payments, accounting_*)
- تغییر یا حذف enum value

## ۲. مسیر اجباری برای migrationهای حساس
1. اجرای روی staging با `DRY_RUN=false` و verify.
2. backup کامل production (`backup-postgres.sh` با `DRY_RUN=false`).
3. اعلام window و اطلاع به اپراتور.
4. اجرای migration روی production.
5. smoke test (`smoke-test.sh`).
6. در صورت خطا → rollback (migration معکوس یا restore).

## ۳. الگوهای امن (low risk)
- `CREATE TABLE` جدید با RLS فعال از همان ابتدا.
- `CREATE INDEX CONCURRENTLY`.
- `ALTER TABLE ... ADD COLUMN ... DEFAULT ... NULL`.
- اضافه‌کردن RLS policy جدید (نه تغییر موجود).

## ۴. قواعد ثابت
- هر جدول جدید باید RLS فعال داشته باشد.
- نقش‌ها فقط در `user_roles` + تابع `has_role()` security definer.
- migration باید reversible یا حداقل دارای backup-before پلن باشد.
- migration هرگز توسط GitHub Actions روی production اجرا نمی‌شود.
- destructive migration بدون backup → ممنوع.

## ۵. کامنت اجباری بالای فایل migration حساس
```sql
-- SAFETY: destructive | requires backup | tested on staging YYYY-MM-DD
-- ROLLBACK: <راهکار rollback یا «restore from backup»>
```