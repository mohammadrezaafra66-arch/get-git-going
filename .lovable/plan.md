## نسخهٔ بازنگری‌شدهٔ پلن (Scope کوچک و امن)

این پلن فقط frontend است، بدون فرمول جدید، بدون پیش‌نمایش زنده، بدون تغییر DB/RLS/auth/storage و بدون migration.

---

### تأییدیه‌های الزامی
- ❌ **بدون** هیچ تغییر در database/schema/tables/columns/enums.
- ❌ **بدون** هیچ migration.
- ❌ **بدون** تغییر در RLS / policies / triggers / functions / foreign keys / indexes / constraints.
- ❌ **بدون** تغییر در auth / storage / buckets / storage policies.
- ❌ **بدون** فرمول جعلی یا تقریب قیمت فروش.
- ❌ **بدون** هوک live preview جدید.
- ❌ **بدون** لمس فایل‌های نامرتبط (engine.ts، publish-prices.ts، workbench.ts، workbench-queries.ts، RBAC، routes غیرمرتبط).
- ✅ Risk Level: **LOW**.
- ✅ نیاز به backup/export ندارد (شرط 🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨 برقرار **نیست**).

---

## یافته‌های کلیدی (تأیید کاربر)
- فیلتر مسئول در `/pricing/my-workbench` از قبل وجود دارد و به `product_owner_assignments` متصل است. فقط discoverability ضعیف است.
- ستون «قیمت فروش» در workbench از `product_computed_prices.rounded_sale_price` خوانده می‌شود.
- پس از save، کد فعلی این invalidationها را انجام می‌دهد:
  - `["workbench-rows-v2"]`
  - `["product-price-history", row.id]`
  - `["product-computed-prices"]`
- این invalidate در حال حاضر هست؛ اما اگر `publishProductPrices` به دلایلی مثل `NO_RULE` ناموفق شود، فقط یک toast کلی نمایش داده می‌شود و **در همان ردیف هیچ پیامی نیست**؛ کاربر گمان می‌کند «refresh نشده» در حالی که واقعاً سمت سرور هیچ مقدار جدیدی تولید نشده.

نتیجه: «refresh نشدن قیمت فروش» در عمل یا (الف) به‌خاطر شکست محاسبه سمت سرور است، یا (ب) نبود feedback روشن در سطح ردیف. این پلن همین دو موضوع را در حداقل ممکن اصلاح می‌کند.

---

## تغییرات (دقیقاً ۲ فایل، Frontend-only)

### فایل ۱: `src/components/pricing/workbench/WorkbenchFiltersBar.tsx`
**هدف:** فقط discoverability فیلتر مسئول موجود.
- اضافه کردن یک ردیف Quick Chips بالای فیلترهای موجود با ۳ گزینه:
  - «محصولات من» → معادل state فعلی `showAll=false` (سیگنال به والد از طریق `onChange` فعلی + یک callback جدید `onScopeChange?: (scope: "mine" | "all" | "no-owner") => void` که والد آن را به state `showAll` و `filters.ownerId` mapping می‌کند).
  - «همه محصولات» → `showAll=true`, `ownerId="all"` (فقط برای admin/manager).
  - «بدون مسئول» → `showAll=true`, `ownerId="none"`.
- Select «مسئول» موجود **حذف یا تغییر نمی‌کند**؛ فقط label فارسی بزرگ‌تر و آیکن مسئول به آن اضافه می‌شود.
- هیچ منطق فیلتری جدید اضافه نمی‌شود؛ همان فیلدهای `WorkbenchFilters` موجود استفاده می‌شود.

### فایل ۲: `src/routes/_app.pricing.my-workbench.tsx`
**هدف:** اتصال chips، نمایش feedback شکست publish در سطح ردیف، و تضمین refresh.

