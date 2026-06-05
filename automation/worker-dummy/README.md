# Worker Dummy — Phase 0 E2E (G-08 / WPC-0-001)

**Phase Label:** PHASE-0  
**Governance:** G-08  
**Task packet:** WPC-0-001  
**Status:** Local dummy E2E smoke — **not a real bot**

## Purpose

Minimal Phase-0 dummy worker flow against Supabase/PostgreSQL automation tables (G-04 / WPC-0-003):

`enqueue job → claim PENDING → create run → heartbeat → checkpoint → events → complete`

No Divar, WhatsApp, Instagram, Torob, OCR, STT, AI, Redis, RabbitMQ, or Laravel.

## Prerequisites

1. Migration `20260605120000_phase0_automation_tables.sql` applied to target database.
2. Seed row `dummy_worker` present and `enabled`.
3. Server env vars (never expose to client):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Run E2E smoke

From repo root:

```bash
node automation/worker-dummy/run-e2e.mjs
```

Optional:

```bash
AUTOMATION_E2E_IDEMPOTENCY_KEY=phase0-e2e-smoke-001 node automation/worker-dummy/run-e2e.mjs
```

The script loads `.env` or `deploy/local/.env.local` if present (without printing secrets).

## Flow verified

| Step | Table / action |
|------|----------------|
| 1 | `automation_jobs` — insert PENDING `DUMMY_RUN` (idempotent key) |
| 2 | `automation_workers` — register dummy worker |
| 3 | `automation_worker_heartbeats` — record heartbeat |
| 4 | `automation_jobs` — claim PENDING → `CLAIMED` |
| 5 | `automation_job_runs` — create `RUNNING` run |
| 6 | `automation_log_events` — `RUN_STARTED` |
| 7 | `automation_checkpoints` — sequence 1 |
| 8 | `automation_log_events` — `CHECKPOINT_SAVED` |
| 9 | `automation_job_runs` — `COMPLETED` + result |
| 10 | `automation_log_events` — `RUN_COMPLETED` |
| 11 | Idempotency — same key does not create duplicate job; completed jobs not re-claimed as PENDING |

## Architecture

| Component | Location |
|-----------|----------|
| Control plane | This repository |
| Data SoT | Supabase / PostgreSQL |
| Worker runtime | `automation/worker-dummy/*.mjs` (Phase-0 smoke only) |
| Contracts | `automation/openapi/automation-v1.yaml`, `automation/schemas/` |

Future production worker remains a **separate** deploy unit (ADR-0006). This folder is not a real bot.

## Related

- [PHASE0_AUTOMATION_TABLES.md](../../docs/automation/PHASE0_AUTOMATION_TABLES.md)
- [WPC-0-001-worker-dummy.md](../../docs/automation/task-packets/WPC-0-001-worker-dummy.md)
- [ADR-0006 Worker runtime boundary](../../docs/adr/ADR-0006-worker-runtime-boundary.md)
