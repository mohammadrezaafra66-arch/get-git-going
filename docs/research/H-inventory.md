# پکیج H — انبار و موجودی (آیتم‌های ۱۷۳، ۱۷۶، ۱۷۷، ۱۸۳)

## خلاصهٔ پکیج
سیستم **هیچ مدل انبارداری چندانباره (multi-warehouse) ندارد**. جدولی به نام `warehouses` وجود ندارد و جست‌وجوی کامل در `information_schema.tables` هیچ جدول انبار/موجودی/حرکت کالا برنگرداند (فقط `stock_alert_requests` و `inquiry_transfers` که هیچ‌کدام انبار نیستند). موجودی به‌صورت **کمی (عددی) نگه‌داری نمی‌شود**؛ تنها یک ستون **enum وضعیتی** روی `products` به نام `stock_status` با مقادیر `available / unavailable / limited / unknown` وجود دارد. خرید (purchase) هیچ تریگری برای افزایش موجودی ندارد — با نبود موجودی عددی، اصولاً «افزایش موجودی» بی‌معناست. در نتیجه: **H1 (۱۷۶) ❌، H2 (۱۷۳) 🔶 فقط وضعیت متنی، H3 (۱۷۳) ❌ خرید موجودی را افزایش نمی‌دهد، H4 (۱۷۷) ❌ انتقال بین‌انباری، H5 (۱۸۳) ❌ گزارش ورود/خروج کالا**. کتابخانهٔ تاریخ شمسی: **`moment-jalaali` (^0.10.4)** به‌علاوهٔ helper محلی `src/lib/i18n/jalali.ts`.

---

### آیتم ۱۷۶ — مفهوم چندانباره / جدول انبارها (H1، بنیادین)

**وضعیت:** ❌ وجود ندارد

**پاسخ کوتاه:** هیچ جدول `warehouses` و هیچ مفهوم انبار در سیستم نیست؛ هفت مورد کدی که واژهٔ «انبار/warehouse» دارند صرفاً برچسب‌های ثابت (دسته‌بندی سند دانش، نوع نقش شخص «متصدی انبار»، نوع تسک) هستند و هیچ فیچر انبارداری‌ای نمی‌سازند. چون این آیتم بنیادین است، آیتم‌های ۱۷۷ و ۱۸۳ نیز خودبه‌خود ❌ می‌شوند.

**شواهد:**
- L3 (DB) — روش جست‌وجو: `SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%warehouse%' OR ILIKE '%انبار%' OR '%inventory%' OR '%stock%' OR '%movement%' OR '%transfer%';` → فقط `inquiry_transfers` و `stock_alert_requests` (هیچ‌کدام انبار نیستند).
- L1/L2 (کد) — روش جست‌وجو: Grep `warehouse|انبار` (case-insensitive) روی `src` → ۷ نتیجه، همه برچسب ثابت:
  - `src\lib\knowledge\constants.ts:16` — `{ value: "warehouse", label: "انبار" }` (دسته‌بندی سند دانش)
  - `src\components\persons\PersonContextLinksForm.tsx:100` — `warehouse_owner: "متصدی انبار"` (نوع نقش شخص)
  - `src\routes\_app.operations.tasks.tsx:84` — `"فروشگاه/انبار"` (لیبل نوع تسک)
  - `src\components\sales\PromotionNominateButton.tsx:33` — `label: "تخلیه انبار"` (دلیل تخفیف)
  - هیچ route ای با نام warehouse/inventory وجود ندارد (طبق ENVIRONMENT FACTS تأیید شده).
- L4 (access): ماژول `warehouse` در `role_permissions` seed نشده (طبق SHARED-CONTEXT) — چون UI/جدولی نیست، بی‌اثر است.

**شکاف نسبت به نیازمندی:** کل مفهوم چندانباره — تعریف انبار، تخصیص موجودی به انبار، کاردکس — غایب است.

**برنچ:** روی سرور (nav) نیست چون در working tree نیست.

**وابستگی‌ها:** پیش‌نیاز آیتم‌های ۱۷۷ و ۱۸۳؛ نبودش آن‌ها را نیز باطل می‌کند.

**برای رفع چه لازم است:** ساخت جدول `warehouses`، جدول موجودی به‌ازای انبار (product×warehouse با ستون عددی qty)، UI مدیریت انبار، و اتصال به مسیر خرید/فروش. کار بنیادی و بزرگ.

**ریسک/پیچیدگی:** بالا — نبود کامل مدل داده؛ نیازمند طراحی schema و migration جدید.

---

### آیتم ۱۷۳ — نگه‌داری موجودی و افزایش آن با خرید (H2 + H3)

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** موجودی فقط به‌صورت یک **وضعیت متنی/enum** (`available/unavailable/limited/unknown`) روی محصول نگه‌داری می‌شود و **هیچ مقدار عددی (تعداد)** ندارد؛ ثبت خرید نیز هیچ تریگر یا کدی برای تغییر این وضعیت ندارد، پس **خرید موجودی را افزایش نمی‌دهد** (H3 ❌). بخش پوشش‌داده‌شده فقط «وضعیت در دسترس بودن» و سازوکار «اطلاع‌رسانی موجود شدن» است.

