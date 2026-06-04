# ADR-004: Keep Python Worker Runtime Separate from UI/Core

## Status

Accepted

## Date

2026-06-03

## Context

Afra Automation needs background execution capability for future jobs, workers, heartbeats, checkpoints, logs, artifacts, retries, and plugin/driver execution.

This kind of work is different from the operator UI.

The existing `get-git-going` repository provides the Control Plane/Core and the React/TanStack/Lovable UI operator layer. That UI is appropriate for displaying status, forms, lists, dashboards, logs, and operator controls. It is not appropriate for long-running worker execution, scraping, message sending, browser automation, retry loops, checkpoint recovery, or future driver execution.

If worker logic is placed inside the UI, the project risks:

1. Long-running work blocking or destabilizing the operator interface.
2. Browser/client exposure of sensitive logic.
3. Accidental service-role or credential exposure.
4. Harder retry and checkpoint behavior.
5. Poor recovery after internet or power interruption.
6. Mixing UI concerns with execution concerns.
7. Harder testing and deployment.
8. Hidden automation paths that bypass the control plane.

Phase 0 must define a clean boundary between the UI/Core and the future Worker Runtime.

## Decision

Python Worker Runtime must be a separate execution layer outside the React/TanStack/Lovable UI.

The architecture is:

1. `get-git-going` remains the Control Plane/Core.
2. React/TanStack/Lovable remains the UI/operator layer.
3. Supabase/PostgreSQL remains the source of truth.
4. Python Worker Runtime is the future execution layer.
5. Plugin/driver logic must live outside the UI.
6. Phase 0 includes only worker skeleton, worker documentation, contracts, schemas, and Dummy Worker specification.
7. Phase 0 does not include real drivers.

Future Worker Runtime responsibilities may include:

1. Claiming approved jobs.
2. Sending heartbeat.
3. Updating status.
4. Updating progress.
5. Writing logs.
6. Saving checkpoints.
7. Registering artifacts.
8. Handling retry and backoff.
9. Detecting safe stop conditions.
10. Running approved future plugins/drivers.

In Phase 0, the Worker Runtime is dummy-only and must not call real external platforms.

## Consequences

### Positive consequences

1. UI remains focused on operator experience.
2. Worker execution can be designed for retries, checkpointing, and recovery.
3. Long-running jobs do not run inside the UI.
4. Plugin/driver code is isolated from React components.
5. Future drivers can be tested and reviewed separately.
6. Secrets and execution credentials are kept out of frontend code.
7. The architecture is easier to reason about and operate.
8. Failure in a worker does not automatically break the operator UI.

### Negative consequences

1. The project needs explicit contracts between Control Plane/Core and Worker Runtime.
2. Worker deployment and operations must be documented separately.
3. Developers cannot quickly hide execution logic inside UI components.
4. Dummy worker readiness must be proven before real modules can be implemented.

These constraints are acceptable because automation execution requires reliability and isolation that UI code should not own.

## Alternatives considered

### Alternative 1: Run worker logic inside React/Lovable UI

Rejected.

The UI is not a safe place for long-running execution, retries, checkpoints, browser automation, or future drivers.

### Alternative 2: Put plugin/driver logic directly in UI components

Rejected.

This would mix presentation and execution, make code harder to test, and increase the chance of accidental credential exposure.

### Alternative 3: Put all automation execution in the existing server routes immediately

Rejected for Phase 0.

Server routes may later expose approved contracts, but Phase 0 is not an implementation phase. Long-running execution must be designed as a separate worker runtime.

### Alternative 4: Use independent scripts with no worker runtime contract

Rejected.

Independent scripts would create fragile automation, weak observability, weak checkpointing, and no consistent control plane integration.

### Alternative 5: Prepare a separate Python Worker Runtime

Accepted.

Python is appropriate for future worker execution, automation orchestration, scraping research, data processing, and integration adapters, but Phase 0 only prepares the skeleton and dummy-worker boundaries.

## Rules / enforcement

1. Do not place worker runtime logic inside React components.
2. Do not place plugin/driver logic inside Lovable-generated UI.
3. Do not place real scraping or sending logic inside UI routes.
4. Do not expose worker secrets to frontend/client code.
5. Do not distribute service-role credentials through UI code.
6. Phase 0 worker work must remain dummy-only.
7. Phase 0 must not implement real drivers.
8. Future drivers must live outside the UI and follow approved contracts.
9. Worker Runtime must communicate through approved API/schema contracts.
10. Pull requests that add real worker behavior to UI must be rejected.
11. Pull requests that add real driver behavior in Phase 0 must be rejected.
12. Any exception requires a new accepted ADR.

## Related documents

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/AUTOMATION_GAP_ANALYSIS.md`
6. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
7. `docs/automation/README.md`
8. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`
9. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
10. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
11. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
12. `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
13. `docs/automation/03_architecture/adr/ADR-002-no-laravel-in-phase-0.md`
14. `docs/automation/03_architecture/adr/ADR-003-supabase-as-source-of-truth.md`
15. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
16. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
17. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
18. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
19. `afrakala-worker/README.md`
20. `openapi/automation-v1.yaml`
21. `schemas/automation/`
