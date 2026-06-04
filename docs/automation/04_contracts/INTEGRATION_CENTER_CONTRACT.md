# Integration Center Contract

## Purpose

This document defines the Phase 0 human-readable contract for future automation integrations.

It describes metadata, status, safety, and reporting rules for integrations without implementing a production integration.

## Scope

This contract applies to future worker-facing integrations that may report to the existing Control Plane/Core.

It covers:

- Integration identity.
- Phase label.
- Capability declaration.
- Safe credential reference pattern.
- Health and status fields.
- Runtime reporting expectations.
- Forbidden Phase 0 behavior.

## Non-Goals

This document does not:

- Create a real integration.
- Create a runtime API.
- Create a database migration.
- Add external service calls.
- Define production credentials.
- Authorize real scraping, sending, AI, OCR, or browser automation.

## Decisions

1. Integrations must be declared before they are implemented.
2. Every integration must have a phase label.
3. Real secret values must never appear in contracts or repository files.
4. Use `secret_location_reference` for safe references to where credentials will live outside Git.
5. All production integrations are `FUTURE` unless later approved.
6. Integration metadata must be machine-validatable through JSON Schema.

## Requirements

An integration definition must include:

- `integration_id`
- `name`
- `description`
- `phase_label`
- `integration_type`
- `owner`
- `reviewer`
- `status`
- `capabilities`
- `data_classification`
- `secret_location_reference`
- `manual_fallback`
- `timeout_policy`
- `retry_policy`
- `audit_required`
- `disabled_by_default`

### Phase labels

Allowed phase labels:

- `BASELINE`
- `PHASE-0`
- `PHASE-1`
- `FUTURE`

### Integration types

Allowed integration types:

- `control_plane`
- `worker_runtime`
- `plugin_driver`
- `external_service`
- `storage`
- `reporting`
- `dummy`

### Status values

Allowed status values:

- `planned`
- `documented`
- `contract_ready`
- `blocked`
- `future_only`
- `deprecated`

### Safety defaults

Every integration must be disabled by default unless it is a documented Phase 0 dummy integration.

Every integration must have a manual fallback note.

Every integration must define what happens if it is unavailable.

## Forbidden Work

The following are forbidden in this contract and in Phase 0:

- Real credential values.
- Real session material.
- Real external automation endpoints.
- Production external calls.
- Live scraping or sending.
- Hidden service dependency.
- Parallel Core/API/database.
- Migration creation.
- Hardcoded production URLs for critical behavior.

## Phase 0 Acceptance Criteria

This contract is accepted when:

1. The human-readable contract exists.
2. The machine-readable schema exists.
3. The schema uses `additionalProperties: false`.
4. The schema contains no real secret fields.
5. The schema uses `secret_location_reference` only.
6. Future integrations remain labeled as `FUTURE`.
7. No runtime integration has been added.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Contract reviewer: assigned technical reviewer.
- Security reviewer: Mohammadreza Afra.
- Implementation owner: not assigned in Phase 0 for real integrations.

## Related Files

- `schemas/automation/integration.schema.json`
- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/AUTOMATION_COMMAND_CENTER_ARCHITECTURE.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/07_modules/PLUGIN_MANIFEST_STANDARD.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
