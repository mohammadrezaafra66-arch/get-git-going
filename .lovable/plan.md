## مشکل

نمودار «تاریخچه قیمت فروش» داده‌اش را از جدول `product_sale_price_history` می‌خواند. این جدول فقط زمانی پر می‌شود که `calculateSalePrice(..., force_snapshot: true)` یا `publishProductPrices(...)` اجرا شود.

اما در صفحهٔ `/pricing/my-workbench` وقتی کاربر قیمت را تغییر و ذخیره می‌کند، تنها `upsertPurchasePrice` صدا زده می‌شود که فقط:
- یک ردیف جدید در `purchase_prices` می‌سازد
- ردیف قبلی را expire می‌کند
- یک audit log ثبت می‌کند

**هیچ بازمحاسبهٔ قیمت فروشی انجام نمی‌شود** و در نتیجه `product_sale_price_history` به‌روزرسانی نمی‌گردد. این دقیقاً همان چیزی است که در نمودار می‌بینید: تغییرات جدید قیمت در نمودار ظاهر نمی‌شوند.

## راه‌حل

پس از موفقیت `upsertPurchasePrice` در `saveRow` (در فایل `src/routes/_app.pricing.my-workbench.tsx`)، به‌صورت خودکار `publishProductPrices` را برای همان محصول صدا بزن. این کار:

1. قیمت فروش جدید را بر اساس قیمت خرید تازه محاسبه می‌کند
2. `product_computed_prices` را upsert می‌کند تا /sales/search مقدار جدید را ببیند
3. در صورت تغییر، یک ردیف جدید در `product_sale_price_history` درج می‌کند
4. به‌خاطر Realtime که قبلاً فعال شد، نمودار باز در drawer به‌صورت زنده نقطهٔ جدید را نمایش می‌دهد

## جزئیات پیاده‌سازی

فایل: `src/routes/_app.pricing.my-workbench.tsx`

- import کردن `publishProductPrices` از `@/lib/pricing/publish-prices`.
- داخل `saveRow`، بعد از `await upsertPurchasePrice(...)` و فقط در صورتی که قیمت تغییر کرده باشد:
  ```ts
  const pubRes = await publishProductPrices({
    productId: row.id,
    source: "workbench_save",
  });
  ```
- نتیجه را به toast اضافه کن: تعداد نوع‌قیمت‌های موفق و ناموفق («n قیمت فروش به‌روز شد»). در صورت failed > 0 با لحن هشدار نمایش بده اما خطا throw نکن (تغییر قیمت خرید قبلاً ثبت شده).
- invalidate کردن کلیدهای کش مرتبط:
  - `["workbench-rows"]` (موجود است)
  - `["product-price-history", row.id]` و `["product-computed-prices"]` تا UI تازه شود
- در `saveAll` نیازی به تغییر اضافی نیست چون `saveRow` را صدا می‌زند.

## ریسک‌ها و ملاحظات

- `publishProductPrices` برای همهٔ `sale_price_types` فعال اجرا می‌شود؛ ممکن است کمی کند باشد. در workbench این قابل قبول است چون کاربر آگاهانه «ذخیره» می‌زند. اگر در `saveAll` کندی محسوس شد، در آینده می‌توان آن را به صف یا batch RPC منتقل کرد (خارج از این تغییر).
- اگر `fetchLatestPurchasePrice` بلافاصله بعد از insert ردیف جدید را نگیرد (race)، احتمال خطا هست؛ ولی `upsertPurchasePrice` synchronous است و رکورد فعال قبلی expire شده، پس کوئری بعدی همان رکورد جدید را برمی‌گرداند.
- برای محصولاتی که قیمت خرید معتبر ندارند، `publishProductPrices` پاسخ failed برمی‌گرداند بدون throw — در toast فقط هشدار نمایش داده می‌شود.

## تست دستی

1. باز کردن `/pricing/my-workbench`، انتخاب یک محصول، تغییر قیمت و ذخیره.
2. باز کردن drawer «تاریخچه قیمت» همان محصول از `/sales/search`.
3. مشاهدهٔ نقطهٔ جدید در نمودار و یک ردیف جدید در «آخرین تغییرات».
4. تغییر مجدد قیمت → نقطهٔ سوم باید بدون refresh (به‌لطف Realtime) ظاهر شود.

## خارج از محدوده

- تغییر منطق `engine.ts` یا ساختار جدول‌ها.
- بازطراحی نمودار یا برچسب‌ها.
- اجرای publish روی همهٔ محصولات هم‌زمان از workbench (پشتیبانی فعلی `saveAll` کافی است).