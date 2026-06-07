# TPC-1-005 — Torob Limited Implementation Design

**Phase Label:** PHASE-1  
**Packet:** 1.5  
**Task ID:** TPC-1-005  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet فقط طراحی اجرای محدود ماژول Torob limited است.

این Packet مشخص می‌کند در Packet بعدی، اگر approval داده شد، اجرای محدود Torob باید با چه محدوده، ورودی، خروجی، فایل‌های مجاز، تست‌ها و شروط توقف ساخته شود.

این Packet خودش هیچ اجرای واقعی، Driver، Worker Runtime، migration، API runtime change یا اتصال خارجی ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packet 1.1 = ACCEPTED
Packet 1.2 = ACCEPTED
Packet 1.3 = ACCEPTED
Packet 1.4 = ACCEPTED
Selected first module = Torob limited
Worker Runtime = BOUNDARY ONLY
Plugin / Driver SDK = BOUNDARY ONLY
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_1_4_ACCEPTANCE_2026_06_07.md
```

---

## 3. تعریف Torob limited

در فاز ۱، Torob limited یعنی اجرای بسیار کوچک و قابل کنترل برای اثبات چرخه پلتفرم.

محدوده مجاز آینده:

```text
حداکثر ۳ تا ۵ محصول تستی
حداکثر یک run محدود
بدون اجرای زمان‌بندی‌شده production
بدون استخراج ۳۰۰ محصول
بدون استخراج گسترده فروشندگان
بدون تغییر قیمت افراکالا
بدون AI production
بدون Redis/RabbitMQ
بدون چند Worker همزمان
```

هدف اصلی:

```text
اثبات end-to-end محدود:
Control Plane -> Job -> Worker -> Driver -> Logs -> Checkpoint -> Output -> Supabase/UI evidence
```

---

## 4. ورودی پیشنهادی برای Packet اجرای بعدی

ورودی اجرای محدود باید فقط شامل داده‌های تستی و کنترل‌شده باشد:

```text
job_type: TOROB_LIMITED_PRICE_CHECK
module: torob_limited
items:
  - product_id
    product_name
    brand
    model
    optional_torob_url
limits:
  max_products: 3-5
  max_sellers_per_product: small number
  timeout_seconds: limited
