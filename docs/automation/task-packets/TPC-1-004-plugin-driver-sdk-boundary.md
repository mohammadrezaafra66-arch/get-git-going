# TPC-1-004 — Plugin / Driver SDK Boundary

**Phase Label:** PHASE-1  
**Packet:** 1.4  
**Task ID:** TPC-1-004  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet فقط طراحی مرز Plugin / Driver SDK برای فاز ۱ است.

این Packet مشخص می‌کند هر Driver آینده، مثل `torob_limited`، باید چه قرارداد ورودی، خروجی، وضعیت، خطا، checkpoint و log داشته باشد.

این Packet هیچ Driver واقعی، Worker Runtime، Python package، migration، API، OpenAPI runtime change یا اتصال خارجی ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packet 1.1 = ACCEPTED
Packet 1.2 = ACCEPTED
Packet 1.3 = ACCEPTED
Selected first module = Torob limited
Worker Runtime = BOUNDARY ONLY
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md
```

---

## 3. تعریف Driver

Driver یعنی ماژول قابل نصب/قابل فراخوانی داخل Worker Runtime که یک نوع Job مشخص را اجرا می‌کند.

Driver نباید Core باشد. Driver نباید UI باشد. Driver نباید دیتابیس مستقل بسازد.

در فاز ۱، اولین Driver واقعی در Packetهای بعدی می‌تواند `torob_limited` باشد.

---

## 4. مسئولیت‌های مجاز Driver

هر Driver فقط مجاز است:

1. ورودی Job را validate کند.
2. مرحله آماده‌سازی را انجام دهد.
3. عملیات محدود و مصوب خودش را اجرا کند.
4. progress و checkpoint تولید کند.
5. structured log تولید کند.
6. خروجی استاندارد به Worker Runtime تحویل دهد.
7. خطاهای خودش را به شکل استاندارد گزارش کند.
8. cleanup محدود انجام دهد.

---

## 5. مسئولیت‌های ممنوع Driver

Driver نباید:

1. خودش Job را claim کند.
2. خودش مستقیماً سیاست global retry را تعیین کند.
3. خودش Core یا API جدید بسازد.
4. خودش جدول جدید بسازد.
5. خودش RLS/RBAC را دور بزند.
6. secret را log کند.
7. به UI وابسته شود.
8. به فایل‌های React/TanStack/Lovable وابسته شود.
9. خارج از scope خودش کار کند.
10. Divar/WhatsApp/Instagram/OCR/STT/AI production را بدون ADR اجرا کند.

---

## 6. Interface پیشنهادی Driver

در Packetهای implementation بعدی، Driver باید حداقل این contract را رعایت کند:

```text
validate_input(job_payload)
prepare(context)
run(context)
save_checkpoint(context, state)
resume_from_checkpoint(context, checkpoint)
cleanup(context)
export_result(context)
```

این Packet فقط interface را تعریف می‌کند و هیچ کدی نمی‌سازد.

---

## 7. Driver Metadata

هر Driver باید metadata ثابت داشته باشد:

```text
driver_id
driver_name
driver_version
supported_job_types
phase_label
risk_level
requires_external_network
requires_browser
requires_secret
max_items_per_run
```

برای `torob_limited` مقدارهای پیشنهادی آینده:

```text
driver_id: torob_limited
driver_name: Torob Limited Price Driver
phase_label: PHASE-1
risk_level: low_to_medium
requires_external_network: true
requires_browser: maybe
requires_secret: false by default
max_items_per_run: 3 to 5
```

---

## 8. Input Contract پیشنهادی

ورودی Driver باید کوچک و قابل validate باشد:

```text
job_id
run_id
driver_id
items[]
options
limits
requested_by
created_at
```

برای Torob limited در آینده:

```text
items[]:
  product_id
  product_name
  brand
  model
  optional_torob_url

limits:
  max_products: 3-5
  max_sellers_per_product: small number
  timeout_seconds
```

---

## 9. Output Contract پیشنهادی

خروجی Driver باید استاندارد و قابل ذخیره در Supabase باشد:

```text
job_id
run_id
driver_id
status
items_processed
items_failed
results[]
errors[]
artifacts[]
started_at
completed_at
```

برای Torob limited، `results[]` در آینده می‌تواند شامل این‌ها باشد:

```text
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

## 10. Error Contract پیشنهادی

خطاها باید دسته‌بندی شوند:

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
Driver فقط خطا را طبقه‌بندی می‌کند؛ تصمیم نهایی retry/fail با Worker Runtime است.
```

---

## 11. Checkpoint Contract پیشنهادی

هر Driver باید بتواند progress خود را checkpoint کند:

```text
job_id
run_id
driver_id
step
last_processed_item
progress_percent
state
updated_at
```

برای Torob limited:

```text
last_processed_item = product_id یا product_index
step = search | scrape | parse | normalize | export
```

---

## 12. Logging Contract پیشنهادی

هر Driver باید structured log تولید کند:

```text
timestamp
level
job_id
run_id
driver_id
event_type
message
context
```

ممنوع:

```text
secret
.env value
raw credential
service role key
sensitive customer data without masking
```

---

## 13. Versioning Policy

هر Driver باید version داشته باشد.

قانون پیشنهادی:

```text
minor changes: driver_version patch/minor
contract breaking changes: new major version or new ADR
```

---

## 14. Allowed Files

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-004-plugin-driver-sdk-boundary.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 15. Forbidden Files

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

## 16. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 1.3 accepted ثبت شده است.
2. بررسی شود Driver SDK فقط boundary است.
3. بررسی شود هیچ کد یا مسیر runtime ساخته نشده است.
4. بررسی شود input/output/error/checkpoint/log contracts تعریف شده‌اند.
5. بررسی شود Driver از Worker Runtime جدا نشده و Core جدید نمی‌سازد.
6. بررسی شود Torob limited فقط به عنوان Driver آینده مطرح شده است.
7. بررسی شود packetهای بعدی locked مانده‌اند.

---

## 17. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-1-004` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 1.3 به عنوان accepted ثبت شده باشد.
4. Driver boundary شفاف باشد.
5. input/output/error/checkpoint/log contracts تعریف شده باشند.
6. هیچ کد اجرایی تغییر نکرده باشد.
7. هیچ Driver واقعی ساخته نشده باشد.
8. هیچ Worker Runtime ساخته نشده باشد.
9. هیچ migration یا OpenAPI runtime change ایجاد نشده باشد.
10. هیچ secret ثبت نشده باشد.
11. Packet 1.5 تا 2.6 locked باقی بمانند.

---

## 18. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به کدنویسی باشد.
2. لازم شود مسیر `automation/drivers/**` ساخته شود.
3. لازم شود مسیر `afrakala-worker/**` ساخته شود.
4. لازم شود dependency جدید اضافه شود.
5. لازم شود migration یا OpenAPI اجرایی تغییر کند.
6. لازم شود Torob واقعی اجرا شود.
7. لازم شود secret یا `.env` وارد repo شود.
8. Cursor بخواهد implementation انجام دهد.

---

## 19. Related Documents

```text
docs/baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-003-worker-runtime-boundary.md
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

## 20. Final Recommendation

```text
Approve Packet 1.4 only as Plugin / Driver SDK boundary planning.
Do not implement any Driver until a future implementation packet is created, reviewed, and accepted.
```

---

## 21. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 1.4 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Plugin / Driver SDK = BOUNDARY ONLY
```
