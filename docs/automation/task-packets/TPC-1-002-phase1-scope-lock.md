# TPC-1-002 — Phase 1 Scope Lock

**Phase Label:** PHASE-1  
**Packet:** 1.2  
**Task ID:** TPC-1-002  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet قفل کردن محدوده اجرایی Phase 1 است.

این Packet فقط مشخص می‌کند فاز ۱ چه چیزهایی را شامل می‌شود، چه چیزهایی را شامل نمی‌شود، و برای شروع اجرای محدود Torob در Packetهای بعدی چه مرزهایی باید رعایت شود.

این Packet هیچ کدنویسی، migration، Worker Runtime، Driver واقعی یا اتصال خارجی انجام نمی‌دهد.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packet 1.1 = ACCEPTED
Selected first module = Torob limited
```

مرجع پذیرش Packet 1.1:

```text
docs/baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md
```

---

## 3. Scope مجاز Phase 1

Phase 1 فقط شامل اجرای محدود و مرحله‌ای موارد زیر است:

1. قفل کردن Scope فاز ۱.
2. طراحی Worker Runtime واقعی، اما ساده و کنترل‌شده.
3. طراحی Plugin / Driver Interface.
4. آماده‌سازی Torob limited به عنوان اولین ماژول واقعی کم‌ریسک.
5. ذخیره خروجی اصلی در Supabase/PostgreSQL.
6. نمایش خروجی در پنل فعلی.
7. تست Retry، Failure و Checkpoint.
8. تست مصرف منابع.
9. Acceptance Review نهایی فاز ۱.

---

## 4. Scope مجاز برای Torob limited

Torob limited در Phase 1 فقط به معنی اجرای کوچک و قابل کنترل است:

```text
حداکثر ۳ تا ۵ محصول تستی
بدون مقیاس ۳۰۰ محصول
بدون استخراج گسترده فروشندگان
بدون AI production
بدون قیمت‌گذاری هوشمند کامل
بدون تغییر قیمت سایت افراکالا
بدون چند Worker همزمان
بدون Redis/RabbitMQ
بدون اجرای سنگین یا زمان‌بندی تولیدی
```

هدف Torob limited در فاز ۱:

```text
اثبات اینکه Control Plane، Job، Worker، Driver، Supabase، Log، Checkpoint و UI می‌توانند یک چرخه محدود واقعی را کامل کنند.
```

---

## 5. Out of Scope فاز ۱

موارد زیر در Phase 1 ممنوع‌اند مگر با ADR جدید و unlock جداگانه:

1. Divar real bot.
2. WhatsApp real bot.
3. Instagram real bot.
4. OCR/STT production.
5. AI production.
6. Messaging/Sender real production.
7. Google Maps full-scale extraction.
8. Torob full-scale extraction.
9. استخراج ۳۰۰ محصول.
10. اجرای چند Worker همزمان.
11. Redis/RabbitMQ بدون ADR.
12. Laravel یا backend موازی.
13. API موازی.
14. دیتابیس موازی.
15. پنل ادمین موازی.
16. ذخیره secret در repo یا Drive.
17. call مستقیم خارجی از UI.
18. منطق استخراج داخل React/Lovable.

---

## 6. Phase 1 Packet Sequence

ترتیب پیشنهادی Packetهای فاز ۱:

| Packet | هدف | وضعیت |
|---|---|---|
| 1.1 | انتخاب اولین ماژول | ACCEPTED |
| 1.2 | قفل کردن Scope فاز ۱ | READY FOR REVIEW |
| 1.3 | طراحی Worker Runtime boundary | LOCKED |
| 1.4 | طراحی Plugin / Driver SDK | LOCKED |
| 1.5 | طراحی Torob limited implementation packet | LOCKED |
| 1.6 | اجرای محدود Torob | LOCKED |
| 2.1 | ذخیره خروجی در Supabase | LOCKED |
| 2.2 | نمایش خروجی در UI | LOCKED |
| 2.3 | Retry / Failure / Checkpoint tests | LOCKED |
| 2.4 | Resource usage test | LOCKED |
| 2.5 | Phase 1 evidence sync | LOCKED |
| 2.6 | Phase 1 acceptance review | LOCKED |

نکته: عنوان و مرز Packetهای بعدی ممکن است در Packetهای بعدی دقیق‌تر شوند، اما هیچ Packet بعدی بدون unlock جداگانه مجاز نیست.

---

## 7. Allowed Files

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-1-002-phase1-scope-lock.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 8. Forbidden Files

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

## 9. Database Policy

این Packet هیچ جدول، migration، index، RLS یا policy جدیدی نمی‌سازد.

اگر Packetهای بعدی برای Torob limited نیاز به جدول جدید داشته باشند، باید جداگانه تعریف شود:

1. نام جدول.
2. هدف جدول.
3. ستون‌ها.
4. ارتباط با `automation_jobs` و `automation_job_runs`.
5. RLS / RBAC impact.
6. migration.
7. rollback note.
8. test evidence.

---

## 10. API Policy

این Packet هیچ API یا OpenAPI جدیدی ایجاد نمی‌کند.

اگر Packetهای بعدی نیاز به contract جدید داشته باشند، اول باید contract در یک Packet جداگانه تعریف شود، بعد implementation انجام شود.

---

## 11. UI Policy

در Phase 1، UI فقط نمایش و فرمان‌دهی محدود انجام می‌دهد.

مجاز:

```text
نمایش Job
نمایش Run
نمایش Log
نمایش خروجی محدود Torob
نمایش خطا
نمایش آخرین Heartbeat
```

ممنوع:

```text
استخراج داده داخل UI
ذخیره secret در browser
call مستقیم به Torob از browser
ساخت logic اصلی داخل React/Lovable
```

---

## 12. Worker Policy

Worker Runtime باید جدا از UI باشد.

در Phase 1، Worker باید حداقلی، قابل تست و قابل خاموش/روشن کردن باشد.

الزامات کلی Worker در Packetهای بعدی:

```text
claim job
send heartbeat
write logs
write checkpoint
respect stop/pause
complete/fail job safely
avoid duplicate execution
```

---

## 13. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 1.1 accepted ثبت شده است.
2. بررسی شود Packet 1.2 scope را قفل می‌کند.
3. بررسی شود Packetهای 1.3 تا 2.6 locked باقی مانده‌اند.
4. بررسی شود هیچ فایل اجرایی در Allowed Files نیست.
5. بررسی شود Out of Scope صریح است.
6. بررسی شود Torob limited از حالت full-scale جدا شده است.
7. بررسی شود هیچ migration یا API تغییر نکرده است.
8. بررسی شود هیچ secret وارد سند نشده است.

---

## 14. Acceptance Criteria

این Packet فقط وقتی accepted است که:

1. سند `TPC-1-002` ساخته شده باشد.
2. سند acceptance مربوط به Packet 1.1 ثبت شده باشد.
3. `PHASE1_TASK_PACKET_INDEX.md` آپدیت شده باشد.
4. Packet 1.1 وضعیت ACCEPTED داشته باشد.
5. Packet 1.2 وضعیت READY FOR REVIEW داشته باشد.
6. Packetهای 1.3 تا 2.6 LOCKED باقی بمانند.
7. هیچ implementation انجام نشده باشد.
8. هیچ migration انجام نشده باشد.
9. هیچ Worker Runtime ساخته نشده باشد.
10. هیچ Driver واقعی ساخته نشده باشد.
11. هیچ اتصال خارجی ایجاد نشده باشد.
12. هیچ secret ثبت نشده باشد.

---

## 15. Stop Conditions

کار باید متوقف شود اگر:

1. لازم شود فایل‌های `src/**` تغییر کنند.
2. لازم شود migration ساخته شود.
3. لازم شود OpenAPI تغییر اجرایی کند.
4. لازم شود Worker Runtime ساخته شود.
5. لازم شود Torob واقعی اجرا شود.
6. لازم شود Google Maps واقعی اجرا شود.
7. لازم شود Redis/RabbitMQ اضافه شود.
8. لازم شود secret یا `.env` وارد repo شود.
9. اختلافی درباره Scope فاز ۱ وجود داشته باشد.
10. Packet 1.3 قبل از acceptance این Packet شروع شود.

---

## 16. Related Documents

```text
docs/automation/task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md
docs/baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md
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

## 17. Final Recommendation

```text
Approve Packet 1.2 only as a docs-only scope lock.
Do not start Worker Runtime implementation until Packet 1.3 is separately created, reviewed, and accepted.
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
Packet 1.2 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Phase 1 Scope = LOCKED FOR REVIEW
```
