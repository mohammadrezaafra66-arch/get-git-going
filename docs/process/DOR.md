# Definition of Ready — DoR

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## 1. هدف

هیچ Task Packet نباید وارد اجرا شود مگر اینکه آماده، محدود، قابل تست و بدون ابهام باشد.

## 2. شرایط آماده بودن یک Task

یک Task آماده است اگر همه موارد زیر را داشته باشد:

1. هدف دقیق و یک‌خطی.
2. Phase Label مشخص: BASELINE، PHASE-0، PHASE-1 یا FUTURE.
3. فایل‌های مجاز برای تغییر.
4. فایل‌ها یا محدوده‌های ممنوع برای تغییر.
5. خروجی مورد انتظار.
6. تست یا روش بررسی.
7. مالک اجرا.
8. مالک review.
9. شرط توقف در صورت ابهام.
10. ارجاع به ADR یا سند مرتبط.

## 3. شرایط رد شدن Task قبل از شروع

Task نباید شروع شود اگر:

- scope آن کلی یا مبهم است.
- شامل ساخت ربات واقعی در فاز صفر است.
- نیاز به secret دارد ولی مسیر امن مشخص نیست.
- تغییر دیتابیس دارد ولی migration و rollback مشخص نیست.
- به UI، Worker و Database همزمان دست می‌زند بدون تقسیم به packet کوچک‌تر.

## 4. قالب حداقلی Task Packet

```text
Task ID:
Phase Label:
Owner:
Reviewer:
Goal:
Allowed files:
Forbidden files:
Expected output:
Test plan:
Stop conditions:
Related ADR/docs:
```

## 5. قانون اجرایی

Cursor فقط باید با Task Packet آماده کار کند. دستورهای کلی مثل «فاز صفر را بساز» ممنوع است.
