# پلن: مدیریت یادآوری‌ها و رسیدگی به موجودی/قیمت

تمام تغییرات فقط UI روی frontend است؛ هیچ migration/RLS/endpoint جدیدی ساخته نمی‌شود. از hookها و queryهای موجود (`product_owner_assignments`, `products`, `purchase_prices`, `currency_rates`) از طریق client Supabase استفاده می‌کنیم. ریسک: **LOW**.

## ۱) ثابت‌های قابل پیکربندی

فایل جدید `src/lib/popups/config.ts`:

- `STOCK_STALE_DAYS = 3`
- `PURCHASE_PRICE_STALE_DAYS = 2`
- `USD_DRIFT_THRESHOLD_PCT = 3`
- `POPUP_TTL_MS` را از `PopupCenterProvider` به این فایل منتقل/بازصدور می‌کنیم تا تمام زمان‌ها متمرکز و تغییرپذیر باشند (پیش‌فرض ۲۴ ساعت).

## ۲) صفحهٔ «رسیدگی محصولات» (نام دکمه: «فرصت جبران»)

- مسیر جدید: `src/routes/_app.pricing.attention.tsx` با کامپوننت `AttentionPage`.
- دکمه‌ای در نوار بالای `src/routes/_app.pricing.my-workbench.tsx` (کنار filters) با متن «فرصت جبران» و آیکن `LifeBuoy` که به این مسیر `<Link>` می‌زند.
- محتوای صفحه دو تب:
  - **ناموجودهای بیش از ۳ روز**: query از `products` با `stock_status='unavailable'` و `updated_at < now() - 3d` (در صورت نبود فیلد lastChange، روی `product_sale_price_history` یا `purchase_prices.updated_at` fallback می‌کنیم — در پیاده‌سازی با read query بررسی می‌شود)، join با `product_owner_assignments` + `profiles` برای نمایش نام مسئول.
  - **قیمت خرید تومانی کهنه (>۲ روز بدون به‌روزرسانی)** و **اختلاف معادل دلاری >۳٪** نسبت به آخرین نرخ `currency_rates` (USD): محاسبه در client با گرفتن آخرین `purchase_prices` تومانی + آخرین نرخ دلار.
- هر سطر: نام محصول، SKU، مسئول(ها)، تاریخ آخرین تغییر، badge وضعیت، لینک به صفحه محصول.
- pagination ساده + debounce search، RTL.

## ۳) پاپ‌آپ یادآوری در صفحه اصلی مسئول

- کامپوننت جدید `src/shared/components/OwnerRemindersListener.tsx` (mount در `AppShell` کنار `PriceChangePopupListener`).
- در mount، اگر کاربر لاگین است: یک‌بار query می‌زند برای محصولاتی که `user.id` مالک آن‌هاست و یکی از سه شرط برقرار است:
  1. `stock_status='unavailable'` بیش از ۳ روز
  2. آخرین `purchase_prices` تومانی > ۲ روز قدیمی
  3. drift معادل دلاری > ۳٪
- برای هر مورد یک `toast` با action «متوجه شدم» نمایش می‌دهد؛ در `onAutoClose/onDismiss` بدون ack، آیتم با `usePopupCenter().add(...)` به مرکز پاپ‌آپ‌ها منتقل می‌شود (الگوی موجود در `PriceChangePopupListener`). throttle مشابه برای جلوگیری از سیل toast.
- استفاده از `id` پایدار `reminder-<productId>-<type>-<dayBucket>` تا در همان روز تکراری ساخته نشود (dedupe via `add` که id تکراری را رد می‌کند).

## ۴) مرکز پاپ‌آپ‌ها

بدون تغییر در ساختار `PopupCenterProvider`/`_app.popup-center.tsx`. فقط `POPUP_TTL_MS` از `config.ts` خوانده می‌شود تا تنظیم متمرکز باشد.

## ۵) Nav

افزودن آیتم «فرصت جبران» به گروه «کارگاه قیمت» در `src/components/layout/nav-items.ts` با مسیر `/pricing/attention`.

## فایل‌های تغییر یافته/جدید

- جدید: `src/lib/popups/config.ts`
- جدید: `src/routes/_app.pricing.attention.tsx`
- جدید: `src/shared/components/OwnerRemindersListener.tsx`
- جدید: `src/lib/pricing/attention-queries.ts` (queryهای ناموجود کهنه / قیمت کهنه / drift دلار)
- ویرایش: `src/lib/popups/PopupCenterProvider.tsx` (خواندن TTL از config)
- ویرایش: `src/components/layout/AppShell.tsx` (mount listener جدید)
- ویرایش: `src/components/layout/nav-items.ts`
- ویرایش: `src/routes/_app.pricing.my-workbench.tsx` (دکمه «فرصت جبران»)

## ریسک

LOW — بدون تغییر سرور/DB/RLS؛ فقط جداول موجود readonly خوانده می‌شوند.

&nbsp;

- هنگام پیاده‌سازی کوئری‌های «ناموجود بیش از ۳ روز» و «قیمت خرید کهنه»، دقیقاً مشخص کنید که تاریخ مرجع چیست و از فیلدهای مناسب (مثل `purchase_prices.updated_at` یا `product_sale_price_history.updated_at`) استفاده کنید تا نتایج اشتباه نباشد.
- برای محاسبهٔ اختلاف معادل دلاری بیش از ۳٪، مطمئن شوید نرخ دلار به‌صورت مطمئن و متمرکز در اختیار است تا محاسبات یکسان شود.
- ماژول `OwnerRemindersListener` را طوری طراحی کنید که به‌طور دوره‌ای (مثلاً هر ساعت) داده‌ها را تازه کند یا با subscribe مناسب، تا از تکرار یا ازدست رفتن یادآوری‌ها جلوگیری شود.
- مطمئن شوید که پیکربندی TTL و سایر ثابت‌ها از طریق environment یا فایل config به‌راحتی قابل تغییر است، تا تغییر آینده ساده باشد.