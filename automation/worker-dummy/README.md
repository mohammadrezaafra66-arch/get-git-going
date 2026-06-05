# Worker Dummy — Placeholder Only

**Status:** Phase 0 baseline — **not a real bot**  
**Baseline:** `baseline-2026-06-05`

## Purpose

This directory exists to document where **external** worker runtimes will live. It intentionally contains **no executable code**, no Docker image, and no integration with Divar, Torob, WhatsApp, Instagram, OCR, STT, or AI services.

## Architecture reminder

| Component | Location |
|-----------|----------|
| Control plane | This repository (`afrakala-platform`) |
| Source of truth (data) | Supabase / PostgreSQL |
| UI | Lovable / React / TanStack (UI only) |
| Worker runtime | **Separate** deploy unit (future) |
| Contracts | `automation/openapi/automation-v1.yaml`, `automation/schemas/` |

See ADR-0006 (worker runtime boundary) and ADR-0005 (Phase 0 scope).

## What a future worker MUST do

1. Authenticate with a **server-issued** bearer token (never `VITE_` secrets).
2. POST heartbeats validating against `automation/schemas/heartbeat.schema.json`.
3. Claim jobs via `automation-v1` OpenAPI (`/jobs/claim`).
4. Report status via `/jobs/{jobId}/status`.
5. Persist authoritative state only through the control plane / Supabase — not local databases for shared state.

## What a future worker MUST NOT do in Phase 0

- Scrape marketplaces or messaging platforms
- Run OCR/STT/LLM pipelines
- Write job history to Google Drive
- Introduce a parallel Laravel or second PostgreSQL schema

## Phase 0 testing (manual, contract-level)

Until APIs are implemented:

1. Validate sample JSON against schemas (e.g. `ajv` CLI).
2. Review OpenAPI in a renderer; confirm no marketplace-specific paths.
3. Reject PRs that add `.py`, `.go`, `.ts` worker entrypoints here without ADR amendment.

## Example heartbeat (validates against schema)

```json
{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "reported_at": "2026-06-05T12:00:00Z",
  "status": "healthy",
  "capabilities": ["generic.echo", "generic.noop"],
  "active_jobs": 0,
  "max_concurrent_jobs": 1,
  "version": "phase0-placeholder"
}
```

## Example job (validates against schema)

```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "type": "generic.echo",
  "status": "pending",
  "created_at": "2026-06-05T12:00:00Z",
  "payload": {
    "action": "echo",
    "input": { "message": "phase0-contract-check" }
  }
}
```

## Related documentation

- [ADR-0006 Worker runtime boundary](../../docs/adr/ADR-0006-worker-runtime-boundary.md)
- [ADR-0007 Automation contracts](../../docs/adr/ADR-0007-automation-contracts.md)
- [RUNBOOK_PHASE0](../../docs/ops/RUNBOOK_PHASE0.md)