**شواهد:**
- L3 (DB) — تنها ستون موجودی روی `products`: `stock_status` از نوع `USER-DEFINED` (enum). روش: `SELECT column_name,udt_name FROM information_schema.columns WHERE table_name='products'`. هیچ ستون `quantity/count/qty/موجود عددی` وجود ندارد (Grep روی همان کوئری صفر نتیجه).
- L3 (DB) — مقادیر enum: `SELECT enumlabel FROM pg_enum ...` → `available, unavailable, limited, unknown`.
- L1 (UI) — `src\components\products\ProductForm.tsx:715` فیلد «وضعیت موجودی» با Select روی `values.stock_status` (خط ۷۱۷)؛ پیش‌فرض `unknown` (خط ۷۲).
- L3 (DB) — **سازوکار جانبی موجود:** جدول `stock_alert_requests` (درخواست اطلاع مشتری هنگام موجود شدن) + تریگر `trg_notify_on_stock_available` روی `products` (AFTER UPDATE) → تابع `notify_on_stock_available()`: وقتی `stock_status` از (unavailable/limited/unknown) به `available` تغییر کند، برای درخواست‌های `open` نوتیف در `notification_queue` می‌سازد و رکورد را `notified` می‌کند. (`pg_get_functiondef` مشاهده شد.)
- L1/L2 (UI موجودی‌ساز جانبی): route `src\routes\_app.sales.stock-alerts.tsx:54` (`/_app/sales/stock-alerts`)، دکمهٔ `StockAlertButton` (`src\components\sales\StockAlertButton.tsx:19`)، منطق در `src\lib\sales\stock-alerts.ts`.
- **H3 — روش اثبات نبودِ افزایش موجودی با خرید:**
  - تریگرهای جدول `purchases`: `SELECT ... FROM information_schema.triggers` → فقط `purchases_audit_insert`, `set_updated_at`, `trg_award_accountant_payment_score`, `trg_award_buyer_purchase_score`, `trg_guard_accountant_purchase_update`. **هیچ تریگری `products.stock_status` را به‌روزرسانی نمی‌کند.**
  - تریگرهای `purchase_items`: هیچ (کوئری خالی برگشت).
  - تابع `auto_link_supplier_on_purchase()` (بررسی `pg_get_functiondef`) فقط در `product_suppliers` رکورد لینک تأمین‌کننده می‌سازد — به `stock_status` دست نمی‌زند.
  - جست‌وجوی توابعی که `stock_status` را دستکاری کنند: `SELECT proname FROM pg_proc WHERE prosrc ILIKE '%stock_status%'` → تنها تابعِ نویسنده روی این ستون `notify_on_stock_available` است (بقیه فقط خواندن/فیلتر برای نمایش/توصیه). هیچ‌کدام به خرید وصل نیستند.
- L4 (access): ماژول `products` در `role_permissions` seed شده؛ تغییر `stock_status` از طریق فرم محصول (guard محصولات) کنترل می‌شود.

**شکاف نسبت به نیازمندی:** موجودی عددی/کاردکس وجود ندارد؛ خرید به موجودی متصل نیست؛ کاربر باید دستی `stock_status` را در فرم محصول عوض کند.

**برنچ:** بله — همهٔ موارد بالا در working tree و DB سرور موجودند.

**وابستگی‌ها:** برای «افزایش با خرید» نیازمند مدل موجودی عددی (که فعلاً نیست) و اتصال به `purchases`/`purchase_items`.

**برای رفع چه لازم است:** افزودن ستون یا جدول موجودی عددی، سپس تریگر روی درج `purchases`/`purchase_items` برای افزایش موجودی و در صورت لزوم تغییر خودکار `stock_status`. کار متوسط تا بزرگ چون مدل عددی از پایه نیست.

**ریسک/پیچیدگی:** متوسط — بخش وضعیتی و نوتیف پابرجاست ولی هستهٔ کمی موجودی و پیوند خرید باید از صفر ساخته شود.

---

### آیتم ۱۷۷ — انتقال بین‌انباری کالا (H4)

**وضعیت:** ❌ وجود ندارد

**پاسخ کوتاه:** چون هیچ انباری تعریف نمی‌شود، انتقال بین‌انباری هم بی‌موضوع و غایب است؛ تنها جدول با نام «transfer»، `inquiry_transfers` است که مربوط به واگذاری «استعلام» بین کاربران است، نه کالا.

**شواهد:**
- L3 (DB) — روش: همان جست‌وجوی `information_schema.tables ILIKE '%transfer%'` → فقط `inquiry_transfers`. ستون‌های آن (`SELECT ... columns`) عبارت‌اند از `inquiry_id, from_user, to_user, transferred_at` — یعنی انتقال مالکیت یک inquiry بین دو کاربر، نه حرکت کالا بین انبار.
- L1/L2 (کد) — استفادهٔ `inquiry_transfers` در کد فقط در تعریف تایپ `src\integrations\supabase\types.ts:3798` است؛ هیچ UI انتقال کالا/انبار وجود ندارد.
- وابسته به H1 (۱۷۶): با نبود جدول `warehouses` انتقال بین‌انباری خودبه‌خود منتفی است.

