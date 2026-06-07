# TPC-2-001 — Supabase Output Persistence

**Phase Label:** PHASE-1  
**Packet:** 2.1  
**Task ID:** TPC-2-001  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet طراحی و قفل کردن سیاست ذخیره خروجی محدود Phase 1 در Supabase/PostgreSQL است.

این Packet مشخص می‌کند خروجی اجرای محدود باید چطور به `job_id` و `run_id` وصل شود، چه داده‌ای مجاز است ذخیره شود، چه داده‌ای ممنوع است، و در Packetهای بعدی اگر migration لازم شد چه پیش‌نیازهایی باید رعایت شود.

این Packet هیچ migration، جدول، RLS، API، Worker، Driver یا UI implementation ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packets 1.1 to 1.6 = ACCEPTED
Limited execution = NOT STARTED
Supabase/PostgreSQL = Source of Truth
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_1_6_ACCEPTANCE_2026_06_07.md
```

---

## 3. اصل حاکم

```text
Supabase/PostgreSQL = Source of Truth
Excel/Google Sheet/local files = export/artifact only
```

هیچ خروجی اصلی نباید فقط در فایل local، Excel یا Google Sheet ذخیره شود.

---

## 4. نیازمندی ردیابی

هر خروجی Phase 1 باید حداقل به این شناسه‌ها وصل باشد:

```text
job_id
run_id
driver_id
source
captured_at
```

بدون `job_id` و `run_id` هیچ خروجی نباید persisted شود.

---

## 5. Output Record پیشنهادی

ساختار مفهومی رکورد خروجی:

```text
id
job_id
run_id
driver_id
source
source_url
entity_type
entity_id
raw_payload
normalized_payload
status
error_status
confidence
captured_at
created_at
updated_at
```

این فقط طراحی است. نام جدول و migration در Packet جداگانه باید تعیین شود.

---

## 6. Output Payload پیشنهادی برای ماژول محدود

برای خروجی محدود قیمت، `normalized_payload` می‌تواند شامل موارد زیر باشد:

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
```

---

## 7. Raw vs Normalized

اصل پیشنهادی:

```text
raw_payload = داده خام محدود و قابل audit
normalized_payload = داده تمیز شده برای نمایش و گزارش
```

ممنوع:

```text
ذخیره secret
ذخیره cookie
ذخیره token
ذخیره service role key
ذخیره اطلاعات حساس بدون masking
```

---

## 8. RLS / RBAC Policy

قبل از هر migration آینده باید RLS/RBAC impact مشخص شود.

حداقل موارد موردنیاز:

```text
who can insert?
who can read?
who can update?
who can delete?
service role usage?
admin-only access?
audit log requirement?
```

---

## 9. Migration Requirement برای Packet آینده

اگر Packet آینده نیاز به migration داشت، باید جداگانه تعریف کند:

1. نام migration.
2. جدول‌های جدید یا ستون‌های جدید.
3. Indexهای لازم.
4. Foreign key به automation jobs/runs.
5. RLS policy.
6. Rollback / recovery note.
7. Test query.
8. Evidence بعد از apply.

---

## 10. Duplicate Handling

برای جلوگیری از داده تکراری، Packet آینده باید یکی از این سیاست‌ها را انتخاب کند:

```text
unique(job_id, driver_id, entity_id)
unique(run_id, driver_id, entity_id)
idempotency_key
upsert by source + entity_id + captured_at window
```

انتخاب نهایی باید قبل از implementation مشخص شود.

---

## 11. Allowed Files این Packet

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_1_6_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-001-supabase-output-persistence.md
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

1. بررسی شود Packet 1.6 accepted ثبت شده است.
2. بررسی شود output persistence فقط طراحی شده است.
3. بررسی شود هیچ migration ساخته نشده است.
4. بررسی شود هیچ جدول یا RLS تغییر نکرده است.
5. بررسی شود policy برای job_id/run_id مشخص است.
6. بررسی شود secret storage ممنوع شده است.
7. بررسی شود Packet بعدی locked باقی مانده است.

---

## 14. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-2-001` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 1.6 به عنوان accepted ثبت شده باشد.
4. Source of Truth بودن Supabase تصریح شده باشد.
5. نیازمندی `job_id` و `run_id` ثبت شده باشد.
6. raw/normalized payload policy مشخص باشد.
7. migration requirement برای آینده مشخص باشد.
8. duplicate handling options مشخص باشد.
9. هیچ migration ایجاد نشده باشد.
10. هیچ کد اجرایی تغییر نکرده باشد.
11. هیچ secret ثبت نشده باشد.
12. Packetهای بعدی locked باقی بمانند.

---

## 15. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به ساخت جدول باشد.
2. لازم شود migration ایجاد شود.
3. لازم شود RLS تغییر کند.
4. لازم شود OpenAPI اجرایی تغییر کند.
5. لازم شود Worker/Driver/UI تغییر کند.
6. لازم شود secret یا `.env` وارد repo شود.
7. خروجی بدون job_id/run_id طراحی شود.
8. Excel/Google Sheet به عنوان Source of Truth پیشنهاد شود.

---

## 16. Related Documents

```text
docs/baseline/PHASE1_PACKET_1_6_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-006-torob-limited-execution.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
docs/adr/ADR-0002-supabase-is-source-of-truth.md
docs/adr/ADR-0007-automation-contracts.md
```

---

## 17. Final Recommendation

```text
Approve this Packet as output persistence planning only.
Do not create migrations until a dedicated migration packet is created, reviewed, and accepted.
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
Packet 2.1 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Migration = NOT AUTHORIZED
Output persistence = DESIGN ONLY
```
