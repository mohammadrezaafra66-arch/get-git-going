# 07 — Migration Safety (Pointer)

- Purpose: ارجاع به سیاست رسمی migration و خلاصهٔ حداقلی.
- Audience: Dev/DBA.
- Last updated: 2026-05-09
- Related: `docs/MIGRATION_SAFETY_POLICY.md`

## مرجع کامل

`docs/MIGRATION_SAFETY_POLICY.md` — حاکم است؛ این فایل فقط خلاصه است.

## خلاصهٔ ۱۰ ثانیه‌ای

- هر تغییر دیتابیس → migration در `supabase/migrations/` با timestamp جدید.
- destructive (DROP/TRUNCATE/ALTER TYPE/تغییر RLS حساس) → backup + staging + dual approval.
- جدول جدید → RLS فعال از همان migration.
- نقش‌ها فقط در `user_roles` با `has_role()` security definer.
- هرگز تغییر در schemaهای `auth/storage/realtime/supabase_functions/vault`.
- هرگز migration روی production توسط GitHub Actions.

## کامنت اجباری بالای migration حساس

```sql
-- SAFETY: destructive | requires backup | tested on staging YYYY-MM-DD
-- ROLLBACK: <راهکار یا "restore from backup">
```