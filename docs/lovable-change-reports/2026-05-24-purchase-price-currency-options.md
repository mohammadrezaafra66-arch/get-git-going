# گزارش تغییر — افزودن ارز usd_us (دلار تهران) به فرم ثبت قیمت خرید

تاریخ: 2026-05-24

🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨

## 1. Summary
فرم ثبت قیمت خرید در مسیر `/pricing/purchase-prices` و کامپوننت `PurchaseForm` فقط سه ارز `toman/usd/aed` را با labelهای ساده نشان می‌داد. حالا چهار ارز با labelهای صحیح در دسترس است: تومان، دلار سلیمانیه، درهم امارات، دلار تهران (`usd_us`). enum دیتابیس `public.currency_code` نیز با افزودن مقدار `usd_us` به‌روزرسانی شد.

## 2. Changed Files
- `src/lib/pricing/constants.ts` — افزودن `usd_us` به `CURRENCY_LABELS` و اصلاح labelهای usd/aed.
- `src/lib/pricing/schemas.ts` — افزودن `usd_us` به enum `purchasePriceSchema.currency`.
- `src/shared/components/PurchaseForm.tsx` — استفاده از `CURRENCY_LABELS` مشترک و افزودن `usd_us` به schema.
- `src/routes/_app.pricing.purchase-prices.tsx` — رندر داینامیک گزینه‌های Select بر اساس `CURRENCY_LABELS`.
- `src/integrations/supabase/types.ts` — به‌صورت خودکار پس از migration regenerate شد (شامل `usd_us` در `currency_code`).

## 3. New Files
- `docs/lovable-change-reports/2026-05-24-purchase-price-currency-options.md` (همین فایل).
- یک فایل migration جدید توسط ابزار Supabase ساخته شد (timestamped) با محتوای:
  ```sql
  ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'usd_us';
  ```

## 4. Deleted Files
ندارد.

## 5. Environment Variables
بدون تغییر.

## 6. Database Changes
فقط افزودن یک مقدار به enum `public.currency_code`. هیچ داده‌ای تغییر نکرد.

## 7. Schema Changes
- enum `public.currency_code`: `{toman, usd, aed}` → `{toman, usd, aed, usd_us}`.
- جدول `public.currency_rates.currency` از قبل `text` با FK به `currencies.code` بود — بدون تغییر.
- جدول `public.currencies` از قبل ردیف `usd_us` را داشت — بدون تغییر.

## 8. Storage Changes
ندارد.

## 9. Migration Required
بله. یک migration جدید زیر `supabase/migrations/` اضافه می‌شود و باید روی Local اعمال شود:
```sql
ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'usd_us';
```

## 10. Local Update Steps
1. **Backup دیتابیس Local** قبل از هر کار:
   ```bash
   bash deploy/backups/scripts/backup-postgres.sh
   ```
2. `git pull origin main`
3. اعمال migration روی Local:
   ```bash
   bash deploy/local/scripts/local-apply-migrations.sh
   ```
4. در صورت نیاز، ثبت یک نرخ فعال برای `usd_us` در صفحه `/pricing/currency-rates`.
5. باز کردن `/pricing/purchase-prices` و بررسی نمایش هر چهار ارز در dropdown.
6. تست ثبت یک قیمت خرید با ارز «دلار تهران».
7. تست محاسبه قیمت برای محصول دارای قیمت خرید `usd_us` — اگر نرخ فعال وجود نداشته باشد پیام «نرخ ارز معتبر برای محاسبه قیمت موجود نیست» نمایش داده می‌شود (رفتار درست).

## 11. Backup Required
بله — Backup کامل دیتابیس Local قبل از اعمال migration. (افزودن مقدار به enum در Postgres به‌سادگی reversible نیست.)

## 12. Export Required
- Export از Lovable: خیر.
- Storage export: خیر.

## 13. Risk Level
**LOW** — فقط افزودن یک مقدار به enum، بدون اثر روی داده‌های موجود یا کوئری‌های فعلی. کد فرانت فقط schema/labelها را گسترش می‌دهد.

## 14. Rollback Plan
- **کد:** `git revert <commit-hash>`.
- **دیتابیس:** حذف یک مقدار از enum در Postgres built-in نیست. اگر rollback واقعی لازم شد:
  1. بازگردانی از backup مرحله ۱۰.۱، یا
  2. بازسازی enum با ساخت type جدید، تبدیل ستون‌ها و drop کردن type قدیم. در عمل، چون مقدار `usd_us` فقط اضافه‌شده است، **استفاده‌نکردن از آن** معادل rollback است و نیازی به تغییر دیتابیس نیست.

## 15. Post-Update Tests
- [ ] `/pricing/purchase-prices` → dialog ثبت قیمت خرید → dropdown ارز ۴ گزینه با labelهای صحیح نشان می‌دهد.
- [ ] انتخاب «دلار تهران» و ثبت موفق (در صورت وجود نرخ usd_us).
- [ ] اگر نرخ فعال usd_us نیست، محاسبه قیمت با پیام واضح فارسی متوقف می‌شود.
- [ ] ارزهای قبلی (تومان، دلار سلیمانیه، درهم امارات) همچنان کار می‌کنند.
- [ ] `npm run build` و `npm run lint` پاس می‌شوند.

---

## GitHub
طبق رویه Lovable، این تغییر روی branch پیش‌فرض GitHub متصل (معمولاً `main`) sync می‌شود. نام دقیق branch و commit hash در پنل Lovable (Project → GitHub → Commits) قابل مشاهده است؛ این sandbox به git CLI دسترسی ندارد تا hash را اعلام کند.