# OpenAPI Baseline Audit — Post PR #10 / PR #12

**Phase Label:** PHASE-0  
**Date:** 2026-06-05  
**Status:** Audit complete — cleanup in WPC-0-002  
**ADR:** ADR-0007 (canonical contracts), ADR-0001 (control plane)

## Scope

Audit-only. No runtime routes, no Worker code, no migrations, no real bots.

## Baseline on `main` (after PR #12 merge)

| Layer | Path | Status |
|-------|------|--------|
| Control plane | `get-git-going` (this repo) | Active per ADR-0001 |
| ADRs | `docs/adr/ADR-0001` … `ADR-0008` | Present (PR #10 lineage) |
| Persian ADR | `docs/adr/ADR-0001-phase0-architecture-freeze.md` | Present (PR #12) |
| Governance | `docs/process/*`, `docs/baseline/*` | Present (PR #12) |
| **Canonical OpenAPI** | `automation/openapi/automation-v1.yaml` | Present — **authoritative** |
| JSON Schemas | `automation/schemas/heartbeat.schema.json`, `job.schema.json` | Present |
| Worker placeholder | `automation/worker-dummy/README.md` | Present |
| **Duplicate OpenAPI** | `openapi/automation-v1.yaml` | Present — **legacy draft** |

PR #10 files are on `main`. PR #12 added process docs and a second OpenAPI draft at repo root.

## Duplicate OpenAPI finding

Two contract files existed with **different API surfaces**:

### Canonical — `automation/openapi/automation-v1.yaml`

- OpenAPI 3.1.0, version `1.0.0-phase0`
- Paths: `/workers/heartbeat`, `/jobs/claim`, `/jobs/{jobId}/status`
- External schema refs under `automation/schemas/`
- `WorkerBearerAuth` defined
- Matches ADR-0007, BASELINE_MANIFEST, RUNBOOK_PHASE0

### Legacy draft — `openapi/automation-v1.yaml` (pre-cleanup)

- OpenAPI 3.0.3, version `0.1.0`
- Paths: `/workers/heartbeat`, `/commands/claim`, `/runs/{run_id}`, `/runs/{run_id}/events`
- Inline schemas (`AutomationCommand`, `AutomationRun`, …)
- No security scheme
- Introduced in PR #12 (`phase0: add automation OpenAPI contract`)
- Referenced by G-06 and WPC-0-001 before correction

**Risk if both remain authoritative:** implementers build two incompatible control-plane APIs.

## Safe cleanup decision (WPC-0-002)

| Action | Rationale |
|--------|-----------|
| Keep `automation/openapi/automation-v1.yaml` unchanged | ADR-0007 canonical |
| Replace `openapi/automation-v1.yaml` with deprecated stub | Preserve old links; block dual implementation |
| Add `openapi/README.md` pointer | Human-readable redirect |
| Add `OPENAPI_CANONICAL_RESOLUTION.md` | Document differences for reviewers |
| Fix G-06 and WPC-0-001 references | Single source of truth in docs |

**Not in this cleanup:** deleting the root path, merging contracts, adding `/runs/*` to canonical OpenAPI, DB↔API alignment (separate task packet).

## ADR compliance check

| ADR | Audit result |
|-----|--------------|
| 0001 | No parallel core introduced by cleanup |
| 0002 | Supabase remains SoT; contracts only |
| 0003 | No UI/Worker mixing |
| 0004 | No parallel backend |
| 0005 | Contract-only; no real bots |
| 0006 | No in-repo worker runtime added |
| 0007 | **Canonical path enforced** by this cleanup |
| 0008 | No Drive authority introduced |

## Follow-up (out of scope)

- WPC-0-001 Worker Dummy implementation
- API route implementation under `/api/automation/v1`
- Optional: extend canonical OpenAPI with `/runs/*` if DB command/run model requires it (needs `automation-contract` label)

## Related

- [OPENAPI_CANONICAL_RESOLUTION.md](./OPENAPI_CANONICAL_RESOLUTION.md)
- [task-packets/WPC-0-002-openapi-canonical-cleanup.md](./task-packets/WPC-0-002-openapi-canonical-cleanup.md)
- [ADR-0007-automation-contracts.md](../adr/ADR-0007-automation-contracts.md)
