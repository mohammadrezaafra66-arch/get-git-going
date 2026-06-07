# TPC-2-003 — Retry / Failure / Checkpoint Tests

**Phase Label:** PHASE-1  
**Packet:** 2.3  
**Task ID:** TPC-2-003  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet طراحی تست‌های Retry، Failure و Checkpoint برای اجرای محدود Phase 1 است.

این Packet مشخص می‌کند در Packetهای بعدی، اگر اجرای محدود مجاز شد، چه سناریوهایی باید تست شوند تا سیستم بعد از قطعی، خطا یا restart از صفر شروع نکند و اجرای تکراری نسازد.

این Packet هیچ تست واقعی، Worker implementation، Driver implementation، migration، API، UI یا اتصال خارجی ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packets 1.1 to 1.6 = ACCEPTED
Packet 2.1 = ACCEPTED
Packet 2.2 = ACCEPTED
Actual limited execution = NOT STARTED
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_2_2_ACCEPTANCE_2026_06_07.md
```

---

## 3. اصل حاکم

```text
Failure is expected.
Restart must not duplicate completed work.
Checkpoint must make recovery predictable.
Retry must be bounded.
```

در محیط عملیاتی ایران، قطع برق و اینترنت فرض عادی است، نه اتفاق نادر.

---

## 4. سناریوهای تست آینده

در Packetهای implementation/test آینده باید این سناریوها بررسی شوند:

1. Worker وسط job متوقف شود.
2. Worker بعد از checkpoint دوباره اجرا شود.
3. Job از صفر شروع نشود.
4. رکورد تکراری ساخته نشود.
5. Job completed دوباره claim نشود.
6. خطای موقت با retry محدود مدیریت شود.
7. خطای fatal باعث fail-safe شود.
8. input نامعتبر باعث validation error شود.
9. قطع اتصال Supabase باعث crash بی‌سروصدا نشود.
10. Stop/Pause در صورت وجود command رعایت شود.

---

## 5. Retry Policy پیشنهادی

```text
max_attempts: limited and explicit
backoff: exponential with jitter
transient error: retry
fatal error: fail safely
validation error: fail without retry
business error: log and skip if approved
```

هیچ retry بی‌نهایت مجاز نیست.

---

## 6. Checkpoint Test Policy

Checkpoint باید قبل و بعد از هر بخش پرریسک ذخیره شود.

حداقل داده checkpoint:

```text
job_id
run_id
driver_id
step
last_processed_item
progress_percent
updated_at
```

تست آینده باید نشان دهد که بعد از restart، Worker از checkpoint ادامه می‌دهد.

---

## 7. Failure Classification

خطاها باید حداقل به این دسته‌ها map شوند:

```text
TRANSIENT
FATAL
BUSINESS
VALIDATION
EXTERNAL_BLOCKED
TIMEOUT
UNKNOWN
```

---

## 8. Evidence موردنیاز بعد از تست واقعی

در Packetهای بعدی، بعد از اجرای تست واقعی، evidence باید شامل این موارد باشد:

```text
test command
input fixture
before state
after state
job status
run status
checkpoint count
log count
retry count
error count
duplicate check result
restart behavior
```

---

## 9. Allowed Files این Packet

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_2_2_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-003-retry-failure-checkpoint-tests.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 10. Forbidden Files این Packet

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

## 11. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 2.2 accepted ثبت شده است.
2. بررسی شود retry policy محدود و غیر بی‌نهایت است.
3. بررسی شود checkpoint policy مشخص است.
4. بررسی شود failure classes تعریف شده‌اند.
5. بررسی شود هیچ تست واقعی یا کد اجرا نشده است.
6. بررسی شود هیچ migration/API/Worker/Driver/UI تغییر نکرده است.
7. بررسی شود Packet بعدی locked باقی مانده است.

---

## 12. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-2-003` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 2.2 به عنوان accepted ثبت شده باشد.
4. retry policy مشخص باشد.
5. checkpoint test policy مشخص باشد.
6. failure classification مشخص باشد.
7. evidence requirements مشخص باشد.
8. هیچ کد اجرایی تغییر نکرده باشد.
9. هیچ migration ایجاد نشده باشد.
10. هیچ secret ثبت نشده باشد.
11. Packetهای بعدی locked باقی بمانند.

---

## 13. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به اجرای تست واقعی باشد.
2. لازم شود Worker یا Driver تغییر کند.
3. لازم شود migration یا OpenAPI تغییر کند.
4. لازم شود UI تغییر کند.
5. لازم شود secret یا `.env` وارد repo شود.
6. Retry بی‌نهایت پیشنهاد شود.
7. Checkpoint بدون job_id/run_id طراحی شود.

---

## 14. Related Documents

```text
docs/baseline/PHASE1_PACKET_2_2_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-002-ui-output-display.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
docs/adr/ADR-0006-worker-runtime-boundary.md
docs/adr/ADR-0007-automation-contracts.md
```

---

## 15. Final Recommendation

```text
Approve this Packet as Retry / Failure / Checkpoint test planning only.
Do not implement tests until a dedicated implementation/evidence packet is created, reviewed, and accepted.
```

---

## 16. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 2.3 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Retry/Failure/Checkpoint tests = DESIGN ONLY
```
