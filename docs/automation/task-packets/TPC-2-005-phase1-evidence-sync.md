# TPC-2-005 — Phase 1 Evidence Sync

**Phase Label:** PHASE-1  
**Packet:** 2.5  
**Task ID:** TPC-2-005  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-07  
**Implementation:** NOT AUTHORIZED IN THIS PACKET

---

## 1. هدف Packet

هدف این Packet همگام‌سازی شواهد Phase 1 قبل از closure است.

این Packet مشخص می‌کند برای بستن فاز ۱، چه سندها، PRها، acceptanceها، وضعیت index، ممنوعیت‌ها و بدهی‌های باقی‌مانده باید جمع‌بندی شوند.

این Packet هیچ implementation، test execution، migration، API، UI، Worker Runtime، Driver یا secret ایجاد نمی‌کند.

---

## 2. پیش‌نیاز

```text
Phase 0 = ACCEPTED
Packets 1.1 to 2.4 = ACCEPTED
Packet 2.6 = still locked
Actual implementation = NOT STARTED
```

مرجع:

```text
docs/baseline/PHASE1_PACKET_2_4_ACCEPTANCE_2026_06_07.md
```

---

## 3. Evidence Chain موردنیاز

قبل از closure فاز ۱ باید evidence chain زیر آماده باشد:

```text
1. Packet 1.1 acceptance
2. Packet 1.2 acceptance
3. Packet 1.3 acceptance
4. Packet 1.4 acceptance
5. Packet 1.5 acceptance
6. Packet 1.6 acceptance
7. Packet 2.1 acceptance
8. Packet 2.2 acceptance
9. Packet 2.3 acceptance
10. Packet 2.4 acceptance
11. Updated PHASE1_TASK_PACKET_INDEX.md
12. List of merged PRs
13. Confirmation that no implementation started
14. Confirmation that no forbidden bot was added
15. Confirmation that no secrets were added
```

---

## 4. Phase 1 Evidence Summary پیشنهادی

در Packet بعدی یا closure review، باید سند evidence summary ساخته شود:

```text
docs/baseline/PHASE1_EVIDENCE_SUMMARY_2026_06_07.md
```

حداقل بخش‌های آن:

```text
Phase status
Accepted packets
Open/locked packets
Merged PRs
Docs created
Implementation status
Migration status
Worker/Driver status
Secret status
Known debts
Closure recommendation
```

---

## 5. وضعیت ممنوعیت‌ها

در evidence sync باید تایید شود که موارد زیر انجام نشده‌اند:

```text
Divar real bot
WhatsApp real bot
Instagram real bot
OCR/STT production
AI production
Torob full-scale extraction
Worker Runtime implementation without approval
Driver implementation without approval
Migration without packet
Parallel core/API/DB/admin panel
Secrets in repo
```

---

## 6. وضعیت بدهی‌ها

بدهی‌های شناخته‌شده باید برای closure فاز ۱ ثبت شوند:

```text
lint baseline debt
typecheck script absence if still true
actual implementation not started
actual resource evidence not produced
actual retry/checkpoint tests not run
actual UI not implemented
actual output persistence migration not implemented
```

این بدهی‌ها به خودی خود مانع closure سندی فاز ۱ نیستند، اما نباید پنهان شوند.

---

## 7. Allowed Files این Packet

در این Packet فقط فایل‌های زیر مجاز به تغییر هستند:

```text
docs/baseline/PHASE1_PACKET_2_4_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-005-phase1-evidence-sync.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 8. Forbidden Files این Packet

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

## 9. Test Plan این Packet

چون این Packet docs-only است، تست آن review-based است:

1. بررسی شود Packet 2.4 accepted ثبت شده است.
2. بررسی شود evidence chain کامل تعریف شده است.
3. بررسی شود ممنوعیت‌ها روشن هستند.
4. بررسی شود debts پنهان نشده‌اند.
5. بررسی شود هیچ implementation یا کد تغییر نکرده است.
6. بررسی شود Packet 2.6 locked باقی مانده است.

---

## 10. Acceptance Criteria

این Packet وقتی accepted است که:

1. سند `TPC-2-005` ساخته شده باشد.
2. `PHASE1_TASK_PACKET_INDEX.md` به آن لینک بدهد.
3. Packet 2.4 به عنوان accepted ثبت شده باشد.
4. evidence chain مشخص باشد.
5. ممنوعیت‌ها و بدهی‌ها مشخص باشند.
6. هیچ کد اجرایی تغییر نکرده باشد.
7. هیچ migration ایجاد نشده باشد.
8. هیچ secret ثبت نشده باشد.
9. Packet 2.6 locked باقی بماند.

---

## 11. Stop Conditions

کار باید متوقف شود اگر:

1. برای تکمیل این Packet نیاز به اجرای واقعی باشد.
2. لازم شود کد یا migration تغییر کند.
3. لازم شود secret یا `.env` وارد repo شود.
4. evidence ناقص ولی accepted اعلام شود.
5. بدهی‌ها پنهان شوند.
6. Packet 2.6 بدون review باز شود.

---

## 12. Related Documents

```text
docs/baseline/PHASE1_PACKET_2_4_ACCEPTANCE_2026_06_07.md
docs/automation/task-packets/TPC-2-004-resource-usage-test.md
docs/automation/PHASE1_TASK_PACKET_INDEX.md
docs/process/DOR.md
docs/process/DOD.md
docs/process/PHASE_LABEL_POLICY.md
```

---

## 13. Final Recommendation

```text
Approve this Packet as evidence sync planning only.
Do not close Phase 1 until Packet 2.6 is created, reviewed, and accepted.
```

---

## 14. Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

Final status before approval:

```text
Packet 2.5 = READY FOR REVIEW
Implementation = NOT AUTHORIZED
Evidence Sync = DESIGN ONLY
```
