## هدف
ثبت تاریخچهٔ تغییرات هنگام ذخیرهٔ ویرایش محصول (با کاربر، زمان و فیلدهای تغییر یافته) و نمایش آن در صفحهٔ جزئیات محصول.

## جدول و ذخیره‌سازی
از جدول موجود `audit_logs` استفاده می‌کنیم (مطابق الگوی `src/lib/pricing/workbench.ts`):
- `entity_type = "product"`
- `entity_id = productId`
- `action = "product_update"`
- `actor_id = userId`
- `diff = { changes: { field: { from, to, label } }, label_changes?: {...}, dynamic_changes?: {...} }`

نیازی به migration جدید نیست — جدول و RLS از قبل وجود دارند.

## تغییرات کد

### ۱) helper جدید: `src/lib/products/audit.ts`
- `diffProductFields(prev, next)` — مقایسهٔ فیلدهای فرم محصول و تولید آبجکت `changes` فقط برای فیلدهای واقعاً تغییر‌کرده، با label فارسی هر فیلد.
- `diffLabels(prevIds, nextIds, allLabels)` — لیست برچسب‌های اضافه/حذف شده با عنوان.
- `diffDynamicValues(prevValues, nextValues, defs)` — تغییرات ویژگی‌های اختصاصی.
- `logProductUpdate(productId, actorId, diff)` — درج در `audit_logs` تنها در صورت وجود تغییر.

### ۲) `src/routes/_app.products.$id.tsx` (handleSave)
- قبل از `update`، snapshot از مقادیر فعلی (`p`، `editDataQ.data.labelIds`، `editDataQ.data.dynamicValues`) بگیر.
- بعد از موفقیت همه عملیات، `diff` کامل را بساز و در صورت غیرخالی بودن، `logProductUpdate` را صدا کن.
- در صورت خطای logging فقط `console.warn` (ذخیرهٔ اصلی نباید fail شود).
- `queryClient.invalidateQueries(["product-history", id])`.

### ۳) کارت جدید «تاریخچهٔ تغییرات» در همان صفحه
- `useQuery(["product-history", id])` که `audit_logs` را با `entity_type='product'`، `entity_id=id`، `action like 'product_%'`، `order created_at desc`، `limit 50` می‌خواند.
- نام کاربر را با join دستی روی `profiles` (مشابه الگوی owners در همان فایل) نمایش بده.
- هر ردیف: تاریخ شمسی + نام کاربر + لیست فیلدهای تغییر یافته به صورت `label: from → to`. برای برچسب‌ها/ویژگی‌ها هم نمایش "افزوده شد / حذف شد".
- اگر خالی، پیام «تغییری ثبت نشده است.»

### ۴) رفع خطای runtime
خطای `AuthLoadingScreen` export — مربوط به این task نیست؛ در `src/routes/_app.tsx` تابع داخلی است. به نظر می‌رسد مشکل HMR موقتی است؛ بدون تغییر اضافه، بازنویسی فایل کفایت می‌کند. بررسی و در صورت نیاز، تابع را قبل از `createFileRoute` تعریف می‌کنیم.

## معیارهای پذیرش
- ذخیرهٔ ویرایش بدون تغییر → هیچ رکورد audit جدیدی ثبت نشود.
- تغییر یک فیلد → یک رکورد با `from/to` آن فیلد ثبت و در کارت تاریخچه نمایش داده شود.
- تغییر برچسب/ویژگی اختصاصی → در همان رکورد لیست شود.
- نام کاربر فعلی به‌درستی نمایش داده شود.
- RLS موجود `audit_logs` دست‌نخورده باقی می‌ماند.
