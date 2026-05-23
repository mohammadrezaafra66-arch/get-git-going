## هدف
رفع مشکل «همش می‌پره بیرون / در حال بررسی جلسه کاربری...» با تغییر کوچک و محدود در لایه auth/session، بدون دست‌زدن به pricing، dashboard/sidebar، invoices، migrations، deploy یا فایل‌های نامرتبط.

## تشخیص فعلی
- لاگ‌های مرورگر نشان می‌دهند بعد از reconnect/reload در محیط Lovable، رویدادهای `SIGNED_IN` و سپس `INITIAL_SESSION` تکرار می‌شوند.
- در `src/lib/auth/session.ts` چند مسیر هنوز `loading: true` را برای session معتبر فعال می‌کنند؛ همین باعث می‌شود کل AppShell موقتاً با صفحه «در حال بررسی جلسه کاربری...» جایگزین شود.
- احتمال اصلی: `ensureAuthReady(true)` یا رویدادهای auth هنگام refresh/reconnect، حتی برای همان user، identity را دوباره با loading سراسری resolve می‌کنند.

## تغییرات پیشنهادی
1. در `src/lib/auth/session.ts`:
   - برای session معتبرِ همان کاربر، از روشن‌کردن `loading` سراسری جلوگیری می‌کنم.
   - reload هویت را برای همان user به `profileLoading/rolesLoading` محدود می‌کنم تا AppShell نپرد.
   - رفتار `TOKEN_REFRESHED` و `USER_UPDATED` حفظ می‌شود و loading سراسری ایجاد نمی‌کنند.
   - مقدار اولیه `hydrated` در login دست‌نخورده می‌ماند.

2. در صورت نیاز فقط برای کاهش نویز/تشخیص بهتر، `src/lib/auth/diagnostics.ts` را خیلی محدود تنظیم می‌کنم تا رویدادهای عادی session به‌عنوان خطای console ثبت نشوند، اما diagnostics همچنان ذخیره و قابل کپی باشد.

3. فایل‌های route مثل `_app.tsx` و `login.tsx` را فقط اگر برای تکمیل fix لازم باشد، در همان محدوده auth/session تغییر می‌دهم؛ در غیر این صورت دست نمی‌زنم.

## فایل‌های مجاز برای تغییر
حداکثر همین ۴ فایل:
- `src/lib/auth/session.ts`
- `src/lib/auth/diagnostics.ts`
- `src/routes/_app.tsx`
- `src/routes/login.tsx`

## فایل‌ها و حوزه‌های ممنوع
- هیچ تغییر در pricing، sale-list PDF، bot API، dashboard/sidebar، invoices، deploy، migration، database/RLS/RBAC/storage/auth config یا docs change report.
- گزارش docs جدید ساخته نمی‌شود.

## اعتبارسنجی بعد از اجرا
- بررسی diff و diffstat فقط برای ۴ فایل مجاز.
- اجرای چک‌های خواندنی git برای branch و commit.
- در صورت امکان، تست دستی preview: ورود، refresh، برگشت از tab/reconnect، و مسیر `/pricing/my-workbench` بدون گیرکردن روی loading.
- build/lint دستی اجرا نمی‌کنم مگر در حالت build اجازه داده شود و مطابق محدودیت‌های محیط ممکن باشد؛ نتیجه یا عدم اجرا را صریح گزارش می‌دهم.

## ریسک و rollback
- ریسک: متوسط رو به پایین؛ فقط رفتار نمایش loading در auth تغییر می‌کند.
- rollback: revert همین تغییرات محدود در فایل‌های auth/session.