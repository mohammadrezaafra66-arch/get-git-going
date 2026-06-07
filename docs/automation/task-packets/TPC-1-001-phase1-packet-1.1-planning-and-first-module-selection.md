# TPC-1-001 — Phase 1 Packet 1.1 Planning and First Module Selection

**Phase Label:** PHASE-1  
**Packet:** 1.1  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet فقط برنامه‌ریزی رسمی شروع فاز ۱ و انتخاب اولین ماژول کم‌ریسک است.

این Packet قرار نیست کدنویسی ماژول واقعی انجام دهد. خروجی آن باید مشخص کند فاز ۱ با کدام مسیر شروع می‌شود، چه چیزهایی مجاز است، چه چیزهایی ممنوع است، چه فایل‌هایی قابل تغییر هستند، چه تست‌هایی باید بعداً اجرا شوند، و چه شرطی باعث توقف کار می‌شود.

---

## 2. وضعیت شروع

وضعیت فعلی پروژه:

```text
Phase 0 = ACCEPTED
Phase 1 = PARTIAL
Packet 1.1 = UNLOCKED
Packet 1.2 تا 2.6 = LOCKED
Phase 1 implementation = NOT STARTED
```

قانون اجرایی:

```text
تا این Packet نوشته، review و approved نشود، هیچ implementation فنی فاز ۱ مجاز نیست.
```

---

## 3. تصمیم این Packet

اولین ماژول پیشنهادی برای Phase 1:

```text
Torob limited
```

Google Maps limited فعلاً به عنوان گزینه دوم باقی می‌ماند.

ترتیب پیشنهادی شروع فاز ۱:

```text
1. Torob limited
2. Google Maps limited
3. Reporting MVP
4. توسعه تدریجی Worker Runtime و Driver SDK
```

---

## 4. دلیل انتخاب Torob limited

Torob limited نسبت به Google Maps limited برای شروع فاز ۱ مناسب‌تر است، چون:

1. مستقیماً به فروش، قیمت‌گذاری و سود شرکت وصل است.
2. داده‌های آن ساختارمندتر از Google Maps است.
3. برای تست Worker Runtime، Job Lifecycle، Log، Checkpoint و Output ساده‌تر است.
4. ریسک کپچا، grid search، اسکرول نقشه، headful browser و رفتار انسانی کمتری دارد.
5. برای اولین Driver واقعی، محدوده قابل کنترل‌تری دارد.
6. خروجی آن سریع‌تر برای مدیریت فروش قابل فهم است.
7. می‌تواند بعداً پایه سامانه قیمت‌گیری و رصد رقبا شود.

---

## 5. Scope این Packet

این Packet فقط شامل موارد زیر است:

1. انتخاب رسمی اولین ماژول Phase 1.
2. تعیین اینکه اولین ماژول Torob limited باشد.
3. تعریف محدوده Torob limited در سطح برنامه‌ریزی.
4. تعیین فایل‌های مجاز و ممنوع.
5. تعیین جداول احتمالی موردنیاز برای Packetهای بعدی، بدون ساخت migration.
6. تعیین API/Contract موردنیاز برای Packetهای بعدی، بدون پیاده‌سازی.
7. تعریف Test Plan اولیه.
8. تعریف Acceptance Criteria برای خروج از Packet 1.1.
9. تعریف Stop Conditions.
10. تعیین Owner / Reviewer / Tester.
11. تعیین اینکه آیا ADR جدید نیاز است یا نه.

---

## 6. Out of Scope

موارد زیر در این Packet ممنوع هستند:

1. ساخت Torob extractor واقعی.
2. ساخت Google Maps extractor واقعی.
3. ساخت یا تغییر Python Worker Runtime.
4. ساخت Driver واقعی.
5. تغییر migration.
6. ساخت جدول جدید در Supabase.
7. تغییر RLS.
8. تغییر OpenAPI اصلی، مگر فقط برای note/documentation.
9. اتصال واقعی به Torob.
10. اتصال واقعی به Google Maps.
11. استفاده از Playwright برای استخراج واقعی.
12. استفاده از AI production.
13. ساخت Divar bot.
14. ساخت WhatsApp bot.
15. ساخت Instagram bot.
16. ساخت OCR/STT.
17. اضافه کردن Redis/RabbitMQ بدون ADR جدید.
18. ساخت Laravel یا backend موازی.
19. ساخت Core/API/Admin/DB موازی.
20. ذخیره هرگونه secret، token، cookie، `.env` یا credential در سند یا کد.

