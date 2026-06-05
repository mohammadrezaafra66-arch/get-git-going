# Checkpoint Contract (Phase-0)

**Status:** Contract-only — no persistence in Phase-0  
**Baseline tag:** `baseline/v2026.06.05`  
**HTTP:** `PUT /api/automation/v1/jobs/{jobId}/checkpoint`

## Purpose

Checkpoints let a worker report **durable progress** during long-running jobs so operators can observe execution and future implementations can support resume/retry. Phase-0 defines the HTTP contract and payload shape only — no checkpoint storage table, no resume logic, and no real long-running bots.

Dummy workers use checkpoints to prove the control-plane API surface before marketplace automation exists.

## When to checkpoint

| Scenario | Checkpoint required? |
|----------|---------------------|
| `generic.noop` (instant) | No |
| `generic.healthcheck` (instant) | No |
| `generic.echo` (small input) | Optional |
| Future long jobs (Phase 1+) | Yes — at least every 60s or 25% progress |

Phase-0 smoke plan may include a **synthetic** multi-step echo job in documentation fixtures only.

## Request

| Property | Value |
|----------|-------|
| Method | `PUT` |
| Path | `/api/automation/v1/jobs/{jobId}/checkpoint` |
| Auth | `WorkerBearerAuth` |
| Content-Type | `application/json` |

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `uuid` | Target job — must be `claimed` or `running` by this worker |

### Body — JobCheckpoint

| Field | Required | Type | Constraints |
|-------|----------|------|-------------|
| `worker_id` | yes | `uuid` | Must match `job.claimed_by` |
| `sequence` | yes | `integer` | Monotonic from 1 per job |
| `reported_at` | yes | `date-time` | ISO-8601 UTC |
| `progress_percent` | yes | `integer` | 0–100 |
| `stage` | no | `string` | Max 64 chars; e.g. `validate`, `execute` |
| `message` | no | `string` | Max 500 chars; operator-visible |
| `state` | no | `object` | Small JSON blob for resume (max 4 KB serialized) |

### `state` object rules

- Must be JSON-serializable (no binary).
- Must not contain secrets, credentials, or PII.
- Phase-0: opaque to control plane — stored as-is (future).
- For `generic.echo` dummy: may echo `{ "last_step": "copy_input" }`.

### Monotonicity

| Rule | Enforcement |
|------|-------------|
| `sequence` strictly increases per job | Reject with `400` if `sequence <= last_sequence` |
| `progress_percent` non-decreasing | Reject with `400` if regression > 5% (implementation tolerance) |

Phase-0: document rules; enforcement is future.

## Response

### 200 OK — CheckpointAck

```json
{
  "accepted_at": "2026-06-05T12:01:00.456Z",
  "job_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "sequence": 2,
  "acknowledged": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accepted_at` | `date-time` | Server receipt time |
| `job_id` | `uuid` | Echo of path param |
| `sequence` | `integer` | Echo of accepted sequence |
| `acknowledged` | `boolean` | Always `true` on success |

### Error responses

| Code | Meaning |
|------|---------|
| `400` | Invalid payload or monotonicity violation |
| `401` | Unauthorized |
| `404` | Job not found |
| `409` | Job not in `claimed`/`running` or wrong `worker_id` |

## Relationship to status updates

Checkpoints are **orthogonal** to terminal status:

| Mechanism | Purpose |
|-----------|---------|
| `PUT .../checkpoint` | Incremental progress + optional resume `state` |
| `PATCH .../status` | Lifecycle transitions (`running`, `succeeded`, `failed`) |

Workers may include `progress_percent` in both checkpoint and status PATCH; checkpoint is authoritative for progress history (future UI).

Recommended pattern:

1. `PATCH` → `running` at start
2. `PUT` checkpoint(s) during work
3. `PATCH` → `succeeded` with `progress_percent: 100`

## Resume semantics (future — not Phase-0)

When a job fails after checkpoint `N`:

1. Operator or scheduler requeues job with same `id` or new id + `correlation_id` (TBD).
2. Worker reads latest checkpoint `state` from control plane.
3. Worker continues from `stage` — **not implemented in Phase-0**.

Phase-0 documents the hook only.

## Example: dummy echo with two checkpoints

**Checkpoint 1:**

```json
PUT /api/automation/v1/jobs/6ba7b810-9dad-11d1-80b4-00c04fd430c8/checkpoint

{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 1,
  "reported_at": "2026-06-05T12:00:10Z",
  "progress_percent": 50,
  "stage": "read_input",
  "message": "read echo input",
  "state": { "step": "read_input" }
}
```

**Checkpoint 2:**

```json
{
  "worker_id": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 2,
  "reported_at": "2026-06-05T12:00:11Z",
  "progress_percent": 100,
  "stage": "write_output",
  "message": "preparing result"
}
```

**Complete:**

```json
PATCH /api/automation/v1/jobs/6ba7b810-9dad-11d1-80b4-00c04fd430c8/status

{
  "status": "succeeded",
  "progress_percent": 100,
  "message": "echo completed"
}
```

## Phase-0 validation

Reviewers confirm:

- [ ] OpenAPI defines `putJobCheckpoint` under `/api/automation/v1`
- [ ] No checkpoint payload fields reference marketplace URLs or credentials
- [ ] `state` size limit documented (4 KB)
- [ ] Checkpoint contract consistent with [JOB_CLAIM_CONTRACT.md](./JOB_CLAIM_CONTRACT.md) status machine

## Related

- [DUMMY_WORKER_CONTRACT.md](./DUMMY_WORKER_CONTRACT.md)
- [JOB_CLAIM_CONTRACT.md](./JOB_CLAIM_CONTRACT.md)
- [E2E_SMOKE_PLAN_PHASE0.md](./E2E_SMOKE_PLAN_PHASE0.md)
- [openapi/automation-v1.yaml](../../openapi/automation-v1.yaml)
