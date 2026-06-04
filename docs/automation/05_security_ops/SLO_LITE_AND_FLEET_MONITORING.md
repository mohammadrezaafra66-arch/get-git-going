# SLO Lite and Fleet Monitoring

## Purpose

This document defines simple reliability and monitoring rules for the future Afra Automation worker fleet.

The goal is practical visibility: the team must know whether a future worker is healthy, delayed, paused, finished, or needs human review.

## Scope

This document covers Phase 0 planning for:

- worker health states
- job states
- heartbeat expectations
- safe log summaries
- checkpoint expectations
- artifact visibility
- lightweight service targets

## Non-Goals

Phase 0 does not include:

- production monitoring implementation
- live worker telemetry
- live dashboards
- external notification setup
- real module monitoring
- database migrations
- deployment changes

## Decisions

1. Reliability is part of the product, not a future afterthought.
2. Every future worker must have visible health before real modules are approved.
3. Heartbeat, safe logs, checkpoints, artifacts, and run status are required concepts.
4. Phase 0 documents the model only.
5. Future monitoring must work even when internet access is weak or delayed.

## Requirements

### Worker health states

Allowed worker health states:

- `online`
- `idle`
- `busy`
- `degraded`
- `paused`
- `offline`
- `unknown`

### Job states

Allowed job states:

- `queued`
- `running`
- `paused`
- `succeeded`
- `failed`
- `retry_waiting`
- `needs_review`

### Incident states

Allowed incident states:

- `normal`
- `degraded`
- `interrupted`
- `manual_review_required`
- `recovered`

### Minimum future fields

Future status records should include:

- `worker_id`
- `job_id`
- `run_id`
- `status`
- `timestamp`
- `environment`
- `summary`
- `degraded_reason`

### SLO-lite targets

Future phases should track:

- heartbeat freshness
- job completion state
- checkpoint freshness
- retry count
- failure count
- artifact creation status
- manual review count

### Local resilience expectations

Future workers must be designed so interrupted work can be resumed from a safe checkpoint.

## Forbidden Work

Do not add in Phase 0:

- live monitoring runtime
- external notification dependency
- real operational data collection
- real automation events
- secrets in examples
- migrations
- deploy changes

## Phase 0 Acceptance Criteria

This document is accepted when:

1. Worker health states are defined.
2. Job states are defined.
3. Incident states are defined.
4. SLO-lite targets are defined.
5. Local resilience expectations are defined.
6. No live monitoring implementation is added.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Reliability reviewer: assigned Phase 0 reviewer.
- Security reviewer: Mohammadreza Afra for safe logging rules.
- Future operations owner: to be assigned before Phase 1 execution.

## Related Files

- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/AUTOMATION_COMMAND_CENTER_ARCHITECTURE.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/04_contracts/INTEGRATION_CENTER_CONTRACT.md`
- `docs/automation/06_team_delivery/PHASE_0_DAILY_BUILD_PLAN.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