**شکاف نسبت به نیازمندی:** کل قابلیت (مبدأ/مقصد انبار، سند انتقال، اثر روی موجودی) غایب است.

**برنچ:** روی سرور نیست چون در working tree نیست.

**وابستگی‌ها:** کاملاً وابسته به آیتم ۱۷۶ (مدل انبار).

**برای رفع چه لازم است:** ابتدا مدل انبار (۱۷۶) و موجودی عددی، سپس جدول اسناد انتقال با کاهش موجودی مبدأ و افزایش مقصد و UI مربوطه.

**ریسک/پیچیدگی:** بالا — کاملاً وابسته به زیرساخت غایب انبار.

---

### آیتم ۱۸۳ — گزارش ورود/خروج کالا به تفکیک انبار با تاریخ شمسی (H5)

**وضعیت:** ❌ وجود ندارد

**پاسخ کوتاه:** هیچ لاگ حرکت کالا (goods movement / stock movement) در دیتابیس نگه‌داری نمی‌شود و هیچ گزارش ورود/خروج انبار در کد وجود ندارد؛ بنابراین گزارش به‌تفکیک انبار — حتی صرف‌نظر از تاریخ شمسی — غیرقابل ساخت است.

**شواهد:**
- L3 (DB) — روش: `information_schema.tables ILIKE '%movement%'` و `'%stock%'` و `'%inventory%'` → **هیچ جدول movement/inventory**؛ فقط `stock_alert_requests` (درخواست اطلاع، نه حرکت کالا). یعنی هیچ لاگ ورود/خروج کالایی ثبت نمی‌شود.
- L1 (UI) — هیچ route گزارشی با محور موجودی/انبار یافت نشد (routeها با کلید warehouse/inventory وجود ندارند؛ طبق ENVIRONMENT FACTS و Grep بند H1).
- زیرساخت پیش‌نیاز (H1 انبار + H2 موجودی عددی + H3 اثر خرید) هر سه غایب یا فقط وضعیتی‌اند، پس منبع دادهٔ گزارش وجود ندارد.

**نکتهٔ مثبت (تاریخ شمسی آماده است):** اگرچه گزارش وجود ندارد، زیرساخت تاریخ شمسی برای هر گزارش آینده موجود است — پایین‌تر H6.

**شکاف نسبت به نیازمندی:** نه لاگ حرکت کالا، نه بُعد انبار، نه صفحهٔ گزارش — هیچ‌کدام نیست.

**برنچ:** روی سرور نیست چون در working tree نیست.

**وابستگی‌ها:** وابسته به ۱۷۶ (انبار)، ۱۷۳ (موجودی عددی) و لاگ حرکت کالا.

**برای رفع چه لازم است:** ابتدا جدول لاگ حرکت کالا (نوع ورود/خروج، انبار، تعداد، منبع سند)، سپس صفحهٔ گزارش با فیلتر بازهٔ تاریخ و نمایش شمسی از طریق `moment-jalaali`/`isoToJalaliDisplay`.

**ریسک/پیچیدگی:** بالا — کل زنجیرهٔ دادهٔ زیرین باید ساخته شود.

---

### نکتهٔ پشتیبان H6 — الگوی تاریخ شمسی موجود در گزارش‌ها (برای پرامپت اجرایی بعدی)

**کتابخانه:** `moment-jalaali` نسخهٔ `^0.10.4` (و تایپ `@types/moment-jalaali ^0.7.9`) — `package.json` خطوط ۶۶ و ۸۹.

**دو مسیر مصرف در کد:**
1. **کتابخانهٔ `moment-jalaali`** — مثال واقعی: `src\lib\messenger\format.ts`
   - خط ۱: `import moment from "moment-jalaali";`
   - خط ۱۳–۱۵: `const m = moment(input); ... return m.format("jYYYY/jMM/jDD HH:mm");`
   - همچنین در `src\components\dashboard\DashboardHeader.tsx` و `src\hooks\dashboard\useDashboardChart.ts`.
2. **helper محلی بدون وابستگی** — `src\lib\i18n\jalali.ts` با توابع `gregorianToJalali`, `jalaliToGregorian`, `parseDateToGregorianIso`, و `isoToJalaliDisplay(iso)` (خط ۱۰۸) که خروجی `YYYY/MM/DD` با ارقام فارسی می‌دهد. کامپوننت‌های ورودی تاریخ: `src\shared\components\JalaliDateInput.tsx` و `src\components\common\PersianDatePicker.tsx`.

**توصیه برای گزارش انبار آینده:** برای نمایش، `isoToJalaliDisplay` (سبک، بدون وابستگی) یا `moment(iso).format("jYYYY/jMM/jDD")`؛ برای ورودی بازهٔ تاریخ، `JalaliDateInput`/`PersianDatePicker`.
