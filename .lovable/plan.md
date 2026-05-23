# Revised Plan — Sale List `settlement_type_id` Local sync

🚨 **DATABASE_EXPORT_OR_BACKUP_REQUIRED** 🚨
(فقط برای گرفتن backup احتیاطی Local قبل از اجرای migration موجود — هیچ export از Lovable لازم نیست.)

## 1. بازرسی migration موجود
فایل: `supabase/migrations/20260522162314_a17c6ada-fb05-4b07-bc2f-68a2602073cf.sql`

محتوا (تأییدشده):
1. `ALTER TABLE public.sale_lists ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;` — idempotent، nullable.
2. `DO $$ ... IF NOT EXISTS (pg_constraint conname='sale_lists_settlement_type_id_fkey') THEN ADD CONSTRAINT ... FOREIGN KEY → settlement_types(id) ON DELETE SET NULL; END $$;` — idempotent، safe.
3. `CREATE INDEX IF NOT EXISTS idx_sale_lists_settlement_type_id ...` — idempotent.

**نتیجه بازرسی:** migration موجود **کامل، idempotent، nullable، و safe** است و دقیقاً همان چیزی است که برای رفع `PGRST204` لازم است. **مغایرت Local صرفاً به‌دلیل اجرا نشدن این migration روی Local Postgres** است.

## 2. تصمیم
- **هیچ migration جدید ساخته نمی‌شود** (مطابق قانون شما، duplicate ممنوع).
- فقط همین migration موجود باید روی Local اعمال شود.
- در کد، فقط یک خط `console.error` دفاعی به catch بلوک ایجاد لیست اضافه می‌شود تا در صورت خطاهای آینده، PostgREST error خام در DevTools دیده شود (پیام فارسی کاربر دست‌نخورده می‌ماند).

## 3. پاسخ صریح به سؤالات اجباری

| # | سؤال | پاسخ |
|---|---|---|
| الف | آیا `20260522162314_a17c6ada-…sql` تغییر schema لازم را در `sale_lists.settlement_type_id` دارد؟ | **بله، کامل و idempotent.** |
| ب | آیا migration جدید لازم است؟ | **خیر.** |
| ج | اگر migration جدید لازم نیست، دستور دقیق اعمال روی Local؟ | پایین، بخش ۶. |
| د | اگر migration جدید لازم باشد، نام فایل و دلیل؟ | لازم نیست. |
| 1 | فایل‌های تغییریافته در ریپو | `src/routes/_app.pricing.sale-lists_.new.tsx` (فقط افزودن یک `console.error("[sale-lists/new] insert failed:", e)` در catch موجود) |
| 2 | فایل‌های جدید | فقط گزارش: `docs/lovable-change-reports/YYYY-MM-DD-HHMM-sale-list-settlement-type-schema-sync.md` |
| 3 | تغییر schema در `public.sale_lists`؟ | روی Lovable Cloud قبلاً انجام شده؛ روی Local با اجرای migration موجود انجام می‌شود (no-op برای Cloud). |
| 4 | تغییر schema در `public.sale_list_versions`؟ | خیر (کد به آن نیاز ندارد) |
| 5 | RLS / policy / function / trigger؟ | خیر |
| 6 | `package.json` / lockfile؟ | خیر |
| 7 | `src/routeTree.gen.ts`؟ | خیر |
| 8 | Backup Local لازم است؟ | **بله** — pg_dump قبل از اجرای migration |
| 9 | Lovable DB export لازم است؟ | خیر |
| 10 | Storage export لازم است؟ | خیر |
| 11 | Risk Level | **LOW** — additive، nullable، idempotent |
| 12 | Rollback | `ALTER TABLE public.sale_lists DROP CONSTRAINT IF EXISTS sale_lists_settlement_type_id_fkey; DROP INDEX IF EXISTS public.idx_sale_lists_settlement_type_id; ALTER TABLE public.sale_lists DROP COLUMN IF EXISTS settlement_type_id;` (فقط مقادیر همین ستون از دست می‌رود) |

## 4. تغییر کد (دقیق)
در `src/routes/_app.pricing.sale-lists_.new.tsx`، در `catch (e)` فعلی (~خط 387)، **فقط یک خط** قبل از `toast.error` افزوده می‌شود:
```ts
console.error("[sale-lists/new] insert failed:", e);
```
هیچ تغییر دیگری در منطق ذخیره، UI، یا پیام کاربر نیست.

## 5. آنچه تغییر نمی‌کند
sidebar, dashboard, auth, pricing engine, bot API, ports, Docker, package.json/lockfile, routeTree.gen.ts, RLS, storage, sale-list PDF، صفحه view لیست، public sale-list. هیچ migration جدید.

## 6. دستور دقیق اعمال migration موجود روی Local

پیش‌نیاز: روی سرور Local، در ریپو افراکالا، با `psql` نصب‌شده و `deploy/local/.env.local` پر.

```bash
# 1) Backup احتیاطی Local
DRY_RUN=false bash deploy/backups/scripts/backup-postgres.sh

# 2) Pull آخرین main (پس از merge این PR)
git pull --ff-only origin main

# 3) اعمال migrationها (idempotent — قدیمی‌ها no-op)
DRY_RUN=true  bash deploy/local/scripts/local-apply-migrations.sh   # پیش‌نمایش
DRY_RUN=false bash deploy/local/scripts/local-apply-migrations.sh   # اجرا

# 4) (اختیاری ولی توصیه‌شده) Reload schema cache برای PostgREST/Kong
docker exec -i <POSTGRES_CONTAINER_NAME> psql -U postgres -d postgres \
  -c "NOTIFY pgrst, 'reload schema';"
# یا restart کانتینر PostgREST/Kong افراکالا
```

اگر pg_dump گرفته نشد، حق ادامه نیست.

## 7. Validation پس از اعمال روی Local
- `psql ... -c "\d public.sale_lists"` نشان دهد `settlement_type_id uuid` وجود دارد.
- ایجاد لیست جدید از `/pricing/sale-lists/new` بدون `PGRST204` انجام شود.
- باز کردن یک لیست قدیمی (با `settlement_type_id IS NULL`) و یک لیست جدید — هر دو header/items/PDF را درست رندر کنند.
- در DevTools، اگر بعداً خطایی رخ داد، خط `console.error` پیام خام PostgREST را لاگ کند.

## 8. Branch و گزارش (پس از Apply)
- branch: `feature/sale-list-settlement-type-schema-sync`
- محتوای branch فقط: ۱ خط تغییر در `_app.pricing.sale-lists_.new.tsx` + فایل گزارش جدید با ۲۲ بخش الزامی.
- گزارش صراحتاً ذکر خواهد کرد: «migration جدید ساخته نشد؛ migration موجود `20260522162314_a17c6ada-…sql` باید روی Local اعمال شود.»

منتظر **Build/Apply/Proceed** هستم.
