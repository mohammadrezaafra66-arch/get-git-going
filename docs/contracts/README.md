# Automation Contracts Index

**Status:** Phase-0 contract-only — no runtime implementation  
**Baseline tag:** `baseline/v2026.06.05`

This folder indexes versioned automation contracts. Implementations (when approved in a later phase) must conform to these artifacts before merge or deploy.

## HTTP API

| Artifact | Path | Base URL (future) |
|----------|------|-------------------|
| OpenAPI 3.1 | [openapi/automation-v1.yaml](../../openapi/automation-v1.yaml) | `/api/automation/v1` |

## JSON Schemas (baseline — frozen)

| Schema | Path | `$id` |
|--------|------|-------|
| Worker heartbeat | `automation/schemas/heartbeat.schema.json` | `https://afrakala.ir/schemas/automation/heartbeat.schema.json` |
| Automation job | `automation/schemas/job.schema.json` | `https://afrakala.ir/schemas/automation/job.schema.json` |

## Human-readable contracts (Phase-0)

| Document | Path |
|----------|------|
| Dummy worker contract | [docs/automation/DUMMY_WORKER_CONTRACT.md](../automation/DUMMY_WORKER_CONTRACT.md) |
| Heartbeat contract | [docs/automation/WORKER_HEARTBEAT_CONTRACT.md](../automation/WORKER_HEARTBEAT_CONTRACT.md) |
| Job claim contract | [docs/automation/JOB_CLAIM_CONTRACT.md](../automation/JOB_CLAIM_CONTRACT.md) |
| Checkpoint contract | [docs/automation/CHECKPOINT_CONTRACT.md](../automation/CHECKPOINT_CONTRACT.md) |
| E2E smoke plan (Phase-0) | [docs/automation/E2E_SMOKE_PLAN_PHASE0.md](../automation/E2E_SMOKE_PLAN_PHASE0.md) |
| Boundary fence | [docs/automation/PHASE0_BOUNDARY_FENCE.md](../automation/PHASE0_BOUNDARY_FENCE.md) |

## Versioning rules

1. Breaking HTTP or schema changes bump `info.version` in OpenAPI and require a PR labeled `automation-contract`.
2. Phase-0 allows only **generic** job types (`generic.echo`, `generic.noop`, `generic.healthcheck`) and actions (`echo`, `noop`, `healthcheck`).
3. Marketplace-specific types, paths, or enums are rejected without ADR amendment.

## Compliance

- Contracts are specifications, not implementations (ADR-0007).
- No Divar, Torob, WhatsApp, Instagram, OCR, STT, or AI dependencies in Phase-0 contracts.
- Worker authentication uses server-issued bearer tokens — never `VITE_` secrets.
