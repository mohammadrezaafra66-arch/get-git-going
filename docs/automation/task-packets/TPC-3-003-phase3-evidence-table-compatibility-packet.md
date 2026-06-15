# TPC-3-003 — بسته سازگاری جدول Evidence برای PHASE-3

## 1. هدف

هدف این بسته، ثبت رسمی مانع فعلی برای ورود کنترل‌شده‌ی شواهد Phase 3 به جدول evidence/output و تعریف محدوده‌ی مجاز برای یک PR آینده است که فقط سازگاری `phase_label` جدول `public.automation_driver_outputs` را با `PHASE-3` بررسی و در صورت تأیید، از طریق migration جداگانه اصلاح کند.

این سند migration ایجاد نمی‌کند.

این سند implementation ایجاد نمی‌کند.

این سند اجازه real DB insert نمی‌دهد.

این سند فقط مشخص می‌کند که قبل از هر insert کنترل‌شده‌ی Phase 3، باید سازگاری schema با `PHASE-3` به‌صورت جداگانه، امن، قابل rollback و review شده حل شود.

## 2. علت نیاز به این packet

در بسته قبلی، یعنی `TPC-3-002 — Controlled Local DB Insert Bridge Packet`، جدول پیشنهادی برای ثبت evidence/output برابر بود با:

`public.automation_driver_outputs`

اما بررسی schema نشان می‌دهد که این جدول اگرچه وجود دارد، ولی constraint فعلی روی ستون `phase_label` هنوز `PHASE-3` را به‌عنوان مقدار مجاز قبول نمی‌کند.

بنابراین هرگونه تلاش برای ثبت row با:

`phase_label = 'PHASE-3'`

در وضعیت فعلی schema ممکن است fail شود.

به همین دلیل، قبل از هر PR مربوط به controlled insert implementation، باید یک compatibility packet و بعد از آن یک migration PR جداگانه برای افزودن `PHASE-3` به constraint تهیه، review، approve و merge شود.

## 3. وضعیت فعلی schema

جدول `public.automation_driver_outputs` قبلاً در Phase 1 برای ذخیره خروجی‌های ساختاریافته‌ی worker driver ایجاد شده است.

هدف جدول:

- ذخیره خروجی‌های mock/internal/read-only
- اتصال خروجی‌ها به automation jobs و job runs
- نگهداری payload ساختاریافته در `output`
- حفظ جداسازی از جدول‌های تجاری
- فعال بودن RLS
- عدم وجود INSERT/UPDATE/DELETE policy برای authenticated clients

ستون‌های مهم جدول:

- `id`
- `job_id`
- `run_id`
- `driver_name`
- `job_type`
- `status`
- `output`
- `checkpoint`
- `errors`
- `source_kind`
- `phase_label`
- `created_at`
- `updated_at`

جدول برای evidence مناسب است، اما constraint فعلی باید برای Phase 3 بررسی شود.

## 4. مشکل constraint فعلی

constraint فعلی ستون `phase_label` فقط این مقدارها را قبول می‌کند:

- `BASELINE`
- `PHASE-0`
- `PHASE-1`
- `PHASE-2`
- `FUTURE`

مقدار زیر فعلاً مجاز نیست:

- `PHASE-3`

بنابراین قبل از هر insert واقعی با label مربوط به Phase 3، باید constraint به شکل کنترل‌شده اصلاح شود.

این اصلاح فقط باید به جدول evidence/output محدود باشد و نباید به هیچ جدول تجاری یا operational business table نزدیک شود.

## 5. محدوده مجاز

محدوده مجاز برای PR آینده فقط می‌تواند شامل یک migration بسیار محدود باشد که constraint ستون `phase_label` را در جدول زیر اصلاح کند:

`public.automation_driver_outputs`

محدوده مجاز آینده:

- حذف constraint فعلی `automation_driver_outputs_phase_label_check`
- ایجاد مجدد همان constraint با افزودن مقدار `PHASE-3`
- حفظ مقدارهای قبلی
- حفظ RLS فعلی
- حفظ policyهای فعلی
- حفظ ساختار جدول
- حفظ نام جدول
- حفظ نوع ستون‌ها
- حفظ indexها
- حفظ comments امنیتی یا افزودن comment توضیحی محدود
- ثبت evidence برای migration
- ثبت rollback plan

## 6. خارج از محدوده

موارد زیر در این packet و PR آینده خارج از محدوده هستند:

- implementation مربوط به real DB insert
- تغییر runtime worker
- تغییر UI
- تغییر API route
- اضافه کردن scheduler، cron یا daemon
- اتصال به external source
- browser automation
- business writeback
- تغییر جدول‌های product، price، customer، supplier، sales-list، CRM یا هر جدول تجاری دیگر
- افزودن policy برای INSERT/UPDATE/DELETE به authenticated clients
- broadening کردن RLS
- ذخیره secret، token، cookie، credential یا service role key
- تغییر package.json
- تغییر bun.lock یا pnpm-lock.yaml
- تغییر Dockerfile
- تغییر deploy scripts
- تغییر CI
- تغییر openapi یا automation/openapi

## 7. migration پیشنهادی برای PR آینده

این سند migration نمی‌سازد، اما شکل migration آینده را محدود می‌کند.

migration آینده فقط باید کاری شبیه این انجام دهد:

```sql
BEGIN;

ALTER TABLE public.automation_driver_outputs
  DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;

ALTER TABLE public.automation_driver_outputs
  ADD CONSTRAINT automation_driver_outputs_phase_label_check
  CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'PHASE-3', 'FUTURE'));

COMMENT ON CONSTRAINT automation_driver_outputs_phase_label_check
  ON public.automation_driver_outputs IS
  'Allows BASELINE/PHASE-0/PHASE-1/PHASE-2/PHASE-3/FUTURE evidence rows. PHASE-3 is limited to approved controlled evidence-table workflows and does not authorize business writeback.';

COMMIT;