requested_by: admin user
```

---

## 5. خروجی پیشنهادی

خروجی اجرای محدود باید شامل موارد زیر باشد:

```text
job_id
run_id
driver_id
product_id
product_name
torob_url
seller_name
price
availability_status
captured_at
confidence
error_status
```

---

## 6. مسیر پیشنهادی اجرای آینده

Packet بعدی، اگر approved شود، باید این چرخه را اجرا کند:

```text
1. admin creates limited job
2. worker claims allowed job
3. driver validates input
4. driver runs limited check
5. worker writes logs
6. worker writes checkpoint
7. worker writes normalized result
8. worker completes or fails safely
9. UI/report can verify output
```

---

## 7. سیاست داده

Source of Truth باید Supabase/PostgreSQL باشد.

ممنوع:

```text
ذخیره خروجی اصلی فقط در Excel
ذخیره خروجی اصلی فقط در Google Sheet
ذخیره خروجی فقط در فایل local
ذخیره قیمت بدون job_id و run_id
```

مجاز:

```text
فایل یا artifact فقط به عنوان خروجی جانبی و قابل ردیابی
```

---

## 8. سیاست خطا

خطاهای اجرای محدود باید به دسته‌های زیر map شوند:

```text
TRANSIENT
FATAL
BUSINESS
VALIDATION
EXTERNAL_BLOCKED
TIMEOUT
UNKNOWN
```

قانون:

```text
Driver خطا را گزارش می‌کند؛ Worker Runtime تصمیم نهایی retry/fail را اعمال می‌کند.
```

---

## 9. سیاست Checkpoint

Checkpoint باید قبل و بعد از پردازش هر محصول تستی ذخیره شود.

حداقل checkpoint:

```text
job_id
run_id
driver_id
step
last_product_id
product_index
progress_percent
updated_at
```

---

## 10. سیاست محدودیت اجرا

برای جلوگیری از scope creep:

```text
max_products <= 5
max_concurrency = 1
no scheduled production run
no background always-on worker
no multi-account behavior
no proxy rotation in this packet
```

اگر نیاز به proxy, browser stealth, account farm, Redis/RabbitMQ یا queue سنگین مطرح شد، کار باید متوقف شود و ADR جدید لازم است.

---

## 11. Allowed Files برای Packet آینده

این Packet فقط طراحی است؛ اما برای Packet اجرای آینده، Allowed Files باید جداگانه و دقیق تعیین شود.

پیشنهاد اولیه برای Packet بعدی:

```text
afrakala-worker/** یا مسیر runtime مصوب آینده
docs/automation/task-packets/TPC-1-006-*.md
```

اما تا زمان approval، ایجاد این مسیرها ممنوع است.

---

## 12. Allowed Files این Packet

در همین Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_1_4_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-005-torob-limited-implementation-design.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 13. Forbidden Files این Packet

در این Packet تغییر مسیرهای زیر ممنوع است:

```text
src/**
supabase/**
automation/openapi/**
automation/schemas/**
automation/worker-dummy/**
automation/worker-runtime/**
automation/drivers/**
afrakala-worker/**
package.json
package-lock.json
.env
.env.*
```

---

## 14. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 1.4 accepted ثبت شده است.
2. بررسی شود طراحی اجرای محدود Torob با scope فاز ۱ سازگار است.
3. بررسی شود هیچ اجرای واقعی انجام نشده است.
4. بررسی شود limits صریح هستند.
5. بررسی شود output با job_id و run_id قابل ردیابی است.
6. بررسی شود خطا، checkpoint و logging تعریف شده‌اند.
7. بررسی شود Packet بعدی هنوز locked باقی مانده است.

---

## 15. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-1-005` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 1.4 به عنوان accepted ثبت شده باشد.
4. محدوده اجرای محدود Torob شفاف باشد.
5. max_products و max_concurrency مشخص باشد.
6. output contract پیشنهادی مشخص باشد.
7. checkpoint/error/log policy مشخص باشد.
8. هیچ کد اجرایی تغییر نکرده باشد.
9. هیچ migration ایجاد نشده باشد.
10. هیچ Driver واقعی ساخته نشده باشد.
11. هیچ Worker Runtime ساخته نشده باشد.
12. هیچ secret ثبت نشده باشد.
13. Packet 1.6 تا 2.6 locked باقی بمانند.

---

## 16. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به اجرای واقعی Torob باشد.
2. لازم شود Browser/Playwright اضافه شود.
3. لازم شود Python package اضافه شود.
4. لازم شود migration ساخته شود.
5. لازم شود OpenAPI اجرایی تغییر کند.
6. لازم شود مسیر runtime ساخته شود.
7. لازم شود secret یا `.env` وارد repo شود.
8. دامنه کار از ۳ تا ۵ محصول تستی بیشتر شود.
9. نیاز به Redis/RabbitMQ مطرح شود.
10. Cursor بخواهد implementation انجام دهد.

---

## 17. Related Documents

```text
docs/baseline/PHASE1_PACKET_1_4_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-004-plugin-driver-sdk-boundary.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/automation/EXECUTION_DECISION_FINAL.md
docs/process/PHASE_LABEL_POLICY.md
docs/process/DOR.md
docs/process/DOD.md
docs/adr/ADR-0001-existing-repo-is-control-plane.md
docs/adr/ADR-0002-supabase-is-source-of-truth.md
docs/adr/ADR-0003-lovable-ui-only.md
docs/adr/ADR-0004-no-parallel-core.md
docs/adr/ADR-0006-worker-runtime-boundary.md
docs/adr/ADR-0007-automation-contracts.md
docs/adr/ADR-0008-drive-is-mirror.md
```

---

## 18. Final Recommendation

```text
Approve Packet 1.5 only as implementation design.
Do not implement Torob limited until Packet 1.6 is separately created, reviewed, and accepted.
```

---

## 19. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 1.5 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Torob limited = DESIGN ONLY
```
