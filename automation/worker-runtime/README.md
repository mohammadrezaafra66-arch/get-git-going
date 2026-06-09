# AfraKala Worker Runtime — Minimal Skeleton

**Phase:** PHASE-1-IMPLEMENTATION  
**Packets:** TPC-I-001 + TPC-I-002 + TPC-I-004 + TPC-I-005 + TPC-I-007-IMPLEMENTATION + TPC-I-009-IMPLEMENTATION + TPC-I-011-IMPLEMENTATION  
**Status:** Minimal skeleton with mock-only driver contract, mock output persistence, controlled output insert contract, controlled bridge contract, live bridge contract guard, and guarded insert contract

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
- controlled bridge contract
- live bridge contract guard
- guarded insert contract

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
2. python -m pip install -e .[dev]
3. python -m pytest -q
```

If `pytest` is not available in your environment, install it through the dev extra.

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

## Controlled bridge contract

TPC-I-007-IMPLEMENTATION adds a controlled bridge contract.

The bridge accepts only rows already shaped and validated by:

```text
build_controlled_driver_output_row(...)
```

The mock bridge stores accepted rows in `inserted_driver_outputs` and rejects malformed or non-mock rows.

## Live bridge contract guard

TPC-I-009-IMPLEMENTATION adds a live bridge guard in mock mode.

The live bridge guard accepts only validated mock rows and stores them in `live_inserted_driver_outputs` with:

```text
bridge_mode = mock_verified
```

## Guarded insert contract

TPC-I-011-IMPLEMENTATION adds a guarded insert contract in mock mode.

The guard accepts only validated mock rows and stores them in `credentialed_driver_outputs` with:

```text
credential_boundary = worker_runtime_mock_only
```

This still does not implement real source execution or a credentialed database path.

## Environment variables

See `.env.example`.

Important rule: never commit real secrets.

## Notes

This runtime is not production-ready yet. It is only a minimal contract skeleton with controlled mock output validation, bridge validation, live bridge guarding, and guarded insert validation so the next packet can add the next approved step safely.
