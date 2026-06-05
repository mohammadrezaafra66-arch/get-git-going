# WPC-0-001 — Worker Dummy فاز صفر

Phase Label: PHASE-0  
Owner: TBD  
Reviewer: محمدرضا افرا  
Status: Ready for Planning

## 1. هدف

ساخت یک Worker Dummy که بدون اتصال به هیچ پلتفرم خارجی، مسیر کامل command → claim → run → event → completed را تست کند.

## 2. محدوده مجاز

- docs/automation/**
- automation/openapi/automation-v1.yaml
- automation/schemas/*.json
- مسیر Worker جداگانه یا repo جدا برای Python Worker
- migrationهای automation، فقط در صورت Task Packet جدا

## 3. محدوده ممنوع

- دیوار واقعی
- واتساپ واقعی
- اینستاگرام واقعی
- ترب واقعی
- OCR/STT
- AI production
- ساخت Core موازی
- ساخت دیتابیس موازی

## 4. خروجی مورد انتظار

1. Worker بتواند heartbeat بفرستد.
2. Worker بتواند یک command را claim کند.
3. Worker بتواند run بسازد یا وضعیت run را به‌روزرسانی کند.
4. Worker بتواند events بنویسد.
5. Worker بتواند با موفقیت RUN_COMPLETED ثبت کند.

## 5. تست پذیرش

سناریوی تست:

1. یک command dummy ساخته شود.
2. Worker اجرا شود.
3. command به claimed تغییر کند.
4. run ساخته شود.
5. eventهای RUN_STARTED و RUN_COMPLETED ثبت شوند.
6. UI یا query دیتابیس وضعیت completed را نشان دهد.

## 6. شرط توقف

اگر schema، RLS، مسیر API یا access token نامشخص بود، Worker نباید ساخته شود. باید ابتدا ابهام گزارش شود.
