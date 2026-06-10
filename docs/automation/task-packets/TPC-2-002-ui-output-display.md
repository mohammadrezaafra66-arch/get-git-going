# TPC-2-002 — UI Output Display

**Phase Label:** PHASE-1  
**Packet:** 2.2  
**Task ID:** TPC-2-002  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet طراحی نحوه نمایش خروجی محدود Phase 1 در UI فعلی است.

این Packet فقط مشخص می‌کند پنل فعلی باید چه داده‌هایی را نشان دهد، چه داده‌هایی را نباید نشان دهد، و مرز UI با Worker/Driver/DB چیست.

این Packet هیچ کامپوننت UI، route، query، mutation، server function، migration، Driver یا Worker implementation ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packets 1.1 to 1.6 = ACCEPTED
Packet 2.1 = ACCEPTED
Output persistence = DESIGN ONLY
UI implementation = NOT STARTED
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_2_1_ACCEPTANCE_2026_06_07.md
```

---

## 3. اصل حاکم UI

```text
React/TanStack/Lovable = UI only
Supabase/PostgreSQL = Source of Truth
Worker Runtime = outside UI
Driver logic = outside UI
```

UI فقط باید نمایش، فیلتر، بررسی و فرمان‌های مجاز را انجام دهد. UI نباید extraction، scraping، driver logic، secret handling یا call خارجی مستقیم انجام دهد.

---

## 4. داده‌هایی که UI باید در آینده نمایش دهد

برای خروجی محدود Phase 1، UI باید بتواند این موارد را نمایش دهد:

```text
job_id
run_id
driver_id
source
status
started_at
completed_at
items_processed
items_failed
latest_log_level
latest_error_status
output rows count
```

برای خروجی محصول/قیمت محدود:

```text
product_id
product_name
source_product_url
seller_name
price
currency
availability_status
captured_at
confidence
error_status
```

---

## 5. داده‌هایی که UI نباید نمایش دهد

UI نباید این موارد را نشان دهد یا به browser بفرستد:

```text
service_role_key
.env value
raw credentials
cookies
tokens
internal secrets
unmasked sensitive data
raw payloadهای بزرگ بدون نیاز
```

---

## 6. UI View پیشنهادی

برای Packetهای implementation آینده، UI می‌تواند این viewها را داشته باشد:

```text
1. Automation Jobs List
2. Job Detail
3. Run Detail
4. Output Preview
5. Logs Preview
6. Error Summary
```

اما در این Packet هیچکدام ساخته نمی‌شوند.

---

## 7. رفتار مجاز UI در فاز ۱

مجاز:

```text
نمایش وضعیت job/run
نمایش خروجی محدود read-only
نمایش log summary
نمایش error summary
فیلتر بر اساس status/source/driver
نمایش لینک artifact اگر وجود داشت
```

ممنوع:

```text
اجرای مستقیم driver از browser
call مستقیم به Torob یا Google Maps از browser
ذخیره secret در frontend
ارسال service_role_key به client
پیاده‌سازی منطق scraping داخل React
ساخت API موازی
ساخت dashboard موازی خارج از Control Plane
```

---

## 8. Query Policy

Queryهای UI باید محدود و ایمن باشند:

```text
limit required
pagination required for large lists
filters indexed if needed in future
no full-table uncontrolled fetch
no raw secret fields
```

در Packet implementation آینده، هر query باید owner و purpose داشته باشد.

---

## 9. RLS / RBAC Policy

قبل از پیاده‌سازی UI، باید مشخص شود:

```text
who can view jobs?
who can view outputs?
who can view logs?
who can view errors?
who can rerun or cancel?
admin-only fields?
masked fields?
```

این Packet هیچ RLS/RBAC را تغییر نمی‌دهد.

---

## 10. Empty / Error State Policy

UI آینده باید این حالت‌ها را درست نشان دهد:

```text
no jobs yet
job running
job completed with zero result
job failed
worker offline
output not persisted yet
permission denied
```

---

## 11. Allowed Files این Packet

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_2_1_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-002-ui-output-display.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 12. Forbidden Files این Packet

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

## 13. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 2.1 accepted ثبت شده است.
2. بررسی شود UI فقط نمایش read-only طراحی شده است.
3. بررسی شود هیچ فایل `src/**` تغییر نکرده است.
4. بررسی شود هیچ query واقعی یا server function ساخته نشده است.
5. بررسی شود secret exposure ممنوع شده است.
6. بررسی شود RLS/RBAC فقط به عنوان policy مطرح شده و تغییر نکرده است.
7. بررسی شود Packet بعدی locked باقی مانده است.

---

## 14. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-2-002` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 2.1 به عنوان accepted ثبت شده باشد.
4. UI display scope شفاف باشد.
5. read-only output display policy مشخص باشد.
6. ممنوعیت secret exposure مشخص باشد.
7. query policy مشخص باشد.
8. empty/error state policy مشخص باشد.
9. هیچ کد UI تغییر نکرده باشد.
10. هیچ migration/API/Worker/Driver تغییر نکرده باشد.
11. هیچ secret ثبت نشده باشد.
12. Packetهای بعدی locked باقی بمانند.

---

## 15. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به تغییر `src/**` باشد.
2. لازم شود UI واقعی ساخته شود.
3. لازم شود server function ساخته شود.
4. لازم شود query واقعی پیاده‌سازی شود.
5. لازم شود RLS/RBAC تغییر کند.
6. لازم شود secret یا `.env` وارد repo شود.
7. UI بخواهد مستقیماً Driver یا external source را صدا بزند.
8. Cursor بخواهد implementation انجام دهد.

---

## 16. Related Documents

```text
docs/baseline/PHASE1_PACKET_2_1_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-001-supabase-output-persistence.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
docs/adr/ADR-0002-supabase-is-source-of-truth.md
docs/adr/ADR-0003-lovable-ui-only.md
docs/adr/ADR-0004-no-parallel-core.md
```

---

## 17. Final Recommendation

```text
Approve this Packet as UI output display planning only.
Do not implement UI until a dedicated UI implementation packet is created, reviewed, and accepted.
```

---

## 18. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 2.2 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
UI output display = DESIGN ONLY
```
