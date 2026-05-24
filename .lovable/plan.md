# افزودن ارز usd_us (دلار تهران) به فرم ثبت قیمت خرید

## یافته‌های بررسی دیتابیس

- `public.currencies` چهار ارز را دارد: `toman`, `usd` (دلار سلیمانیه), `aed`, `usd_us` (دلار تهران). ✅
- `public.currency_rates.currency` از نوع **text** با FK به `currencies.code` است → نیازی به migration ندارد. اگر برای usd_us نرخ ثبت شود همین حالا قابل استفاده است.
- `public.purchase_prices.currency` از نوع **enum `currency_code**` است و enum فقط شامل `{toman, usd, aed}` است → **migration الزامی** برای افزودن مقدار `usd_us` به enum.
- `currency_rates` در حال حاضر هیچ ردیف فعالی برای `usd_us` ندارد. موتور قیمت‌گذاری (`src/lib/pricing/engine.ts`) از قبل وقتی نرخ پیدا نشود `PricingError('NO_CURRENCY_RATE', 'نرخ ارز معتبر برای محاسبه قیمت موجود نیست.')` می‌اندازد، پس قید ۵ درخواست شما به‌صورت طبیعی پوشش داده می‌شود (پیام واضح فارسی موجود است).

## 🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨

این تغییر یک migration روی enum دارد. قبل از اجرای migration روی Local:

1. **Backup دیتابیس Local** الزامی است.
2. **Export از Lovable لازم نیست** (فقط افزودن مقدار به enum).
3. **Storage export لازم نیست**.

### مشخصات تغییر دیتابیس

- **بخش تغییرکننده:** فقط enum `public.currency_code` (افزودن مقدار `usd_us`).
- **چرا ضروری است:** ستون `purchase_prices.currency` از این enum استفاده می‌کند و بدون افزودن مقدار، insert با `usd_us` در سطح دیتابیس reject می‌شود.
- **Migration:** بله — یک migration کوتاه با `ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'usd_us';`
- **Backup Local:** بله، قبل از apply.
- **Export از Lovable:** خیر.
- **Storage export:** خیر.
- **ریسک:** **LOW** — فقط افزودن یک مقدار جدید به enum؛ روی داده‌های موجود اثر ندارد، reversible نیست به‌سادگی (Postgres حذف مقدار enum را به‌صورت built-in پشتیبانی نمی‌کند) ولی استفاده‌نکردن از مقدار جدید عملاً معادل rollback است.

## تغییرات کد (جراحی)

### 1. `src/lib/pricing/constants.ts`

- افزودن `usd_us` به `CURRENCY_LABELS`:
  - `toman` → "تومان"
  - `usd` → "دلار سلیمانیه" (تغییر از "دلار")
  - `aed` → "درهم امارات" (تغییر از "درهم")
  - `usd_us` → "دلار تهران"
- `CurrencyCode` خودش از `Database["public"]["Enums"]["currency_code"]` می‌آید؛ پس از regenerate شدن `types.ts` بعد از migration، نوع به‌صورت خودکار شامل `usd_us` می‌شود.

### 2. `src/lib/pricing/schemas.ts`

- `purchasePriceSchema.currency`: `z.enum(["toman","usd","aed"])` → `z.enum(["toman","usd","aed","usd_us"])`.
- `currencyRateSchema.currency` فعلاً `z.enum(["usd","aed"])` است؛ خارج از scope این درخواست است و دست‌نخورده می‌ماند (آن schema مربوط به فرم ثبت نرخ ارز است، نه ثبت قیمت خرید).

### 3. `src/shared/components/PurchaseForm.tsx`

- حذف `CURRENCY_LABELS` و `currency` enum محلی داخل فایل و استفاده از `CURRENCY_LABELS` و `CurrencyCode` از `@/lib/pricing/constants` (تک‌منبع حقیقت).
- `schema.currency` به‌جای `z.enum(["toman","usd","aed"])` از `z.enum(["toman","usd","aed","usd_us"])` استفاده می‌کند.
- بقیه‌ی فرم بدون تغییر.

### 4. `src/routes/_app.pricing.purchase-prices.tsx`

- چون از همان `CURRENCY_LABELS` و `purchasePriceSchema` import می‌کند، با اصلاح موارد بالا، dropdown به‌صورت خودکار همهٔ چهار ارز را نشان می‌دهد. تغییر مستقیم اضافی در این فایل لازم نیست (در صورت نیاز، صرفاً فیلتر `currency: 'all' | CurrencyCode` به‌خاطر type گسترش‌یافته همچنان معتبر باقی می‌ماند).

### بدون تغییر

- موتور قیمت‌گذاری (`src/lib/pricing/engine.ts`) — از قبل با هر کد ارز موجود در `currency_rates` کار می‌کند و خطای واضح فارسی برای نبود نرخ برمی‌گرداند.
- RLS / RBAC / Storage / Auth / Docker / env: بدون تغییر.
- `src/integrations/supabase/types.ts`: پس از apply شدن migration به‌صورت خودکار regenerate می‌شود (دست‌نخورده).

## گزارش تغییر

ساخت فایل `docs/lovable-change-reports/2026-05-24-purchase-price-currency-options.md` با ۱۵ بخش استاندارد افراکالا، شامل بنر `🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨` و مراحل Local update:

```text
1. Backup Local DB: pg_dump ...
2. git pull origin main
3. اجرای migration جدید روی Local (افزودن usd_us به enum)
4. ثبت یک نرخ فعال برای usd_us در صفحه /pricing/currency-rates (در صورت نیاز)
5. تست ثبت قیمت خرید با ارز «دلار تهران»
6. تست محاسبه قیمت برای محصول با قیمت خرید usd_us
```

## Rollback Plan

- Frontend: revert commit.
- Migration: حذف مقدار از enum به‌سادگی ممکن نیست؛ ولی اگر استفاده نشود مشکلی ندارد. در صورت اصرار، باید enum بازسازی شود (procedure در گزارش مستند می‌شود) یا از backup قبل از apply استفاده شود.

## Post-Update Tests

1. `/pricing/purchase-prices` → دکمه «ثبت قیمت خرید» → dropdown ارز ۴ گزینه نشان می‌دهد با labelهای جدید.
2. انتخاب «دلار تهران» و ثبت موفق (با وجود نرخ فعال usd_us).
3. اگر نرخ usd_us فعال نیست → موتور قیمت در `/pricing/calculator` یا انتشار قیمت پیام «نرخ ارز معتبر برای محاسبه قیمت موجود نیست» را نشان می‌دهد.
4. ارزهای قبلی (toman/usd/aed) همچنان کار می‌کنند.
5. `npm run build` و `npm run lint` پاس می‌شوند.

## GitHub

پس از apply: branch و commit hash نهایی در پیام پایانی اعلام می‌شود (طبق رویه Lovable به branch پیش‌فرض GitHub sync می‌شود).  
  
  
Approved with one clarification:

Because public.purchase_prices.currency uses enum public.currency_code and generated Supabase types currently only include toman/usd/aed, please ensure the commit also keeps TypeScript build green.

Either:

1. regenerate/update src/integrations/supabase/types.ts after adding usd_us to enum,

or

2. adjust the CurrencyCode typing locally so the app accepts usd_us without type errors.

Do not assume types.ts regenerates automatically unless the generated file is actually updated in the commit or build confirms it.

Also please include the exact migration file name and final branch + commit hash.