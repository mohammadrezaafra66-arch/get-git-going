# Hybrid Worker Fleet Architecture

## Purpose

This document defines the Phase 0 architecture for the future Afra Automation Worker Fleet.

The worker fleet is separate from the existing UI/Core. The existing `get-git-going` app remains the Control Plane/Core. Workers are future execution units that report status, logs, checkpoints, and artifacts through approved contracts.

## Scope

This document covers:

- Future Python Worker Runtime boundaries.
- Worker identity and health concepts.
- Plugin/driver execution boundary.
- Local/LAN-aware operation.
- Checkpoint and resume principles.
- Phase 0 dummy-flow planning.

## Non-Goals

This document does not build:

- A production worker runtime.
- Real platform automation.
- Real extraction or messaging modules.
- Browser automation.
- OCR/STT execution.
- AI execution.
- Queue infrastructure.
- Database migrations.
- New deploy stack.

## Decisions

1. Python Worker Runtime is separate from React/TanStack/Lovable UI.
2. Plugins and drivers run in workers, not in UI code.
3. Worker state must be observable by the existing Control Plane.
4. Worker design must support local and LAN-first operation.
5. Worker design must support interrupted internet and power conditions.
6. Phase 0 allows only skeleton and dummy-flow planning, not live execution.

## Requirements

### Worker identity

Each future worker must identify itself with:

- `worker_id`
- `worker_type`
- `runtime_name`
- `runtime_version`
- `host_label`
- `environment`
- `started_at`

### Worker health

Each future worker must report:

- `status`
- `last_seen_at`
- `active_job_count`
- `capacity_hint`
- `degraded_reason`
- `local_queue_depth` if applicable

### Worker job handling

Future workers must treat jobs as resumable units. A job must not depend on in-memory state only.

Each job run must support:

- start time
- status transitions
- safe failure state
- retry recommendation
- checkpoint reference
- artifact reference

### Plugin/driver boundary

A plugin/driver must not call UI internals. It must only use approved worker interfaces.

A plugin/driver must declare:

- name
- version
- phase label
- capabilities
- required contracts
- forbidden production behavior in Phase 0

### Local/LAN readiness

The architecture must work with limited connectivity. Future worker design must account for:

- local service restart
- interrupted internet
- delayed reporting
- resumable checkpoints
- safe local buffering
- manual fallback

### Observability

Each worker must produce safe structured events for:

- heartbeat
- log
- checkpoint
- artifact
- run status
- degraded state

## Forbidden Work

Phase 0 must not add:

- Live worker execution against external services.
- Production queue consumers.
- Browser sessions.
- External messaging sessions.
- OCR/STT/AI runtime calls.
- Account/proxy management runtime.
- Secrets or real credentials.
- Migrations.
- New deployment system.

## Phase 0 Acceptance Criteria

This document is accepted when:

1. Worker runtime is clearly separate from UI/Core.
2. Plugin/driver boundary is documented.
3. Heartbeat, log, checkpoint, artifact, and run concepts are defined.
4. Local/LAN and interruption resilience are addressed.
5. Phase 0 remains dummy-only.
6. No runtime automation is introduced.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Worker architecture reviewer: assigned Phase 0 technical reviewer.
- Security reviewer: Mohammadreza Afra for data and integration boundaries.
- Plugin reviewer: assigned per module when a module moves out of `FUTURE`.

## Related Files

- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/AUTOMATION_COMMAND_CENTER_ARCHITECTURE.md`
- `docs/automation/04_contracts/INTEGRATION_CENTER_CONTRACT.md`
- `docs/automation/07_modules/PLUGIN_MANIFEST_STANDARD.md`
- `schemas/automation/integration.schema.json`
- `afrakala-worker/README.md`
