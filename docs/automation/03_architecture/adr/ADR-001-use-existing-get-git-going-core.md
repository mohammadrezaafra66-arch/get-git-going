# ADR-001: Use Existing `get-git-going` Repository as Control Plane/Core

## Status

Accepted

## Date

2026-06-03

## Context

AfraKala already has an existing Smart Assistant repository: `mohammadrezaafra66-arch/get-git-going`.

This repository is not an empty scaffold. It already contains the AfraKala operator application foundation, including React/TanStack UI, Supabase integration, authentication, RBAC, product and pricing modules, self-host deployment structure, migrations, repository inventory, acceptance criteria, migration safety policy, and operational documentation.

Afra Automation is intended to become a structured automation and multi-worker platform. However, creating a second core for automation would create duplication, confusion, and long-term risk.

A second core would likely introduce:

1. Duplicate authentication.
2. Duplicate RBAC.
3. Duplicate admin UI.
4. Duplicate database concepts.
5. Duplicate API contracts.
6. Conflicting source-of-truth decisions.
7. Higher security risk.
8. Harder backup and restore.
9. Harder self-host deployment.
10. More maintenance burden for a small team.

Phase 0 must avoid this duplication.

## Decision

The existing `get-git-going` repository is the official Control Plane/Core foundation for Afra Automation.

All Phase 0 automation documentation, contracts, schemas, worker skeleton, and future integration plans must align with this repository.

The architecture is defined as:

1. `get-git-going` is the Control Plane/Core.
2. React/TanStack/Lovable-generated UI is the UI/operator layer.
3. Supabase/PostgreSQL is the source of truth.
4. Python Worker Runtime is a separate execution layer outside the UI.
5. Plugin/driver logic belongs outside the UI and outside Phase 0 runtime work.
6. Phase 0 remains documentation, contracts, schemas, worker skeleton, and dummy-worker preparation only.

No parallel core, parallel panel, parallel API, or parallel database is allowed without a new accepted ADR.

## Consequences

### Positive consequences

1. The team reuses the existing AfraKala Smart Assistant foundation.
2. Authentication and RBAC remain centralized.
3. Supabase/PostgreSQL remains the single source of truth.
4. Documentation and contracts stay close to the existing repository.
5. The project avoids a second admin panel.
6. The project avoids a second database.
7. The project avoids a second API layer.
8. Self-host strategy remains consistent.
9. Migration safety remains under the existing repository rules.
10. Future automation modules can be integrated through explicit contracts instead of ad hoc scripts.

### Negative consequences

1. Automation work must respect the existing repository architecture.
2. Developers must read the repository inventory before adding new automation concepts.
3. Some automation ideas may need to wait until the existing control plane has the correct contracts.
4. The team cannot rapidly create isolated side systems without architectural approval.

These constraints are intentional. They reduce long-term duplication and operational risk.

## Alternatives considered

### Alternative 1: Build a separate Laravel core

Rejected.

Laravel may be useful in other contexts, but adding Laravel as a separate core in Phase 0 would create a second backend and duplicate the existing application foundation.

### Alternative 2: Build a separate automation admin panel

Rejected.

A second panel would fragment operator workflows and create competing control surfaces.

### Alternative 3: Build a separate automation database

Rejected.

A second database would create source-of-truth conflicts and make backup, restore, reporting, and access control harder.

### Alternative 4: Put worker runtime logic inside Lovable/React UI

Rejected.

The UI should remain the operator interface. Worker runtime, plugins, drivers, scraping, messaging, and long-running processes must stay outside the UI.

### Alternative 5: Keep automation as independent scripts

Rejected.

Independent scripts would recreate the original problem: fragile, hard-to-review automation with weak observability, weak checkpointing, and no central governance.

## Rules / enforcement

1. Any automation work must treat `get-git-going` as the Control Plane/Core.
2. No new core may be created without a new accepted ADR.
3. No parallel admin panel may be created without a new accepted ADR.
4. No parallel database may be created without a new accepted ADR.
5. No parallel API layer may be created without a new accepted ADR.
6. React/TanStack/Lovable must remain UI/operator layer only.
7. Supabase/PostgreSQL must remain the source of truth.
8. Python Worker Runtime must remain separate from UI code.
9. Phase 0 work must not implement real bots or production automation.
10. Pull requests must be rejected if they introduce architectural duplication without ADR approval.

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
10. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
11. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
12. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
13. `docs/automation/03_architecture/adr/ADR-002-no-laravel-in-phase-0.md`
14. `docs/automation/03_architecture/adr/ADR-003-supabase-as-source-of-truth.md`
15. `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
16. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