---

## 7. Allowed Files

در این Packet فقط فایل‌های مستنداتی زیر مجاز به تغییر هستند:

```text
docs/automation/task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

توضیح:

- فایل اول سند اصلی همین Packet است.
- فایل دوم فقط برای ثبت اینکه Task file مربوط به Packet 1.1 ساخته شده است.

---

## 8. Forbidden Files

در این Packet تغییر فایل‌های زیر ممنوع است:

```text
src/**
supabase/**
automation/worker-dummy/**
automation/openapi/automation-v1.yaml
automation/schemas/**
package.json
package-lock.json
vite.config.*
tsconfig.*
.env
.env.*
```

همچنین ایجاد مسیرهای زیر ممنوع است:

```text
afrakala-worker/**
automation/worker-runtime/**
automation/drivers/torob/**
automation/drivers/google-maps/**
src/server/automation/torob/**
src/server/automation/google-maps/**
```

دلیل: این Packet فقط planning است، نه implementation.

---

## 9. Candidate Modules

دو Candidate مجاز برای شروع فاز ۱:

```text
Google Maps limited
Torob limited
```

تصمیم این Packet:

```text
Selected Module = Torob limited
```

وضعیت Google Maps:

```text
Google Maps limited = DEFERRED TO NEXT PACKET
```

---

## 10. تعریف Torob limited برای فاز ۱

Torob limited در این مرحله به معنی نسخه کوچک، کنترل‌شده و کم‌ریسک است.

محدوده پیشنهادی Torob limited برای Packetهای بعدی:

```text
حداکثر ۳ تا ۵ محصول تستی
بدون مقیاس ۳۰۰ محصول
بدون AI
بدون pricing intelligence کامل
بدون چند Worker همزمان
بدون Redis/RabbitMQ
بدون crawler سنگین
بدون استخراج گسترده فروشندگان
بدون تغییر قیمت سایت افراکالا
```

خروجی مورد انتظار در Packetهای بعدی:

```text
product_name
product_url
seller_name
price
availability_status
source
job_id
run_id
captured_at
error_status
```

---

## 11. جداول احتمالی برای Packetهای بعدی

این Packet هیچ جدول جدیدی نمی‌سازد.

اما برای Packetهای بعدی، جداول احتمالی باید بررسی شوند:

```text
market_products
market_sources
torob_price_snapshots
torob_sellers
torob_product_matches
competitive_price_reports
```

قانون:

```text
هیچ جدول جدیدی بدون migration، rollback note، RLS review و approval ساخته نشود.
```

---

## 12. API / Contract احتمالی برای Packetهای بعدی

این Packet هیچ API جدیدی پیاده‌سازی نمی‌کند.

اما در Packetهای بعدی ممکن است این عملیات نیاز شود:

```text
create_torob_price_job
claim_torob_price_job
record_torob_price_snapshot
record_torob_driver_log
complete_torob_price_job
fail_torob_price_job
```

قانون:

```text
اگر API جدید لازم شد، اول contract نوشته شود، بعد implementation.
```

---

## 13. Test Plan

برای خود این Packet تست فنی وجود ندارد، چون implementation ندارد.

تست این Packet از جنس review است:

1. بررسی شود Phase Label درست است.
2. بررسی شود Scope محدود است.
3. بررسی شود Out of Scope شفاف است.
4. بررسی شود هیچ فایل اجرایی مجاز نشده است.
5. بررسی شود هیچ migration مجاز نشده است.
6. بررسی شود هیچ real bot مجاز نشده است.
7. بررسی شود انتخاب Torob limited مستند شده است.
8. بررسی شود فایل‌های Allowed و Forbidden مشخص هستند.
9. بررسی شود Stop Conditions کافی هستند.
10. بررسی شود Packet 1.2 تا 2.6 همچنان locked باقی مانده‌اند.

---

## 14. Acceptance Criteria

این Packet فقط وقتی accepted است که:

1. سند `TPC-1-001` در مسیر درست ایجاد شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` ردیف Packet 1.1 را به این فایل وصل کند.
3. وضعیت Packet 1.1 همچنان planning-only باشد.
4. Torob limited به عنوان اولین ماژول رسمی فاز ۱ انتخاب شده باشد.
5. Google Maps limited به Packet بعدی منتقل شده باشد.
6. هیچ فایل اجرایی تغییر نکرده باشد.
7. هیچ migration ساخته نشده باشد.
8. هیچ Worker Runtime ساخته نشده باشد.
9. هیچ Driver واقعی ساخته نشده باشد.
10. هیچ اتصال واقعی به Torob یا Google Maps انجام نشده باشد.
11. هیچ secret ثبت نشده باشد.
12. Reviewer تایید کند.
13. محمدرضا افرا تایید نهایی بدهد.

---

## 15. Stop Conditions

کار باید فوراً متوقف شود اگر:

1. برای اجرای این Packet نیاز به تغییر کد پیدا شود.
2. نیاز به ساخت جدول جدید پیدا شود.
3. نیاز به تغییر OpenAPI اجرایی پیدا شود.
4. نیاز به اتصال واقعی به Torob یا Google Maps پیدا شود.
5. Cursor بخواهد Worker Runtime بسازد.
6. Cursor بخواهد Driver واقعی بسازد.
7. Cursor بخواهد dependency جدید اضافه کند.
8. Cursor بخواهد فایل‌های خارج از Allowed Files را تغییر دهد.
9. ابهام درباره Source of Truth یا Supabase schema وجود داشته باشد.
10. نیاز به secret یا `.env` مطرح شود.
11. تصمیم انتخاب ماژول بین Torob و Google Maps قطعی نشود.

---

## 16. Owner / Reviewer / Tester

| Role | Person | Responsibility |
|---|---|---|
| Owner | محمدرضا افرا | تصمیم نهایی، تایید انتخاب ماژول، تایید Scope |
| Reviewer | خانم پورچیستا / Platform Review | بررسی فنی، بررسی محدود بودن Packet، جلوگیری از implementation زودهنگام |
| Tester | آقای حیدری / آقای طالبی‌زاده | بررسی چک‌لیستی، تطبیق با DoR/DoD، گزارش ابهام |

---

## 17. ADR Requirement

برای این Packet، ADR جدید لازم نیست، چون:

1. فقط سند planning ساخته می‌شود.
2. معماری کلان تغییر نمی‌کند.
3. Core جدید ساخته نمی‌شود.
4. DB جدید ساخته نمی‌شود.
5. API موازی ساخته نمی‌شود.
6. Worker Runtime هنوز ساخته نمی‌شود.
7. Torob limited فقط به عنوان candidate رسمی انتخاب می‌شود.

اما ADR جدید لازم می‌شود اگر در Packetهای بعدی یکی از موارد زیر مطرح شود:

```text
Redis/RabbitMQ
Core موازی
API موازی
DB موازی
Worker Runtime جدا با معماری متفاوت از تصمیم فاز صفر
اجرای همزمان چند Worker
استفاده از Playwright در production
تغییر Source of Truth
ذخیره secret یا credential جدید
```

---

## 18. Related Documents

```text
docs/automation/EXECUTION_DECISION_FINAL.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/baseline/PHASE1_UNLOCK_2026_06_07.md
docs/baseline/PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md
docs/process/PHASE_LABEL_POLICY.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/SOURCE_OF_TRUTH.md
docs/adr/ADR-0001-existing-repo-is-control-plane.md
docs/adr/ADR-0002-supabase-is-source-of-truth.md
docs/adr/ADR-0003-lovable-ui-only.md
docs/adr/ADR-0004-no-parallel-core.md
docs/adr/ADR-0006-worker-runtime-boundary.md
docs/adr/ADR-0007-automation-contracts.md
docs/adr/ADR-0008-drive-is-mirror.md
```

---

## 19. Cursor Instruction

Cursor must not implement code in this Packet.

Allowed action for Cursor:

```text
Create the planning document TPC-1-001.
Update PHASE1_TASK_PACKET_INDEX.md to point Packet 1.1 to this document.
Do not modify code, migrations, OpenAPI runtime contract, worker runtime, or dependencies.
```

Forbidden action for Cursor:

```text
Do not create Torob extractor.
Do not create Google Maps extractor.
Do not create Worker Runtime.
Do not create Driver SDK.
Do not add Playwright.
Do not add Python dependencies.
Do not change Supabase migrations.
Do not change RLS.
Do not create any new database table.
Do not touch src/**.
```

---

## 20. Final Recommendation

Recommendation:

```text
Approve Packet 1.1 with Torob limited as the first Phase 1 module.
Keep implementation locked until Packet 1.2.
Use Packet 1.2 to design Worker Runtime / Driver Interface boundary.
Use Packet 1.3 or later for the first limited Torob implementation.
```

---

## 21. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | حیدری / طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 1.1 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Selected first module = Torob limited
```
