# Automation Command Center Architecture

## Purpose

This document defines the Phase 0 architecture for the Afra Automation Command Center.

The Command Center is not a new backend, not a new admin panel, and not a parallel Core. It is the automation-facing responsibility of the existing `get-git-going` Control Plane/Core.

## Scope

The Command Center architecture covers:

- Operator visibility for future worker fleet status.
- Job, run, heartbeat, log, checkpoint, and artifact concepts.
- Integration boundary between the existing app and the future Python Worker Runtime.
- Safe Phase 0 documentation and contract preparation.
- Dummy-flow validation planning.

## Non-Goals

This document does not authorize:

- Runtime worker orchestration in Phase 0.
- A new API service.
- A Laravel service.
- A parallel dashboard.
- Real bot controls.
- Real extraction or messaging execution.
- Changes to production deploy files.
- Database migrations.

## Decisions

1. `get-git-going` remains the Command Center host.
2. Supabase/PostgreSQL remains the source of truth for future automation state.
3. React/TanStack/Lovable remains UI only.
4. Any future automation UI must use approved existing app boundaries or approved contracts.
5. Worker Runtime will be separate and will communicate through documented contracts.
6. Phase 0 may describe command states but must not implement live command dispatch.

## Requirements

The future Command Center must be designed around these concepts:

### Fleet registry

Each future worker must have a stable identity:

- `worker_id`
- `worker_type`
- `environment`
- `host_label`
- `version`
- `status`
- `last_heartbeat_at`

### Job registry

Each future job must have:

- `job_id`
- `job_type`
- `phase_label`
- `status`
- `priority`
- `requested_by`
- `created_at`
- `updated_at`

### Run tracking

Each job execution attempt must be tracked separately from the job definition:

- `run_id`
- `job_id`
- `worker_id`
- `started_at`
- `finished_at`
- `exit_status`
- `error_summary`

### Heartbeat

Workers must report lightweight health data. Heartbeat data is for status visibility and incident response.

### Logs

Workers must emit structured logs. Logs must use safe summaries and must not include real credentials or private operational content.

### Checkpoints

Long-running work must checkpoint progress. After a restart, local outage, or interrupted connection, work must continue from the last safe point instead of starting from zero.

### Artifacts

Reports, exports, or debug bundles must be recorded as artifacts with safe metadata and storage references.

### Commands

The Command Center may later support command names such as:

- `start`
- `pause`
- `resume`
- `stop`
- `retry`
- `archive`

In Phase 0 these are design terms only.

## Forbidden Work

Do not implement the following in Phase 0:

- Live command execution.
- Live worker dispatch.
- Queue processing.
- Live external integrations.
- Real scraper, sender, OCR, STT, or AI modules.
- Runtime UI controls that trigger real automation.
- A second backend API.
- Database migrations.
- Deploy changes.
- Core app runtime changes.

## Phase 0 Acceptance Criteria

This architecture is acceptable for Phase 0 when:

1. The Command Center is clearly described as part of existing `get-git-going`.
2. No parallel Core is introduced.
3. Worker, job, run, heartbeat, log, checkpoint, and artifact concepts are documented.
4. Integration boundaries are documented.
5. No live automation is implemented.
6. Future work requires ADR and approved contracts before implementation.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Architecture owner: Phase 0 architecture reviewer.
- Security owner: Mohammadreza Afra for sensitive operational boundaries.
- UI owner: only for future operator screens approved after Phase 0.

## Related Files

- `README.md`
- `docs/REPO_STATE_INVENTORY.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- `docs/automation/README.md`
- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/04_contracts/INTEGRATION_CENTER_CONTRACT.md`
- `schemas/automation/integration.schema.json`
