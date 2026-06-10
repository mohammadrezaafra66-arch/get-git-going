## مشکل
- `QuickAddCustomerDialog` خطاهای سرور را به فارسی map می‌کند (دیدن خطی ۱۱۸-۱۵۶)، اما صفحه‌ی «مشتری جدید» (`/sales/customers/create`) از `CustomerForm` استفاده می‌کند که در `onError` فقط پیام خام را با پیشوند «عملیات ناموفق بود:» نشان می‌دهد (خط ۱۶۴-۱۶۷ از `CustomerForm.tsx`). به همین دلیل کاربر پیام مبهم «ناموفق» می‌بیند.
- در حالت موفقیت هم فقط `["customers"]` invalidate می‌شود؛ برای پایداری بهتر است کلیدهای مرتبط جستجو/persons هم invalidate شوند و در حالت «ایجاد» فرم reset شود.

## محدوده تغییر
فقط UI، بدون تغییر در سرور/DB/RLS. تنها فایل اصلاحی:
- `src/shared/components/CustomerForm.tsx`

`QuickAddCustomerDialog.tsx` از قبل صحیح است و تغییر نمی‌کند. فایل‌های مسیر (`_app.sales_.customers_.create.tsx` و `_app.sales_.customers_.$customerId.edit.tsx`) تغییر نمی‌کنند چون فقط `CustomerForm` را mount می‌کنند.

## تغییرات در `CustomerForm.tsx`

1. **map کردن خطاهای سرور در `onError`** — همان منطق `QuickAddCustomerDialog`:
   - خطای شبکه/`TypeError`/`failed to fetch` → «ارتباط با سرور برقرار نشد…»
   - شامل `کد حسابداری تکراری` یا `accounting_code` → `form.setError("accounting_code", …)` + toast «کد حسابداری تکراری است…»
   - شامل `unauthorized`/`401`/`نشست کاربری` → «نشست منقضی شده…»
   - شامل `forbidden`/`403`/`rls`/`دسترسی` → «دسترسی لازم را ندارید.»
   - شامل `phone` یا `موبایل نامعتبر` → `form.setError("phone", …)` + toast
   - در غیر این صورت پیام خام فارسی serverFn نمایش داده شود؛ اگر خالی بود پیام عمومی «ثبت ناموفق بود…»

2. **به‌روزرسانی `onSuccess`**:
   - `queryClient.invalidateQueries({ queryKey: ["customers"] })` نگه‌داری می‌شود.
   - اضافه: invalidate برای `["customers", "search"]` و `["persons"]` (اگر key وجود نداشته باشد، invalidate بی‌اثر است و امن).
   - در حالت «ایجاد جدید» (نه ویرایش)، قبل از `navigate` فرم `reset` شود تا اگر کاربر برگردد، state تمیز باشد.
   - رفتار navigate به `/sales/customers` بدون تغییر.

3. **حفظ RTL**: کل فرم در حال حاضر `dir="rtl"` دارد؛ تغییری لازم نیست.

## ریسک
LOW — فقط UI و error-mapping. هیچ تغییری در serverFn `createCustomer/updateCustomer`، schema، RLS، migration یا route گزارش نمی‌شود.

## خروجی نهایی
- فایل تغییر یافته: `src/shared/components/CustomerForm.tsx`
- ریسک: LOW