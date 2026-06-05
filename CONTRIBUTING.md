# راهنمای مشارکت در AfraKala Core

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## 1. قبل از هر تغییر

قبل از شروع هر کار باید این فایل‌ها خوانده شوند:

1. `AGENTS.md`
2. `docs/adr/ADR-0001-phase0-architecture-freeze.md`
3. `docs/process/SOURCE_OF_TRUTH.md`
4. `docs/process/PHASE_LABEL_POLICY.md`
5. `docs/process/DOR.md`
6. `docs/process/DOD.md`

## 2. قانون اصلی

هر تغییر باید کوچک، قابل تست، قابل review و محدود به Task Packet باشد.

## 3. ممنوعیت‌های فاز صفر

- ساخت ربات واقعی.
- ساخت Core موازی.
- ساخت دیتابیس موازی.
- ذخیره secret در کد.
- تغییر معماری بدون ADR.
- تغییر مستقیم روی `main`.

## 4. جریان کاری

1. Task Packet آماده شود.
2. branch ساخته شود.
3. تغییر کوچک انجام شود.
4. تست اجرا یا دلیل عدم اجرا نوشته شود.
5. PR با template کامل ساخته شود.
6. review انجام شود.
7. بعد از approval، merge شود.

## 5. کار با Cursor

Cursor فقط مجری Task Packet است. به Cursor دستورهای کلی و باز ندهید. هر prompt باید شامل فایل‌های مجاز، فایل‌های ممنوع، خروجی مورد انتظار و شرط توقف باشد.

## 6. کار با Lovable

Lovable فقط برای UI، فرم‌ها، داشبوردها و پنل اپراتوری استفاده می‌شود. منطق Worker، secrets، RLS bypass، automation state machine و integrationهای حساس نباید در Lovable ساخته شوند.

## 7. گزارش تحویل

هر PR باید گزارش کند:

- فایل‌های دیده‌شده
- فایل‌های تغییرکرده
- علت تغییر
- اثر migration
- اثر RLS/RBAC
- اثر امنیتی
- تست اجراشده
- ریسک‌های باقی‌مانده
