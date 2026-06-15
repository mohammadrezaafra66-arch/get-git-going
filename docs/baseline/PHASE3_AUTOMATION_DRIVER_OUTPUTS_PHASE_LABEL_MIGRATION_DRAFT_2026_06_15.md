# PHASE3 Automation Driver Outputs Phase Label Migration — Draft Evidence

## وضعیت

این سند evidence draft برای migration پیشنهادی TPC-3-004 است.

این branch به‌صورت stacked روی TPC-3-003 آماده می‌شود، چون TPC-3-003 هنوز merged/accepted نشده است.

## هدف

افزودن مقدار PHASE-3 به constraint ستون phase_label در جدول public.automation_driver_outputs.

## محدوده

محدوده فقط:

- حذف constraint فعلی automation_driver_outputs_phase_label_check
- ساخت مجدد همان constraint با افزودن PHASE-3
- حفظ مقدارهای قبلی
- حفظ RLS
- عدم افزودن INSERT/UPDATE/DELETE policy
- عدم تغییر جدول‌های تجاری
- عدم تغییر runtime
- عدم تغییر UI/API

## فایل‌های تغییرکرده مورد انتظار

- supabase/migrations/20260615101000_phase3_automation_driver_outputs_phase_label.sql
- docs/baseline/PHASE3_AUTOMATION_DRIVER_OUTPUTS_PHASE_LABEL_MIGRATION_DRAFT_2026_06_15.md

## خارج از محدوده

- real DB insert
- worker implementation
- API route
- UI change
- scheduler/cron/daemon
- external source call
- browser automation
- product/price/customer/supplier/sales/CRM writeback
- secrets or runtime values

## Test Plan

قبل از پذیرش نهایی باید این موارد بررسی شوند:

1. migration روی محیط local/self-hosted apply شود.
2. مقدار PHASE-3 توسط constraint پذیرفته شود.
3. مقدارهای قبلی همچنان پذیرفته شوند.
4. مقدارهای نامعتبر همچنان reject شوند.
5. هیچ policy جدید INSERT/UPDATE/DELETE برای authenticated clients ایجاد نشده باشد.
6. هیچ جدول تجاری تغییر نکرده باشد.
7. فقط migration و evidence doc تغییر کرده باشند.
بازبینی نهایی migration باید قبل از هر پیاده‌سازی insert واقعی انجام شود.
## Rollback

Rollback دستی:

    BEGIN;

    ALTER TABLE public.automation_driver_outputs
      DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;

    ALTER TABLE public.automation_driver_outputs
      ADD CONSTRAINT automation_driver_outputs_phase_label_check
      CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

    COMMIT;

## Final Decision

این draft به‌تنهایی اجازه real DB insert نمی‌دهد.

حتی پس از merge شدن این migration، controlled insert implementation باید در PR جداگانه، test-first و با guard کامل انجام شود.
