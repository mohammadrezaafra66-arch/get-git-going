# WPC-0-004 — Admin Automation Dummy Enqueue (Phase 0 E1)

**Phase Label:** PHASE-0  
**Governance:** Phase 0 Acceptance Gate E1  
**Owner:** محمدرضا افرا  
**Status:** **CLOSED** — minimal UI enqueue implemented

## 1. هدف

رفع blocker E1: **UI command → DB job created** — کوچک‌ترین مسیر admin/manager برای enqueue یک دستور `DUMMY_RUN` در `automation_jobs` (فقط `dummy_worker`).

## 2. محدوده مجاز

- `src/routes/_app.admin.automation.tsx`
- `src/lib/automation/enqueue-dummy-job.*`
- `src/components/layout/nav-items.ts` (لینک ناوبری)
- `docs/automation/**`, `docs/baseline/**`

## 3. محدوده ممنوع

- ربات واقعی (Divar, WhatsApp, Instagram, Torob)
- OCR/STT / AI production
- Redis / RabbitMQ / Laravel / API موازی
- migration جدید یا تغییر schema
- service role در مرورگر
- Phase 1 unlock

## 4. پیاده‌سازی

| Component | Path |
|-----------|------|
| UI route | `/admin/automation` |
| Route guard | `requireAnyRole(["admin", "manager"])` |
| Server function | `enqueueDummyAutomationJobFn` |
| Server write | `enqueueDummyAutomationJob()` via `supabaseAdmin` |
| Module | `dummy_worker` only (`enabled`) |
| Job type | `DUMMY_RUN` |
| Audit | `automation_dummy_job_enqueued` → `audit_logs` |

## 5. تست پذیرش

1. ورود با نقش admin یا manager
2. باز کردن `/admin/automation`
3. کلیک **ایجاد دستور dummy**
4. تأیید نمایش `job id`, `status`, `created_at`
5. تأیید ردیف در `automation_jobs` با `job_type = DUMMY_RUN` و ماژول `dummy_worker`
6. تأیید عدم وجود secret در client bundle / network response

## 6. Related

- [PHASE0_E1_UI_ENQUEUE_EVIDENCE_2026_06_07.md](../baseline/PHASE0_E1_UI_ENQUEUE_EVIDENCE_2026_06_07.md)
- [PHASE0_ACCEPTANCE_GATE.md](./PHASE0_ACCEPTANCE_GATE.md)
- [WPC-0-001-worker-dummy.md](./WPC-0-001-worker-dummy.md)
- [PHASE0_E1_E3_BLOCKER_2026_06_07.md](../baseline/PHASE0_E1_E3_BLOCKER_2026_06_07.md)
