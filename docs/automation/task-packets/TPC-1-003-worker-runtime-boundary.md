# TPC-1-003 — Worker Runtime Boundary

**Phase Label:** PHASE-1  
**Packet:** 1.3  
**Task ID:** TPC-1-003  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet فقط طراحی مرز Worker Runtime فاز ۱ است.

این Packet تعیین می‌کند Worker Runtime جداگانه باید چه مسئولیت‌هایی داشته باشد، چه مسئولیت‌هایی نباید داشته باشد، چطور با Control Plane فعلی و Supabase ارتباط بگیرد، و چه چیزهایی در Packetهای بعدی باید پیاده‌سازی شوند.

این Packet هیچ Worker واقعی، Python project، dependency، Driver، migration یا اتصال خارجی ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packet 1.1 = ACCEPTED
Packet 1.2 = ACCEPTED
Selected first module = Torob limited
Phase 1 scope = LOCKED
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md
```

---

## 3. تصمیم مرزی

Worker Runtime باید بیرون از UI و بیرون از React/TanStack/Lovable باشد.

Control Plane فعلی در ریپوی `get-git-going` باقی می‌ماند و Worker فقط از طریق قراردادهای مجاز با آن ارتباط می‌گیرد.

```text
get-git-going = Control Plane / Core
Supabase/PostgreSQL = Source of Truth
React/TanStack/Lovable = UI only
Python Worker Runtime = separate runtime
Plugin/Driver = inside Worker Runtime, not inside UI
```

---

## 4. مسئولیت‌های مجاز Worker Runtime

Worker Runtime در فاز ۱ فقط این مسئولیت‌ها را دارد:

1. خواندن تنظیمات لازم از محیط امن.
2. اتصال server-side به Supabase طبق قرارداد مجاز.
3. claim کردن Job مجاز.
4. اجرای Job از طریق Driver Interface در Packetهای بعدی.
5. ارسال heartbeat.
6. ثبت structured logs.
7. ثبت checkpoint.
8. ثبت status نهایی `COMPLETED` یا `FAILED`.
9. رعایت stop / pause در صورت وجود command.
10. جلوگیری از اجرای تکراری Job.
11. خروج ایمن در shutdown.

---

## 5. مسئولیت‌های ممنوع Worker Runtime

Worker Runtime نباید این کارها را انجام دهد:

1. ساخت Core جدید.
2. ساخت API جدید خارج از قرارداد مصوب.
3. ساخت پنل جدید.
4. ساخت دیتابیس جدید.
5. ذخیره دائمی خارج از Supabase مگر artifact موقت و مستند.
6. bypass کردن RLS/RBAC بدون تصمیم امنیتی.
7. اجرای Divar، WhatsApp، Instagram، OCR/STT یا AI production.
8. اجرای Torob full-scale.
9. استفاده از Redis/RabbitMQ بدون ADR جدید.
10. نگه‌داشتن secret در repo.
11. اجرای منطق در UI.
12. call مستقیم از browser به سرویس خارجی.

---

## 6. مرز ارتباط با Control Plane

Worker Runtime نباید فایل‌های UI را صدا بزند یا منطق خود را داخل UI قرار دهد.

ارتباط مجاز:

```text
Worker Runtime -> Supabase/PostgreSQL
Worker Runtime -> approved automation tables
Worker Runtime -> approved OpenAPI/contract if needed
Control Plane UI -> Supabase/server-side functions -> automation_jobs
```

ارتباط ممنوع:

```text
Worker Runtime -> React component
React component -> Torob/Google Maps directly
UI browser -> secret/service-role key
Driver -> direct write to unrelated business tables without approved contract
```

---

## 7. ساختار پیشنهادی برای Packetهای بعدی

در Packetهای بعدی، اگر implementation مجاز شد، ساختار پیشنهادی می‌تواند این باشد:

```text
afrakala-worker/
├── README.md
├── .env.example
├── worker/
│   ├── main.py
│   ├── config.py
│   ├── logger.py
│   ├── supabase_client.py
│   ├── job_runner.py
│   ├── checkpoint.py
│   ├── retry.py
│   ├── shutdown.py
│   └── drivers/
```

اما در این Packet ایجاد این مسیرها ممنوع است.

---

## 8. Runtime Flow پیشنهادی

چرخه Worker Runtime در Packetهای بعدی باید این باشد:

```text
1. boot
2. load config
3. register worker heartbeat
4. claim one allowed job
5. create or update run
6. execute via driver interface
7. write logs
8. write checkpoint
9. complete or fail run
10. release safely
```

---

## 9. حداقل وضعیت‌های موردنیاز

Worker باید با وضعیت‌های موجود automation هماهنگ باشد.

وضعیت‌های قابل قبول برای طراحی فاز ۱:

```text
PENDING
CLAIMED
RUNNING
PAUSED
FAILED
COMPLETED
CANCELLED
```

اگر وضعیت جدید لازم شد، باید در Packet جداگانه و با contract review تعریف شود.

---

## 10. Retry / Backoff Policy

در فاز ۱، Retry باید ساده و قابل فهم باشد:

```text
max_attempts: limited
backoff: exponential with jitter
transient errors: retry
fatal errors: fail safely
business errors: log and skip if approved
```

این Packet فقط policy را تعریف می‌کند و هیچ retry code نمی‌سازد.

---

## 11. Checkpoint Policy

Worker باید قبل از هر بخش پرریسک checkpoint ذخیره کند.

در Packetهای بعدی، checkpoint باید حداقل شامل موارد زیر باشد:

```text
job_id
run_id
driver_name
step_name
last_processed_item
progress_percent
updated_at
```

قانون:

```text
اگر Worker قطع شد، کار نباید از صفر شروع شود مگر اینکه Packet مربوطه صریحاً همین را مجاز کند.
```

---

## 12. Logging Policy

Log باید structured باشد و برای هر رویداد حداقل این اطلاعات را داشته باشد:

```text
timestamp
level
job_id
run_id
worker_id
event_type
message
context
```

ممنوع:

```text
secret
service_role_key
raw credential
.env value
sensitive customer data without masking
```

---

## 13. Allowed Files

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-003-worker-runtime-boundary.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 14. Forbidden Files

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

## 15. Test Plan این Packet

این Packet docs-only است. تست آن review-based است:

1. بررسی شود Packet 1.2 accepted ثبت شده است.
2. بررسی شود Worker Runtime فقط طراحی مرزی دارد.
3. بررسی شود هیچ فایل اجرایی مجاز نیست.
4. بررسی شود هیچ مسیر Worker ساخته نشده است.
5. بررسی شود هیچ migration یا OpenAPI اجرایی تغییر نکرده است.
6. بررسی شود هیچ Driver واقعی ساخته نشده است.
7. بررسی شود stop conditions روشن هستند.
8. بررسی شود scope با تصمیمات فاز صفر تناقض ندارد.

---

## 16. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-1-003` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 1.2 به عنوان accepted ثبت شده باشد.
4. Worker Runtime boundary شفاف باشد.
5. مسئولیت‌های مجاز و ممنوع Worker مشخص باشد.
6. هیچ کد اجرایی تغییر نکرده باشد.
7. هیچ migration ایجاد نشده باشد.
8. هیچ Driver یا runtime ساخته نشده باشد.
9. هیچ secret ثبت نشده باشد.
10. Packet 1.4 تا 2.6 locked باقی بمانند.

---

## 17. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به کدنویسی باشد.
2. لازم شود مسیر `afrakala-worker/**` ساخته شود.
3. لازم شود `package.json` یا dependencyها تغییر کنند.
4. لازم شود Supabase migration ساخته شود.
5. لازم شود OpenAPI اجرایی تغییر کند.
6. لازم شود Torob یا Google Maps اجرا شود.
7. لازم شود secret یا `.env` وارد repo شود.
8. Cursor بخواهد implementation انجام دهد.

---

## 18. Related Documents

```text
docs/baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-002-phase1-scope-lock.md
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

## 19. Final Recommendation

```text
Approve Packet 1.3 only as Worker Runtime boundary planning.
Do not implement Worker Runtime until a future implementation packet is created, reviewed, and accepted.
```

---

## 20. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 1.3 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Worker Runtime = BOUNDARY ONLY
```
