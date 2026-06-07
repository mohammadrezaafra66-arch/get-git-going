# TPC-2-004 — Resource Usage Test

**Phase Label:** PHASE-1  
**Packet:** 2.4  
**Task ID:** TPC-2-004  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet طراحی تست مصرف منابع برای اجرای محدود Phase 1 است.

این Packet مشخص می‌کند وقتی اجرای محدود آینده انجام شد، چه معیارهایی از CPU، RAM، زمان اجرا، حجم log، تعداد output row و رفتار بعد از restart باید اندازه‌گیری شود.

این Packet هیچ تست واقعی، Worker implementation، Driver implementation، migration، API، UI یا اتصال خارجی ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packets 1.1 to 1.6 = ACCEPTED
Packets 2.1 to 2.3 = ACCEPTED
Actual limited execution = NOT STARTED
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_2_3_ACCEPTANCE_2026_06_07.md
```

---

## 3. اصل حاکم

```text
Resource usage must be measured before scaling.
No phase expansion without resource evidence.
```

در فاز ۱، هدف مقیاس نیست؛ هدف شناخت مصرف منابع در اجرای کوچک و قابل کنترل است.

---

## 4. معیارهای اندازه‌گیری آینده

در Packetهای implementation/test آینده باید این موارد اندازه‌گیری شوند:

```text
CPU usage
RAM usage
execution duration
log count
checkpoint count
output row count
error count
retry count
artifact size
restart behavior
```

---

## 5. محدودیت اجرای تست آینده

تست مصرف منابع آینده باید محدود باشد:

```text
max_products <= 5
max_concurrency = 1
single machine only
manual/local run only unless separately approved
no scheduled production run
no stress test
no load test
```

---

## 6. خروجی Evidence موردنیاز

بعد از تست واقعی آینده، evidence باید در سند جدا ثبت شود:

```text
docs/baseline/PHASE1_RESOURCE_USAGE_EVIDENCE_YYYY_MM_DD.md
```

حداقل evidence:

```text
machine specs
OS
run command
input size
start time
end time
duration
peak CPU
peak RAM
log count
checkpoint count
output count
error count
observed bottlenecks
recommendation
```

---

## 7. Acceptance Threshold پیشنهادی آینده

حد اولیه پیشنهادی برای اجرای محدود:

```text
run completes or fails safely
no infinite loop
no uncontrolled memory growth
no uncontrolled log growth
no duplicate completed run
resource report generated
```

عددهای دقیق CPU/RAM بعد از اولین evidence تعیین می‌شوند و نباید حدسی وارد scope شوند.

---

## 8. Allowed Files این Packet

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_2_3_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-004-resource-usage-test.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 9. Forbidden Files این Packet

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

## 10. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 2.3 accepted ثبت شده است.
2. بررسی شود resource metrics مشخص هستند.
3. بررسی شود scope محدود و غیر stress-test است.
4. بررسی شود evidence requirements مشخص هستند.
5. بررسی شود هیچ تست واقعی یا کد اجرا نشده است.
6. بررسی شود هیچ migration/API/Worker/Driver/UI تغییر نکرده است.
7. بررسی شود Packet بعدی locked باقی مانده است.

---

## 11. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-2-004` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 2.3 به عنوان accepted ثبت شده باشد.
4. resource metrics مشخص باشد.
5. evidence requirements مشخص باشد.
6. اجرای تست واقعی انجام نشده باشد.
7. هیچ کد اجرایی تغییر نکرده باشد.
8. هیچ migration ایجاد نشده باشد.
9. هیچ secret ثبت نشده باشد.
10. Packetهای بعدی locked باقی بمانند.

---

## 12. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به اجرای تست واقعی باشد.
2. لازم شود Worker یا Driver تغییر کند.
3. لازم شود migration یا OpenAPI تغییر کند.
4. لازم شود UI تغییر کند.
5. لازم شود secret یا `.env` وارد repo شود.
6. تست به stress/load test تبدیل شود.
7. scope از ۵ محصول تستی بیشتر شود.

---

## 13. Related Documents

```text
docs/baseline/PHASE1_PACKET_2_3_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-003-retry-failure-checkpoint-tests.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
```

---

## 14. Final Recommendation

```text
Approve this Packet as resource usage test planning only.
Do not run resource tests until a dedicated execution/evidence packet is created, reviewed, and accepted.
```

---

## 15. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 2.4 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Resource usage test = DESIGN ONLY
```
