# AfraKala Worker Runtime — Minimal Skeleton

**Phase:** PHASE-1-IMPLEMENTATION  
**Packets:** TPC-I-001 + TPC-I-002 + TPC-I-004 + TPC-I-005  
**Status:** Minimal skeleton with mock-only driver contract, mock output persistence, and controlled output insert contract

This package contains the minimal Python Worker Runtime skeleton for AfraKala Automation.

It is intentionally small. It does **not** implement any real source integration, browser automation, migration, API route, or UI work.

## Purpose

The goal is to create a controlled worker foundation before any real driver is built.

The worker skeleton provides:

- environment-based config loading
- structured logging
- data client wrapper shape
- job claim skeleton
- heartbeat skeleton
- checkpoint save/load skeleton
- job runner skeleton
- graceful shutdown hooks
- mock/test mode
- mock-only driver contract
- mock driver registry
- mock output persistence
- controlled output insert contract

## Out of scope

The following are forbidden in this packet:

```text
Real source integrations
Browser automation
External website calls
Redis
RabbitMQ
Supabase migration
UI implementation
New API route
Parallel Core
Parallel database
Parallel admin panel
Hardcoded secret
Production schedule
```

## Local setup

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

If `pytest` is not available in your environment, install it in your local development environment only.

## Run in mock mode

```powershell
1. cd automation/worker-runtime
2. $env:WORKER_MODE="mock"
3. $env:WORKER_ID="local-worker-001"
4. python -m main
```

No real secrets are required for mock mode.

## Mock driver contract

TPC-I-002 adds a mock-only driver contract.

The mock driver is deterministic and must not call any external website or browser automation.

Allowed mock job shape:

```text
{
  "id": "job-1",
  "type": "MOCK_DRIVER_RUN",
  "driver": "mock"
}
```

The mock driver returns:

```text
status
output
checkpoint
errors
```

## Mock output persistence

TPC-I-004 adds mock output persistence.

When a `MOCK_DRIVER_RUN` job completes, JobRunner stores the driver output in the mock client's `driver_outputs` list.

The stored output preserves:

```text
job_id
run_id
driver_name
job_type
status
output
checkpoint
errors
source_kind
```

Expected mock persistence event:

```text
DRIVER_OUTPUT_SAVED
```

## Controlled output insert contract

TPC-I-005 adds a controlled output insert contract.

The contract only accepts:

```text
driver_name = mock
job_type = MOCK_DRIVER_RUN
source_kind = mock
status = COMPLETED | FAILED | SKIPPED
phase_label = PHASE-1
```

Non-mock driver names, non-mock source kinds, invalid statuses, non-object output payloads, and non-array errors are rejected by tests.

This still does not implement real source execution.

## Environment variables

See `.env.example`.

Important rule: never commit real secrets.

## Notes

This runtime is not production-ready yet. It is only a minimal contract skeleton with controlled mock output insert validation so the next packet can add the next approved bridge safely.
