# WPC-0-001 — Worker Dummy فاز صفر

**Phase Label:** PHASE-0  
**Governance:** G-08  
**Owner:** محمدرضا افرا  
**Reviewer:** محمدرضا افرا  
**Status:** **CLOSED** — E2E evidence recorded 2026-06-05

## 1. هدف

ساخت یک Worker Dummy که بدون اتصال به هیچ پلتفرم خارجی، مسیر کامل command → claim → run → event → completed را تست کند.

## 2. محدوده مجاز

- docs/automation/**
- automation/openapi/automation-v1.yaml
- automation/schemas/*.json
- automation/worker-dummy/** (Phase-0 smoke runner)
- migrationهای automation (G-04 / WPC-0-003 — prerequisite)

## 3. محدوده ممنوع

- دیوار واقعی
- واتساپ واقعی
- اینستاگرام واقعی
- ترب واقعی
- OCR/STT
- AI production
- ساخت Core موازی
- ساخت دیتابیس موازی

## 4. خروجی مورد انتظار

1. Worker بتواند heartbeat بفرستد.
2. Worker بتواند یک command را claim کند.
3. Worker بتواند run بسازد یا وضعیت run را به‌روزرسانی کند.
4. Worker بتواند events بنویسد.
5. Worker بتواند با موفقیت RUN_COMPLETED ثبت کند.

## 5. تست پذیرش

سناریوی تست:

1. یک command dummy ساخته شود.
2. Worker اجرا شود.
3. command به claimed تغییر کند.
4. run ساخته شود.
5. eventهای RUN_STARTED و RUN_COMPLETED ثبت شوند.
6. UI یا query دیتابیس وضعیت completed را نشان دهد.

## 6. E2E evidence (2026-06-05)

**PR:** #19 merged → `cb7c070` on `main`  
**Runner:** `automation/worker-dummy/run-e2e.mjs` (LAN/local)

| Field | Result |
|-------|--------|
| ok | true |
| phase | PHASE-0 |
| task_packet | WPC-0-001 |
| governance | G-08 |
| job_created | true |
| job_status | CLAIMED |
| run_status | COMPLETED |
| heartbeat_recorded | true |
| checkpoint_count | 1 |
| event_types | RUN_STARTED, CHECKPOINT_SAVED, RUN_COMPLETED |
| real_bot_scope | false |
| phase1_unlocked | false |
| idempotency_rerun_check | ok — completed/claimed jobs not re-claimed as PENDING |

**Non-blocking note:** A later manual rerun with fixed `AUTOMATION_E2E_IDEMPOTENCY_KEY=phase0-e2e-smoke-001` returned `No PENDING job available to claim after enqueue` because the prior job was already CLAIMED/COMPLETED. This is expected idempotent behavior, not an E2E failure.

## 7. شرط توقف

اگر schema، RLS، مسیر API یا access token نامشخص بود، Worker نباید ساخته شود. **Resolved:** G-04 migration on main; E2E executed with server-side credentials on LAN/local.

## Related

- [PHASE0_AUTOMATION_TABLES.md](../PHASE0_AUTOMATION_TABLES.md)
- [G01_G08_CLOSURE_STATUS.md](../G01_G08_CLOSURE_STATUS.md)
- [PHASE0_ACCEPTANCE_GATE.md](../PHASE0_ACCEPTANCE_GATE.md)
