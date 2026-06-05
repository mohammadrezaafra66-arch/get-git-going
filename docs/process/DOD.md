# Definition of Done — DoD

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## 1. هدف

هیچ کاری Done محسوب نمی‌شود مگر اینکه قابل اجرا، قابل تست، قابل review و قابل rollback باشد.

## 2. شرایط Done برای سند

1. عنوان و Phase Label دارد.
2. مالک و وضعیت دارد.
3. با ADR-0001 تناقض ندارد.
4. اگر به Drive mirror می‌شود، مسیر GitHub و commit/tag مشخص است.
5. واژه‌های مبهم مثل «بعداً»، «تقریباً»، «کامل شود» بدون معیار پذیرش ندارد.

## 3. شرایط Done برای کد

1. فقط فایل‌های مجاز Task تغییر کرده‌اند.
2. build/typecheck/lint طبق baseline اجرا یا نتیجه عدم اجرا گزارش شده است.
3. تست دستی یا خودکار مستند شده است.
4. migration impact مشخص است.
5. RLS/RBAC impact مشخص است.
6. secrets در کد یا فرانت‌اند وارد نشده‌اند.
7. هیچ Core، API، دیتابیس یا پنل موازی ایجاد نشده است.
8. real bot در فاز صفر ساخته نشده است.

## 4. شرایط Done برای migration

1. نام migration شفاف است.
2. جدول‌ها و indexها مشخص هستند.
3. RLS بررسی شده است.
4. rollback یا recovery note دارد.
5. داده‌های حساس بدون سیاست امنیتی ذخیره نشده‌اند.

## 5. شرایط رد شدن merge

PR نباید merge شود اگر:

- scope آن از Task Packet بزرگ‌تر شده است.
- به ADR نیاز دارد ولی ADR ندارد.
- تست اجرا نشده و دلیل معتبر ندارد.
- تغییر امنیتی بدون review مالک انجام شده است.
- Lovable/UI وارد منطق Worker یا automation runtime شده است.
