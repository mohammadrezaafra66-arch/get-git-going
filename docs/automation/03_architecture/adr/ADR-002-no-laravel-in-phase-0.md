# ADR-002: Do Not Use Laravel in Phase 0

## Status

Accepted

## Date

2026-06-03

## Context

Laravel was considered earlier as a possible backend option for Afra Automation.

However, the project now has a final Phase 0 architecture decision: the existing `get-git-going` repository remains the Control Plane/Core, and Supabase/PostgreSQL remains the source of truth.

The current repository already contains the AfraKala Smart Assistant application foundation, including React/TanStack UI, Supabase integration, authentication, RBAC, migrations, self-host deployment structure, and operational documentation.

Adding Laravel during Phase 0 would create a second backend and would increase architectural duplication.

It would likely introduce:

1. A second application core.
2. A second API layer.
3. A second migration system.
4. A second admin or operator panel.
5. A second deployment surface.
6. Possible conflicts with Supabase/PostgreSQL source-of-truth rules.
7. Extra security and access-control paths.
8. Extra maintenance burden for the team.

Phase 0 is not the phase for adding a new backend framework.

## Decision

Laravel is not part of Afra Automation Phase 0.

Phase 0 must not add:

1. Laravel application.
2. Laravel API.
3. Laravel migrations.
4. Laravel admin panel.
5. Laravel worker orchestration.
6. Laravel queue layer.
7. Laravel authentication layer.
8. Laravel database access layer.
9. Laravel deployment stack.
10. Laravel-based automation control plane.

The existing `get-git-going` repository remains the Control Plane/Core.

React/TanStack/Lovable remains the UI/operator layer.

Supabase/PostgreSQL remains the source of truth.

Python Worker Runtime remains the separate future execution layer for worker processes.

Any future proposal to introduce Laravel requires a new ADR.

## Consequences

### Positive consequences

1. Phase 0 remains focused on documentation, structure, contracts, schemas, and dummy-worker preparation.
2. The project avoids a second backend during the foundation phase.
3. Existing auth, RBAC, self-host, migration, and deployment rules remain authoritative.
4. Supabase/PostgreSQL remains the single source of truth.
5. The team avoids duplicate API and admin-panel decisions.
6. Future automation contracts can be designed around the current repository instead of around a new backend.

### Negative consequences

1. Some backend ideas that may be easier in Laravel must wait or be implemented through the existing architecture.
2. The team must design automation contracts carefully inside the current repository boundaries.
3. Developers familiar with Laravel must not assume Laravel is available for Phase 0 work.

These tradeoffs are acceptable because Phase 0 is a foundation and governance phase, not a backend rewrite phase.

## Alternatives considered

### Alternative 1: Add Laravel as the automation backend

Rejected.

This would create a parallel backend and likely duplicate the existing Control Plane/Core.

### Alternative 2: Add Laravel only for APIs

Rejected.

A Laravel API would still create a parallel API layer and a second backend surface.

### Alternative 3: Add Laravel only for migrations

Rejected.

The repository already uses Supabase/PostgreSQL migrations. Laravel migrations would create a second migration system.

### Alternative 4: Add Laravel only for worker orchestration

Rejected.

Worker orchestration should be designed through approved contracts and a separate Python Worker Runtime, not through a new Laravel service in Phase 0.

### Alternative 5: Reconsider Laravel after Phase 0

Allowed only through a new ADR.

A future proposal must explain why the existing core, Supabase/PostgreSQL, and Python Worker Runtime are insufficient, and must address duplication, security, deployment, and migration risks.

## Rules / enforcement

1. Do not add a Laravel app in Phase 0.
2. Do not add Laravel routes, controllers, middleware, migrations, queues, or jobs in Phase 0.
3. Do not add a Laravel admin panel in Phase 0.
4. Do not add Laravel worker orchestration in Phase 0.
5. Do not add Laravel as a dependency in Phase 0.
6. Do not document Laravel as an approved Phase 0 implementation path.
7. Reject any Phase 0 PR that introduces Laravel runtime code.
8. Reject any Phase 0 PR that introduces Laravel migrations.
9. Reject any Phase 0 PR that introduces a Laravel API layer.
10. Any future Laravel proposal must have a new accepted ADR before implementation.

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
13. `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
14. `docs/automation/03_architecture/adr/ADR-003-supabase-as-source-of-truth.md`
15. `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
16. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
