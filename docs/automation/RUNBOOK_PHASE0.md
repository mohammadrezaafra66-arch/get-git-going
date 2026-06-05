# Runbook عملیاتی فاز صفر

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Draft

## 1. هدف

این Runbook فقط برای فاز صفر است: contract، جدول‌های automation، Worker Dummy و تست E2E. این سند برای اجرای ربات واقعی نیست.

## 2. سناریوهای اصلی

### 2.1 شروع سیستم

1. وضعیت Supabase/PostgreSQL بررسی شود.
2. migrationهای فاز صفر بررسی شوند.
3. UI یا route مربوط به automation status بررسی شود.
4. Worker Dummy با `.env` درست اجرا شود.
5. heartbeat در جدول مربوط ثبت شود.

### 2.2 توقف امن Worker Dummy

1. Worker نباید command جدید claim کند.
2. اگر run فعال دارد، event توقف/تکمیل ثبت کند.
3. heartbeat آخرین وضعیت را ارسال کند.
4. process بسته شود.

### 2.3 قطع اینترنت

1. Worker باید خطای شبکه را fatal نکند.
2. retry با backoff و jitter انجام شود.
3. اگر اتصال برنگشت، وضعیت DEGRADED ثبت شود.
4. run نباید گم شود.

### 2.4 قطع برق یا restart سیستم

1. بعد از بالا آمدن سیستم، Worker آخرین command/run را از دیتابیس بخواند.
2. commandهای نیمه‌کاره باید یا resume شوند یا failed/retryable علامت بخورند.
3. هیچ command نباید دوبار بدون idempotency اجرا شود.

## 3. موارد ممنوع در این Runbook

- اجرای دیوار واقعی.
- اجرای واتساپ واقعی.
- اجرای ترب واقعی.
- اجرای اینستاگرام واقعی.
- اجرای OCR/STT یا AI production.

## 4. معیار سلامت فاز صفر

سیستم سالم است اگر:

1. Worker heartbeat ثبت کند.
2. command از UI/DB ساخته شود.
3. Worker command را claim کند.
4. run ساخته شود.
5. events نوشته شوند.
6. وضعیت نهایی در UI/Read Model دیده شود.
