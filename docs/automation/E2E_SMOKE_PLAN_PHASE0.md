# E2E Smoke Plan — Phase-0 (Contract Review)

**Status:** Contract-only — **no live bot fleet**  
**Baseline tag:** `baseline/v2026.06.05`  
**Audience:** Reviewers, QA, operators before implementation

## Purpose

This smoke plan verifies that Phase-0 automation **contracts** are complete, consistent, and safe to implement. It does **not** require a running worker, control-plane routes, or database tables.

Passing this plan means the team can approve implementation work in a **later phase**.

## Scope boundary

| In scope | Out of scope |
|----------|----------------|
| JSON Schema validation | Live HTTP calls to production |
| OpenAPI structural review | Divar / Torob / WhatsApp / Instagram |
| Cross-document consistency | OCR / STT / AI pipelines |
| Security review (no `VITE_` secrets) | Production migrations |
| Boundary fence checklist | Real Python worker deploy |

## Prerequisites

- Checkout branch with `docs/automation/*` and `openapi/automation-v1.yaml`
- Baseline schemas present: `automation/schemas/heartbeat.schema.json`, `automation/schemas/job.schema.json`
- Optional CLI tools: `ajv` (JSON Schema), `redocly` or `swagger-cli` (OpenAPI)

## Smoke suite A — Document presence

| # | Check | Pass criteria |
|---|-------|---------------|
| A1 | Dummy worker contract exists | `docs/automation/DUMMY_WORKER_CONTRACT.md` |
| A2 | Heartbeat contract exists | `docs/automation/WORKER_HEARTBEAT_CONTRACT.md` |
| A3 | Job claim contract exists | `docs/automation/JOB_CLAIM_CONTRACT.md` |
| A4 | Checkpoint contract exists | `docs/automation/CHECKPOINT_CONTRACT.md` |
| A5 | Boundary fence exists | `docs/automation/PHASE0_BOUNDARY_FENCE.md` |
| A6 | Contract index exists | `docs/contracts/README.md` |
| A7 | OpenAPI exists | `openapi/automation-v1.yaml` |

## Smoke suite B — Phase-0 labeling

| # | Check | Pass criteria |
|---|-------|---------------|
| B1 | Every automation doc states Phase-0 / contract-only | No doc claims runnable bot |
| B2 | No marketplace integrations listed as in-scope | Grep docs for `divar`, `torob`, `whatsapp`, `instagram` → only in "forbidden" context |
| B3 | No AI/OCR/STT as in-scope | Same pattern for `ocr`, `stt`, `openai`, etc. |
| B4 | Control plane identified as existing repo | References get-git-going / afrakala-platform |

## Smoke suite C — JSON Schema validation

Create fixture files locally (do not commit secrets):

**`fixtures/heartbeat-ok.json`:**

```json
{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "reported_at": "2026-06-05T12:00:00Z",
  "status": "healthy",
  "capabilities": ["generic.echo", "generic.noop"],
  "active_jobs": 0,
  "max_concurrent_jobs": 1,
  "version": "phase0-smoke"
}
```

**`fixtures/job-claimed-echo.json`:**

```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "type": "generic.echo",
  "status": "claimed",
  "created_at": "2026-06-05T12:00:01Z",
  "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
  "claimed_at": "2026-06-05T12:00:02Z",
  "payload": {
    "action": "echo",
    "input": { "message": "phase0-smoke" }
  }
}
```

| # | Command (example) | Pass criteria |
|---|-------------------|---------------|
| C1 | `ajv validate -s automation/schemas/heartbeat.schema.json -d fixtures/heartbeat-ok.json` | Exit 0 |
| C2 | `ajv validate -s automation/schemas/job.schema.json -d fixtures/job-claimed-echo.json` | Exit 0 |
| C3 | Invalid fixture (extra top-level field on heartbeat) | Exit non-zero |
| C4 | Invalid job `type`: `divar.scrape` | Exit non-zero (pattern mismatch) |

If `ajv` is unavailable, record **"tool not run"** — manual schema review still required.

## Smoke suite D — OpenAPI review