تغییرات حداقلی:
1. **اتصال chips:** والد، callback جدید را به state موجود `showAll` و `filters.ownerId` تبدیل می‌کند. هیچ state جدیدی فراتر از این اضافه نمی‌شود.
2. **نگه‌داری نتیجهٔ publish per-row:** یک state کوچک `publishErrors: Record<string, string>` (محصول → پیام فارسی) اضافه می‌شود.
3. **در `saveRow` (بدون تغییر `upsertPurchasePrice` و بدون تغییر `publishProductPrices`):**
   - بعد از فراخوانی `publishProductPrices`:
     - اگر `pubRes.succeeded > 0` → پاک کردن `publishErrors[row.id]` و نمایش toast موفقیت (مانند الان).
     - اگر `pubRes.failed > 0 && pubRes.succeeded === 0` → استخراج اولین `error` از `pubRes.results` و map کردن متن انگلیسی `PricingError` به پیام فارسی:
       - شامل `"قانون"` یا کد `NO_RULE` → «قانون قیمت‌گذاری منطبق برای این محصول وجود ندارد. نگاشت `pricing_rules` را بررسی کنید.»
       - شامل `"نرخ ارز"` یا `NO_CURRENCY_RATE` / `NO_SHIPPING_RATE` → «نرخ ارز فعال برای محاسبه موجود نیست.»
       - شامل `"قیمت خرید"` یا `NO_PURCHASE_PRICE` → «قیمت خرید معتبر برای این محصول ثبت نشده.»
       - در غیر این صورت همان متن خام برگشتی.
     - ذخیره در `publishErrors[row.id]` + toast هشدار با همان متن فارسی.
   - **invalidate موجود حفظ می‌شود** و **یک invalidate جدید اضافه می‌شود** تا اطمینان کامل از refresh ردیف لیست:
     ```ts
     qc.invalidateQueries({ queryKey: ["workbench-rows-v2"] });
     await qc.refetchQueries({ queryKey: ["workbench-rows-v2"], type: "active" });
     ```
     (تنها تفاوت با وضع فعلی: یک `refetchQueries` صریح تا اگر کاربر فاصلهٔ زمانی staleTime را تجربه نکند، ستون قیمت فروش بلافاصله تازه شود.)
4. **نمایش پیام شکست در ردیف:**
   - در `DesktopRow` و `MobileCard`، اگر `publishErrors[row.id]` تنظیم شده، یک Badge کوچک قرمز زیر/کنار ستون «قیمت فروش» با متن کوتاه (مثلاً «خطای محاسبه — جزئیات در پیام») نمایش داده می‌شود و عنوان (title) آن متن کامل فارسی دارد.
   - وقتی کاربر مجدد ذخیره کرد و موفق شد، پیام پاک می‌شود.

**هیچ کد دیگری در این فایل دست‌کاری نمی‌شود.**

---

## آنچه انجام **نمی‌شود** (در پاسخ به اصلاحات کاربر)
- ❌ هوک `useSaleP ricePreview` ساخته نمی‌شود.
- ❌ هیچ پیش‌نمایش زنده‌ای از قیمت فروش هنگام تایپ نشان داده نمی‌شود.
- ❌ کارت دیاگنوستیک `PricingRulesMappingDiagnostics` ساخته نمی‌شود (در صورت نیاز، در یک تسک جداگانه و فقط با کوئری‌های read-only پیشنهاد خواهد شد).
- ❌ موتور قیمت‌گذاری (`engine.ts`) لمس نمی‌شود.
- ❌ `publish-prices.ts` لمس نمی‌شود.
- ❌ `workbench.ts` و `workbench-queries.ts` لمس نمی‌شوند.
- ❌ schema/migration/RLS/auth/storage بدون تغییر.

---

## فایل‌های لمس‌شده (کامل)
1. `src/components/pricing/workbench/WorkbenchFiltersBar.tsx`
2. `src/routes/_app.pricing.my-workbench.tsx`

## فایل‌های لمس‌نشده (تأیید)
- `src/lib/pricing/engine.ts`
- `src/lib/pricing/publish-prices.ts`
- `src/lib/pricing/workbench.ts`
- `src/lib/pricing/workbench-queries.ts`
- `src/lib/pricing/process-recompute-queue.server.ts`
- هیچ migration، RLS، policy، trigger، function، storage یا auth.

---

## مراحل آزمون دستی
1. ورود با admin → `/pricing/my-workbench`.
2. سه chip «محصولات من / همه محصولات / بدون مسئول» در بالای فیلترها قابل کلیک باشد و رفتار درست داشته باشد.
3. Select «مسئول» موجود همچنان کار کند.
4. ویرایش قیمت خرید یک محصولی که `pricing_rules` منطبق دارد → بعد از Save، ستون «قیمت فروش» همان ردیف **بلافاصله** مقدار جدید از `product_computed_prices` را نشان دهد.
5. ویرایش قیمت خرید محصولی که rule منطبق ندارد → Badge قرمز فارسی در ردیف + toast فارسی واضح. ستون قیمت فروش تغییر نمی‌کند (چون سمت سرور هیچ مقدار جدیدی تولید نشده) و **هیچ عدد جعلی نمایش داده نمی‌شود**.
6. اجرای `npm run build` و `npm run lint` — نتایج گزارش می‌شود.

---

## گزارش پایان تغییر
بعد از اعمال تغییرات، یک فایل گزارش جدید با ۱۵ بخش الزامی ساخته می‌شود:
`docs/lovable-change-reports/YYYY-MM-DD-HHMM-fix-pricing-workshop-owner-chips-and-refresh.md`

### پیش‌نمایش بخش‌های حساس گزارش
- Database Changes: None
- Schema Changes: None
- Storage Changes: None
- Migration Required: No
- Backup Required: No
- Export Required: No
- Risk Level: LOW
- Rollback Plan: revert دو فایل ذکر شده در commit واحد روی branch `fix-pricing-workshop-dashboard-and-sale-price`.