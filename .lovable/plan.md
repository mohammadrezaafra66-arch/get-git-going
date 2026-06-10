## هدف

سرعت دو نقطه‌ای که کند است را بدون تغییر backend/DB بالا ببریم:
1. **جابجایی بین ماژول‌ها** در ساید‌بار (الان روی هر کلیک، چانک مقصد تازه دانلود می‌شود).
2. **کارگاه قیمت من** که چند کوئری متوالی دارد و هر بار از صفر اجرا می‌شود.

تغییرات صرفاً frontend است؛ هیچ migration/RLS/سرور تغییر نمی‌کند.

## تغییرات

### ۱) Router: preload روی hover/intent
فایل: `src/router.tsx`
- افزودن `defaultPreload: "intent"` تا با hover روی Link چانک مقصد از قبل دانلود شود.
- افزایش `defaultPreloadStaleTime` به مثلاً `30_000` تا بعد از preload دوباره fetch نشود (طبق گاید TanStack Query وقتی Query استفاده می‌شود این مقدار می‌تواند >0 باشد چون کش روتر فقط برای loaderهاست و کوئری‌های ما همگی از TanStack Query هستند).
- نگه‌داشتن `scrollRestoration` و `defaultErrorComponent`.

اثر: کلیک روی آیکن ماژول تقریباً آنی می‌شود چون JS مقصد قبل از کلیک آماده است.

### ۲) Sidebar: prefetch ماژول‌ها هنگام hover روی ریل
فایل: `src/components/layout/AppSidebar.tsx`
- روی دکمه هر ماژول در ریل، `onMouseEnter` / `onFocus` فراخوانی `router.preloadRoute({ to: m.defaultTo })` (یا معادل از `useRouter`) اضافه کنیم. این مکمل گام ۱ است برای دکمه‌های `<button>` که Link نیستند.

### ۳) Lookupها: افزایش staleTime
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- `brands-lite` / `categories-lite` / `labels-lite` / `product-owners-lite`: staleTime از `60_000` به `5 * 60_000` و `gcTime: 30 * 60_000`. این داده‌ها تقریباً ثابت‌اند.
- staleTime کوئری اصلی `workbench-rows-v2` از `15_000` به `30_000` تا تب‌برگشت/refocus refetch نکند.

### ۴) `fetchWorkbenchRowsV2`: موازی کردن pre-filterها
فایل: `src/lib/pricing/workbench-queries.ts`
- در حال حاضر pre-filterها (owner, label, sale price, category) به‌صورت متوالی `await` می‌شوند. آن‌ها مستقل‌اند → جمع‌آوری در یک `Promise.all` و سپس ترکیب نتایج. (منطق early-return در صورت خالی بودن restrict حفظ می‌شود ولی بعد از resolve).
- این کار latency اولیه را تا حدود ۲۰۰–۵۰۰ms کم می‌کند.

### ۵) Memoize ردیف‌های جدول
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- پیچیدن `DesktopRow` و `MobileCard` در `React.memo` با مقایسه سطحی روی `row.id`, `dirty`, `saving`, `publishError`, `stepPct`. اگر کاربر تنها یک ردیف را ویرایش کند، بقیه ۲۴ ردیف re-render نمی‌شوند.

### ۶) جلوگیری از invalidate اضافه پس از save
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- بعد از ذخیره، `invalidateQueries` با key `["workbench-rows"]` و `["workbench-rows-v2"]` هر دو فراخوانی می‌شوند و سپس `refetchQueries` هم. کلید قدیمی `workbench-rows` بلا‌استفاده است → حذف. `refetchQueries` کافی است و invalidate جدا‌گانه حذف شود (یک round-trip به DB کمتر).

## ریسک

- LOW. فقط UI/data-fetching layer. هیچ تغییر schema/RLS/API.
- preload با hover ممکن است مصرف داده را کمی بالا ببرد؛ ولی فقط چانک‌های کوچک JS مسیرهای ماژول است (نه داده DB).

## بررسی self-host

- بدون CDN جدید، بدون secret، بدون dependency جدید.
- اپ همچنان روی Linux+Docker+Supabase self-host بدون تغییر کار می‌کند.

## تأیید پس از اجرا

- `npm run build` و `npm run lint`.
- مسیر دستی: ورود → ساید‌بار → hover روی ماژول‌های مختلف → کلیک. باید تقریباً بدون تأخیر باز شوند.
- «کارگاه قیمت من»: بارگذاری اولیه باید نسبت به قبل سریع‌تر باشد؛ ویرایش یک ردیف نباید بقیه را re-render کند (DevTools Profiler).