| # | Check | Pass criteria |
|---|-------|---------------|
| D1 | Base path is `/api/automation/v1` | Server URLs end with `/api/automation/v1` |
| D2 | Only automation paths defined | No paths under `/api/public/bot` or pricing |
| D3 | `postWorkerHeartbeat` present | `POST /workers/heartbeat` |
| D4 | `claimJob` present | `POST /jobs/claim` |
| D5 | `updateJobStatus` present | `PATCH /jobs/{jobId}/status` |
| D6 | `putJobCheckpoint` present | `PUT /jobs/{jobId}/checkpoint` |
| D7 | `WorkerBearerAuth` security scheme | Bearer, no `VITE_` mention in scheme |
| D8 | No marketplace-specific operationIds or enums | Manual review |
| D9 | OpenAPI validates (optional) | `swagger-cli validate openapi/automation-v1.yaml` exit 0 |

## Smoke suite E — Cross-contract consistency

| # | Check | Pass criteria |
|---|-------|---------------|
| E1 | Heartbeat interval | Docs and `HeartbeatAck.next_heartbeat_seconds` agree (5–300, default 30) |
| E2 | Job types | Only `generic.echo`, `generic.noop`, `generic.healthcheck` |
| E3 | Payload actions | Only `echo`, `noop`, `healthcheck` |
| E4 | Empty queue | `JOB_CLAIM_CONTRACT` and OpenAPI document `204` |
| E5 | Status machine | `pending→claimed→running→succeeded/failed` aligned across docs |
| E6 | Checkpoint sequence | Monotonic `sequence` documented in checkpoint + dummy worker docs |

## Smoke suite F — Security and boundary fence

| # | Check | Pass criteria |
|---|-------|---------------|
| F1 | No app code changes in Phase-0 PR | `src/`, `supabase/migrations/` untouched |
| F2 | No production migration for automation | No new `*automation*` migration files |
| F3 | Sensitive modules untouched | No diff in pricing, accounting, invoices, customers, persons, credit |
| F4 | API namespace fence | No new routes outside `/api/automation/*` in OpenAPI |
| F5 | Auth model | Server bearer only; documented rejection of frontend secrets |

## Smoke suite G — Team review gate

| # | Action | Owner |
|---|--------|-------|
| G1 | Platform maintainer reviews boundary fence | Maintainer |
| G2 | Security review of auth section | Maintainer |
| G3 | Sign-off comment on PR: "Phase-0 contracts approved" | Team |
| G4 | Link to this smoke plan in PR description | Author |

**Implementation must not start until G3 is recorded.**

## Future suite H — Post-implementation (NOT Phase-0)

When control-plane routes exist in a later phase, extend this plan with:

| # | Check | Notes |
|---|-------|-------|
| H1 | `POST /workers/heartbeat` returns 200 with valid token | Staging only |
| H2 | `POST /jobs/claim` returns 204 when queue empty | |
| H3 | Enqueue `generic.echo` → claim → succeed | Requires DB migration phase |
| H4 | Invalid token returns 401 | |
| H5 | Checkpoint monotonicity returns 400 on duplicate sequence | |

Do **not** execute suite H during Phase-0.

## Results template

Copy into PR description:

```markdown
## Phase-0 Smoke Results

| Suite | Result | Notes |
|-------|--------|-------|
| A — Document presence | PASS / FAIL | |
| B — Phase-0 labeling | PASS / FAIL | |
| C — JSON Schema | PASS / FAIL / SKIPPED | |
| D — OpenAPI | PASS / FAIL | |
| E — Consistency | PASS / FAIL | |
| F — Boundary fence | PASS / FAIL | |
| G — Team review | PENDING / APPROVED | |

**Phase-0 contract-only:** No live E2E bot was run.
```

## Related

- [DUMMY_WORKER_CONTRACT.md](./DUMMY_WORKER_CONTRACT.md)
- [PHASE0_BOUNDARY_FENCE.md](./PHASE0_BOUNDARY_FENCE.md)
- [docs/contracts/README.md](../contracts/README.md)
- Baseline `docs/ops/RUNBOOK_PHASE0.md`
