# AfraKala Worker Runtime

**Phase:** PHASE-1 foundation + PHASE-2 controlled read-only path  
**Status:** Controlled worker foundation with mock contracts, guarded read-only evidence helpers, deterministic read-only pipeline, runner route, and no production scheduler.

This package contains the Python Worker Runtime skeleton for AfraKala Automation.

The runtime is still intentionally controlled. It is not a general crawler, not a scheduler, and not a production automation daemon. Phase 2 adds a limited read-only path for evidence-oriented outputs while preserving strict guardrails.

## Purpose

The goal is to create a controlled worker foundation before any broad automation is enabled.

The worker currently provides:

- environment-based config loading,
- structured logging,
- data client wrapper shape,
- job claim skeleton,
- heartbeat skeleton,
- checkpoint save/load skeleton,
- job runner skeleton,
- graceful shutdown hooks,
- mock/test mode,
- mock-only driver contract,
- mock driver registry,
- mock output persistence,
- controlled output insert contract,
- controlled bridge contract,
- live bridge contract guard,
- guarded insert contract,
- controlled worker boundary,
- controlled worker next-step boundary,
- Phase 2 Torob limited read-only driver,
- retry/backoff policy for guarded aborts,
- abort evidence builder,
- read-only output row builder,
- worker-side read-only output adapter,
- deterministic read-only worker pipeline,
- JobRunner route for deterministic `TOROB_LIMITED_READONLY` jobs.

## Out of scope

The following remain forbidden unless a later packet explicitly authorizes them:

```text
Production scheduler
Bulk crawl
Browser automation
Login/session/cookie use
CAPTCHA solving or bypass
Stealth or anti-bot evasion
Automatic live retry
Automatic product discovery
Business writeback
Product price mutation
Customer mutation
Supplier mutation
Sales-list mutation
Messaging or status posting
Parallel database
Parallel admin panel
Hardcoded secret
```

## Local setup

```powershell
cd automation/worker-runtime
python -m pip install -e .[dev]
python -m pytest -q
```

If `pytest` is not available in your environment, install it through the dev extra.

## Run in mock mode

```powershell
cd automation/worker-runtime
$env:WORKER_MODE="mock"
$env:WORKER_ID="local-worker-001"
python -m main
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

The legacy controlled contract only accepts:

```text
driver_name = mock
job_type = MOCK_DRIVER_RUN
source_kind = mock
status = COMPLETED | FAILED | SKIPPED
phase_label = PHASE-1
```

Non-mock driver names, non-mock source kinds, invalid statuses, non-object output payloads, and non-array errors are rejected by tests.

## Controlled bridge contracts

The bridge and guard contracts store validated mock rows in mock-only boundaries:

```text
inserted_driver_outputs
live_inserted_driver_outputs
credentialed_driver_outputs
worker_integrated_outputs
worker_next_step_outputs
worker_follow_up_outputs
```

These still do not implement a production database write path or production scheduling.

## Phase 2 read-only path

Phase 2 adds a controlled read-only path for `TOROB_LIMITED_READONLY` evidence outputs.

The deterministic path must have:

```text
job_type = TOROB_LIMITED_READONLY
driver_name = torob_limited_readonly
source_kind = external_read_only
phase_label = PHASE-2
live_execution = false
network_calls = 0
```

The worker-side read-only path is split into small testable parts:

```text
torob_limited_readonly driver
readonly_worker_pipeline
readonly output adapter
read-only output row builder
worker-side persistence boundary
```

The deterministic pipeline is exposed through `JobRunner` for non-live `TOROB_LIMITED_READONLY` jobs only.

If a job includes live flags, the deterministic runner path rejects it.

## Phase 2 live-readonly evidence status

Controlled live-readonly evidence has been treated as an operator-approved evidence activity only, not as a scheduler or crawler.

Current posture:

```text
rapid live retries = paused
retry_allowed_now = false after repeated HTTP abort evidence
future live attempt = cooldown + review + fresh explicit approval
```

No future live attempt is authorized by this README.

## Verification commands

Targeted tests:

```powershell
cd automation/worker-runtime
python -m pytest -q tests/test_torob_readonly_output_persistence.py
python -m pytest -q tests/test_torob_worker_output_path.py
python -m pytest -q tests/test_readonly_worker_pipeline.py
python -m pytest -q tests/test_job_runner_readonly_route.py
```

Full worker test suite:

```powershell
cd automation/worker-runtime
python -m pytest -q
```

## Environment variables

See `.env.example`.

Important rule: never commit real secrets.

## Notes

This runtime is not production-ready yet. It is a controlled foundation with mock contracts and Phase 2 read-only evidence paths. It must not be treated as authorization for production scheduling, bulk crawling, browser automation, login/session/cookie use, or business writeback.
