# Platform Fleet Principles

## Purpose

This document defines the operating principles for Afra Automation as a fleet-management platform, not a collection of independent robots.

The existing `get-git-going` repository remains the Control Plane/Core. Supabase/PostgreSQL remains the source of truth. React/TanStack/Lovable remains the operator UI. Python Worker Runtime, plugins, and drivers stay outside the UI boundary.

Phase 0 must use this document as the top-level rule set for automation planning.

## Scope

This document applies to:

- Control Plane/Core decisions related to automation.
- Worker fleet planning.
- Plugin/driver boundaries.
- Integration contracts.
- Phase labels and acceptance gates.
- Documentation and dummy-flow validation in Phase 0.

It does not authorize building production automation.

## Non-Goals

Phase 0 does not include:

- Real Divar automation.
- Real WhatsApp automation.
- Real Instagram automation.
- Real Torob automation.
- Real Google Maps automation.
- OCR/STT execution.
- AI/LLM execution.
- Playwright/Selenium/browser runtime.
- Proxy/account automation.
- Production scraping or sending.
- Laravel, parallel Core, parallel API, or parallel database.

## Decisions

1. `get-git-going` is the only Control Plane/Core for this project.
2. Supabase/PostgreSQL is the only source of truth.
3. React/TanStack/Lovable is UI only.
4. Python Worker Runtime is a separate runtime.
5. Plugins and drivers run under the Worker Runtime, not inside UI code.
6. Automation must be controlled through contracts, job states, logs, heartbeats, checkpoints, and artifacts.
7. Phase 0 is structure, documentation, contracts, schema, worker skeleton, and dummy end-to-end flow only.
8. Future modules must enter through ADR, module spec, contract review, security review, and acceptance criteria.

## Requirements

A future fleet platform must support these concepts before real modules are allowed:

1. Worker identity.
2. Worker heartbeat.
3. Job creation and status tracking.
4. Log/event reporting.
5. Checkpoint reporting.
6. Artifact reporting.
7. Start/stop/pause/resume command design.
8. Manual fallback for failed integrations.
9. No-secret integration configuration.
10. Explicit phase label for every module.
11. Clear owner and reviewer for every change.
12. Auditability for sensitive operational actions.

Every worker-facing contract must be documented before implementation. Every real integration must remain optional unless a later ADR explicitly approves otherwise.

## Forbidden Work

The following work is forbidden in Phase 0:

- Adding real automation behavior.
- Adding real external calls to production platforms.
- Adding browser automation.
- Adding scraping/sending pipelines.
- Adding AI/OCR/STT runtime.
- Adding migrations.
- Adding runtime dependencies to `package.json`.
- Changing `deploy/`.
- Changing `supabase/migrations/`.
- Changing core `src/` application code.
- Creating a Laravel service.
- Creating a second backend Core.
- Creating a second database.
- Committing real secrets or real `.env` files.

## Phase 0 Acceptance Criteria

Phase 0 satisfies this principle document only when:

1. Fleet principles are documented.
2. Phase boundaries are explicit.
3. Worker fleet architecture is documented.
4. Integration contract is documented.
5. Plugin manifest standard is documented.
6. Monitoring/SLO-lite expectations are documented.
7. Task map and daily build plan are documented.
8. JSON schema for integration metadata is valid and secret-safe.
9. No real automation has been added.
10. Existing `get-git-going` Control Plane/Core remains untouched except approved documentation and allowed schemas.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Architecture reviewer: designated technical lead for Phase 0.
- Security reviewer: Mohammadreza Afra for sensitive access and data boundaries.
- Implementation reviewers: assigned team members through Phase 0 task packets.

No future module can move from `FUTURE` to implementation without owner approval and architecture review.

## Related Files

- `README.md`
- `docs/REPO_STATE_INVENTORY.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- `docs/automation/README.md`
- `docs/automation/02_phases/phase_0/PHASE_0_FLEET_FOUNDATION_TASK_MAP.md`
- `docs/automation/03_architecture/AUTOMATION_COMMAND_CENTER_ARCHITECTURE.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/04_contracts/INTEGRATION_CENTER_CONTRACT.md`
- `schemas/automation/integration.schema.json`
