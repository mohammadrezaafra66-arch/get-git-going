# Worker Heartbeat Contract (Phase-0)

**Status:** Contract-only — no server enforcement in Phase-0  
**Baseline tag:** `baseline/v2026.06.05`  
**Schema:** `automation/schemas/heartbeat.schema.json`  
**HTTP:** `POST /api/automation/v1/workers/heartbeat`

## Purpose

Heartbeats let the control plane know which worker instances are alive, their capacity, and which generic capabilities they advertise. Phase-0 defines the contract only; no heartbeat ingestion route or persistence table is implemented.

## Request

| Property | Value |
|----------|-------|
| Method | `POST` |
| Path | `/api/automation/v1/workers/heartbeat` |
| Auth | `WorkerBearerAuth` (server-issued bearer token) |
| Content-Type | `application/json` |
| Body schema | `automation/schemas/heartbeat.schema.json` |

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `worker_id` | `uuid` | Stable instance identifier |
| `reported_at` | `date-time` | ISO-8601 UTC from worker clock |
| `status` | enum | `healthy`, `degraded`, `draining`, `offline` |
| `capabilities` | `string[]` | Min 1, unique, generic tags only |

### Optional fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `active_jobs` | `integer` | `0` | In-flight jobs (0–100) |
| `max_concurrent_jobs` | `integer` | `1` | Max parallel jobs (1–100) |
| `version` | `string` | — | Worker software version (max 64 chars) |
| `host.hostname` | `string` | — | Observability only |
| `host.platform` | `string` | — | e.g. `linux`, `windows` |
| `metadata` | `object` | — | Opaque string map; **no secrets** |

### Status semantics

| Status | Meaning | Claim behavior (future) |
|--------|---------|-------------------------|
| `healthy` | Normal operation | Eligible for job dispatch |
| `degraded` | Partial failure; still running | Dispatch only if no healthy workers (policy TBD) |
| `draining` | Finishing active jobs; no new claims | Must not receive new jobs |
| `offline` | Shutting down or unreachable | Must not receive new jobs |

### Capability rules (Phase-0)

- Pattern: `^[a-z][a-z0-9._-]{1,63}$`
- Allowed documented tags: `generic.echo`, `generic.noop`, `generic.healthcheck`
- Marketplace-specific tags are rejected in review

## Response

### 200 OK — HeartbeatAck

```json
{
  "accepted_at": "2026-06-05T12:00:00.123Z",
  "next_heartbeat_seconds": 30
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `accepted_at` | `date-time` | — | Server receipt timestamp |
| `next_heartbeat_seconds` | `integer` | 5–300 | Interval before next heartbeat |

Workers **must** schedule the next heartbeat using `next_heartbeat_seconds`. If the field is absent (implementation bug), default to **30** seconds.

### Error responses

| Code | Meaning | Worker behavior |
|------|---------|-----------------|
| `400` | Invalid payload | Fix payload; do not spin-tight-loop |
| `401` | Unauthorized | Stop claims; alert operator |
| `503` | Control plane unavailable | Retry with backoff; keep local health state |

## Timing contract

| Parameter | Contract value | Notes |
|-----------|----------------|-------|
| Default interval | 30s | From `next_heartbeat_seconds` |
| Minimum interval | 5s | Enforced by ack schema |
| Maximum interval | 300s | Enforced by ack schema |
| Missed heartbeat threshold | 3× interval | Future: mark worker stale in DB |

Workers should send heartbeats **even when idle** (no active jobs).

## Security

1. Bearer token is server-issued and stored in worker environment only.
2. Never use `VITE_` prefix or embed token in UI bundles.
3. `metadata` must not contain API keys, passwords, or session cookies.
4. Heartbeat endpoint is **worker-only** — not callable from browser clients without separate review.

## Draining protocol (future)

When a worker sets `status: "draining"`:

1. Continue heartbeats until `active_jobs` reaches 0.
2. Do not call `/jobs/claim` while draining.
3. Complete or fail in-flight jobs via `/jobs/{id}/status`.
4. Transition to `offline` on shutdown after final heartbeat.

## Example payloads

**Healthy idle worker:**

```json
{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "reported_at": "2026-06-05T12:00:00Z",
  "status": "healthy",
  "capabilities": ["generic.echo", "generic.noop"],
  "active_jobs": 0,
  "max_concurrent_jobs": 2,
  "version": "phase0-contract-review",
  "host": {
    "hostname": "worker-dev-01",
    "platform": "linux"
  }
}
```

**Degraded worker with active job:**

```json
{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "reported_at": "2026-06-05T12:05:00Z",
  "status": "degraded",
  "capabilities": ["generic.echo"],
  "active_jobs": 1,
  "max_concurrent_jobs": 1,
  "version": "phase0-contract-review",
  "metadata": {
    "degraded_reason": "high_memory"
  }
}
```

## Phase-0 validation

```bash
# Example: validate sample heartbeat (requires ajv-cli)
ajv validate -s automation/schemas/heartbeat.schema.json -d sample-heartbeat.json
```

Reviewers confirm:

- [ ] Schema rejects unknown top-level properties (`additionalProperties: false`)
- [ ] No marketplace capability strings in examples
- [ ] OpenAPI `postWorkerHeartbeat` matches this document

## Related

- [DUMMY_WORKER_CONTRACT.md](./DUMMY_WORKER_CONTRACT.md)
- [JOB_CLAIM_CONTRACT.md](./JOB_CLAIM_CONTRACT.md)
- [openapi/automation-v1.yaml](../../openapi/automation-v1.yaml)
