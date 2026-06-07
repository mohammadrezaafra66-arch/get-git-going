# TPC-1-006 — Torob Limited Execution

**Phase Label:** PHASE-1  
**Packet:** 1.6  
**Task ID:** TPC-1-006  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** AUTHORIZATION PENDING — REVIEW REQUIRED BEFORE CODE

---

## 1. هدف Packet

هدف این Packet تعریف دقیق اجرای محدود Torob است.

این Packet مشخص می‌کند اگر پس از review تایید شد، در PR بعدی یا commitهای همین Packet چه حداقلی از implementation می‌تواند انجام شود.

تا وقتی این Packet تایید نشود، هیچ اجرای واقعی Torob، هیچ Worker Runtime، هیچ Driver و هیچ dependency جدید مجاز نیست.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packet 1.1 = ACCEPTED
Packet 1.2 = ACCEPTED
Packet 1.3 = ACCEPTED
Packet 1.4 = ACCEPTED
Packet 1.5 = ACCEPTED
Selected first module = Torob limited
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_1_5_ACCEPTANCE_2026_06_07.md
```

---

## 3. Scope مجاز اجرای محدود

اگر این Packet approved شد، اجرای محدود فقط شامل موارد زیر می‌تواند باشد:

1. ساخت حداقل مسیر Worker Runtime برای اجرای یک job محدود.
2. ساخت Driver ساده و محدود برای `torob_limited`.
3. استفاده از فقط ۳ تا ۵ محصول تستی.
4. ثبت log، checkpoint و status.
5. ذخیره خروجی قابل ردیابی با `job_id` و `run_id`.
6. اجرای دستی یا local-only برای proof of concept.
7. ثبت evidence بعد از اجرا.

---

## 4. Out of Scope

حتی بعد از approval این Packet، موارد زیر ممنوع هستند:

1. اجرای full-scale Torob.
2. استخراج ۳۰۰ محصول.
3. اجرای scheduled production.
4. اجرای چند Worker همزمان.
5. Redis/RabbitMQ بدون ADR.
6. AI production.
7. تغییر قیمت سایت افراکالا.
8. اتصال به پیام‌رسان‌ها.
9. Divar / WhatsApp / Instagram / OCR / STT.
10. ذخیره secret در repo.
11. ساخت Core/API/DB/Admin موازی.
12. اجرای مستقیم از browser UI.

---

## 5. محدودیت سخت اجرا

```text
max_products <= 5
max_concurrency = 1
run_mode = manual/local or explicitly approved safe mode
no scheduled production run
no background always-on worker
no proxy/account farm
```

اگر برای عبور از محدودیت‌ها نیاز به browser stealth، proxy rotation، account farm، Redis/RabbitMQ یا captcha solving مطرح شد، کار باید متوقف شود و ADR جدید لازم است.

---

## 6. Allowed Files پیشنهادی برای implementation بعد از approval

این Packet خودش فعلاً docs-only است. اگر approved شد، implementation باید در یک PR جدا یا ادامه همین Packet با review جدا انجام شود.

Allowed files پیشنهادی برای implementation آینده:

```text
afrakala-worker/**
docs/automation/task-packets/TPC-1-006-torob-limited-execution.md
docs/baseline/PHASE1_TOROB_LIMITED_EXECUTION_EVIDENCE_*.md
```

هر مسیر دیگری باید قبل از تغییر در review ذکر شود.

---

## 7. Forbidden Files

تا قبل از approval صریح implementation، تغییر مسیرهای زیر ممنوع است:

```text
src/**
supabase/**
automation/openapi/**
automation/schemas/**
automation/worker-dummy/**
automation/drivers/**
package.json
package-lock.json
.env
.env.*
```

اگر implementation آینده نیاز به dependency داشت، باید در Packet implementation جداگانه یا amendment همین Packet با review ثبت شود.

---

## 8. Input نمونه برای اجرای محدود

```json
{
  "job_type": "TOROB_LIMITED_PRICE_CHECK",
  "module": "torob_limited",
  "items": [
    {
      "product_id": "test-001",
      "product_name": "sample product 1",
      "brand": "sample",
      "model": "sample",
      "optional_torob_url": null
    }
  ],
  "limits": {
    "max_products": 5,
    "max_concurrency": 1,
    "timeout_seconds": 120
  }
}
```

---

## 9. Output مورد انتظار

```json
{
  "job_id": "...",
  "run_id": "...",
  "driver_id": "torob_limited",
  "status": "COMPLETED_OR_FAILED",
  "items_processed": 0,
  "items_failed": 0,
  "results": [],
  "errors": [],
  "artifacts": []
}
```

---

## 10. Evidence موردنیاز بعد از implementation

بعد از اجرای محدود، باید سند evidence ساخته شود:

```text
docs/baseline/PHASE1_TOROB_LIMITED_EXECUTION_EVIDENCE_YYYY_MM_DD.md
```

حداقل evidence:

```text
branch
PR
commit
run command
input sample
output sample
job status
run status
log count
checkpoint count
error count
real bot scope confirmation
secrets confirmation
```

---

## 11. Test Plan برای implementation آینده

برای implementation آینده، تست حداقل باید شامل این موارد باشد:

1. اجرای local/manual با ۱ محصول تستی.
2. اجرای local/manual با حداکثر ۵ محصول تستی.
3. ثبت log.
4. ثبت checkpoint.
5. ثبت خروجی با job_id و run_id.
6. fail-safe روی input نامعتبر.
7. عدم ذخیره secret.
8. عدم تغییر فایل‌های ممنوع.
9. عدم اجرای full-scale.

---

## 12. Acceptance Criteria این Packet

این Packet وقتی accepted است که:

1. سند `TPC-1-006` ساخته شده باشد.
2. Packet 1.5 به عنوان accepted ثبت شده باشد.
3. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
4. اجرای محدود دقیقاً تعریف شده باشد.
5. محدودیت max_products و max_concurrency ثبت شده باشد.
6. Allowed/Forbidden files مشخص باشند.
7. evidence موردنیاز تعریف شده باشد.
8. اجرای فنی هنوز انجام نشده باشد.
9. هیچ migration ایجاد نشده باشد.
10. هیچ dependency اضافه نشده باشد.
11. هیچ secret ثبت نشده باشد.
12. Packetهای 2.1 تا 2.6 locked باقی بمانند.

---

## 13. Stop Conditions

کار باید متوقف شود اگر:

1. اجرای واقعی قبل از approval شروع شود.
2. scope از ۵ محصول تستی بیشتر شود.
3. نیاز به secret یا `.env` پیدا شود.
4. نیاز به migration پیدا شود.
5. نیاز به تغییر OpenAPI پیدا شود.
6. نیاز به dependency سنگین پیدا شود.
7. نیاز به Redis/RabbitMQ پیدا شود.
8. نیاز به browser stealth/proxy rotation پیدا شود.
9. نیاز به call مستقیم از UI پیدا شود.
10. Cursor بخواهد خارج از Allowed Files تغییر ایجاد کند.

---

## 14. Related Documents

```text
docs/baseline/PHASE1_PACKET_1_5_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-005-torob-limited-implementation-design.md
docs/automation/task-packets/TPC-1-004-plugin-driver-sdk-boundary.md
docs/automation/task-packets/TPC-1-003-worker-runtime-boundary.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
```

---

## 15. Final Recommendation

```text
Approve this Packet only after review.
Do not implement until the reviewer confirms that implementation may begin.
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
Packet 1.6 = READY FOR REVIEW
Implementation = AUTHORIZATION PENDING
Torob limited execution = NOT STARTED
```
