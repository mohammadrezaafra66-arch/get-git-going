# Phase-0 Automation Tables

**Phase Label:** PHASE-0  
**Governance:** G-04  
**Task packet:** WPC-0-003  
**Migration:** `supabase/migrations/20260605120000_phase0_automation_tables.sql`  
**Status:** Schema-only — no Worker code, no UI, no real bots

## Purpose

These tables implement the **database-backed queue** decision (**G-04 / WPC-0-003**): Phase-0 automation persists commands, runs, heartbeats, checkpoints, artifacts, and events in Supabase/PostgreSQL. Redis/RabbitMQ are not used.

This migration enables the future **G-08 / WPC-0-001** E2E path:

`UI command → DB job → Dummy Worker claim → run → events → UI/query status`

## Table map

| Table | Role | OpenAPI mapping (canonical) |
|-------|------|-----------------------------|
| `automation_modules` | Module registry | Capability/module metadata |
| `automation_jobs` | Command queue | `job.schema.json`, `POST /jobs/claim` |
| `automation_job_runs` | Execution instance | Run lifecycle; `PATCH /jobs/{jobId}/status` (future) |
| `automation_workers` | Worker registry | `POST /workers/heartbeat` |
| `automation_worker_heartbeats` | Heartbeat history | `POST /workers/heartbeat` |
| `automation_checkpoints` | Progress snapshots | `CHECKPOINT_SAVED` events (persistence layer) |
| `automation_artifacts` | Run outputs | Structured run outputs / attachments |
| `automation_log_events` | Append-only event log | Operator visibility; future worker ingestion |

Canonical contract: [`automation/openapi/automation-v1.yaml`](../../automation/openapi/automation-v1.yaml) (ADR-0007).

## Phase labels

All tables that carry `phase_label` enforce:

`BASELINE`, `PHASE-0`, `PHASE-1`, `FUTURE`

Seed data uses `PHASE-0` for the enabled `dummy_worker` module.

## Seed data

Only one **enabled** module is seeded:

| module_key | status | phase_label |
|------------|--------|-------------|
| `dummy_worker` | `enabled` | `PHASE-0` |

No Divar, WhatsApp, Instagram, Torob, OCR, STT, or AI modules are seeded or enabled.

## Job types (Phase-0 constraint)

`automation_jobs.job_type` allows only:

- `DUMMY_RUN`
- `generic.echo`
- `generic.noop`
- `generic.healthcheck`

## Idempotency

`automation_jobs.idempotency_key` is **NOT NULL** and **UNIQUE**. Operators/server routes must supply a stable key when enqueueing to prevent duplicate commands.

## Status enums

**Jobs (SQL):** `PENDING`, `CLAIMED`, `CANCELLED`, `EXPIRED`

**Runs (SQL):** `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

**Workers / heartbeats:** `ONLINE`, `DEGRADED`, `OFFLINE`

**Events:** `RUN_STARTED`, `HEARTBEAT`, `CHECKPOINT_SAVED`, `RUN_COMPLETED`, `RUN_FAILED`, `RUN_CANCELLED`

## Security / RLS

| Impact | Detail |
|--------|--------|
| RLS | Enabled on all 8 tables |
| SELECT | `admin`, `manager` only |
| INSERT/UPDATE/DELETE | No policies for `authenticated` — mutations blocked at RLS |
| Server writes | Future control-plane routes via service role or `SECURITY DEFINER` RPCs |
| Secrets | Must not be stored in `metadata`, `payload`, or `host` JSON fields |

TODO comments in the migration mark where claim/heartbeat/enqueue RPCs should be added in a follow-up task.

## Rollback

The repository does not use down migrations. Manual rollback order is documented in the migration header (`DROP TABLE ... CASCADE` reverse dependency order).

## Out of scope (this migration)

- Control-plane API routes under `/api/automation/v1`
- Python Worker runtime
- `claim_*` / `enqueue_*` SECURITY DEFINER functions
- UI status pages
- Real platform integrations

## Related

- [ADR-0001-phase0-architecture-freeze.md](../adr/ADR-0001-phase0-architecture-freeze.md)
- [PHASE0_OPEN_QUESTIONS_G01_G08.md](../process/PHASE0_OPEN_QUESTIONS_G01_G08.md) — G-04
- [WPC-0-001-worker-dummy.md](./task-packets/WPC-0-001-worker-dummy.md) — G-08 consumer (after this migration)
- [automation/openapi/automation-v1.yaml](../../automation/openapi/automation-v1.yaml)
- [SECURITY_BASELINE.md](../security/SECURITY_BASELINE.md)
