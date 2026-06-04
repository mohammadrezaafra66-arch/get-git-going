# ADR-003: Use Supabase/PostgreSQL as the Source of Truth

## Status

Accepted

## Date

2026-06-03

## Context

The existing `get-git-going` repository already uses Supabase/PostgreSQL as its application data foundation.

The repository includes Supabase integration, PostgreSQL migrations, RLS expectations, RBAC expectations, audit requirements, self-host deployment structure, and migration safety documentation.

Afra Automation must be added to this existing foundation without creating database fragmentation.

Automation will eventually need durable records for jobs, workers, worker heartbeats, logs, checkpoints, artifacts, plugin metadata, commands, and events. If these records are split across Google Sheets, Excel, local JSON files, SQLite files, worker folders, or separate databases as independent sources of truth, the platform will become inconsistent and difficult to operate.

The project needs one authoritative source for automation state.

## Decision

Supabase/PostgreSQL is the source of truth for Afra Automation.

Future automation data must be designed around the same source of truth used by the existing `get-git-going` application.

Automation-related data areas that must be designed for Supabase/PostgreSQL include:

1. Jobs.
2. Workers.
3. Worker heartbeats.
4. Job logs.
5. Checkpoints.
6. Artifacts.
7. Plugin/driver metadata.
8. Commands.
9. Job events.
10. Runtime settings.

Google Sheets, Excel, local JSON, SQLite, worker files, and exported reports must not become the platform source of truth.

Local files may be used only as temporary cache, local checkpoint support, debug output, generated artifact output, or operator export when that use is explicitly documented.

Any automation table requires approved design, RLS/RBAC plan, audit plan, rollback plan, and acceptance criteria before migration.

## Consequences

### Positive consequences

1. The project keeps one authoritative data foundation.
2. Automation state can be queried consistently.
3. Operators can see jobs, workers, logs, checkpoints, and artifacts from the same control plane.
4. RLS/RBAC can be designed centrally.
5. Audit expectations remain consistent with the existing repository.
6. Backup and restore remain compatible with the existing self-host strategy.
7. The team avoids split-brain state across files, spreadsheets, and local worker machines.
8. Future reporting can rely on one database instead of many disconnected sources.

### Negative consequences

1. Automation table design must be reviewed before implementation.
2. Quick local hacks using SQLite, JSON, or spreadsheets cannot become permanent platform state.
3. Worker implementation must follow approved data contracts instead of writing arbitrary local state.
4. Migrations require proper safety review and cannot be rushed.

These constraints are intentional. They prevent database fragmentation and operational drift.

## Alternatives considered

### Alternative 1: Use Google Sheets as the source of truth

Rejected.

Google Sheets may be useful for exports, operator review, or temporary manual workflows, but it is not a reliable source of truth for job state, worker state, checkpointing, heartbeats, audit, RLS/RBAC, or recovery.

### Alternative 2: Use Excel files as the source of truth

Rejected.

Excel files may be useful as exports or reports. They must not control platform state.

### Alternative 3: Use local JSON files as the source of truth

Rejected.

Local JSON files may be useful for temporary cache or debug output. They are not durable, centralized, queryable, or access-controlled enough to serve as platform source of truth.

### Alternative 4: Use SQLite on each worker as the source of truth

Rejected.

SQLite may be useful for temporary local cache, local WAL-like buffering, or offline-safe worker state when explicitly documented. It must not become the authoritative automation database.

### Alternative 5: Create a separate automation database

Rejected.

A separate automation database would fragment state, duplicate access control, complicate backup/restore, and create source-of-truth conflicts.

## Rules / enforcement

1. Supabase/PostgreSQL is the source of truth for automation platform state.
2. Do not create a separate automation database without a new accepted ADR.
3. Do not use Google Sheets as source of truth for automation jobs or worker state.
4. Do not use Excel as source of truth for automation jobs or worker state.
5. Do not use local JSON files as source of truth for automation jobs or worker state.
6. Do not use worker-local SQLite as platform source of truth.
7. Local files may be temporary cache, local output, debug artifacts, or export only when documented.
8. Any automation table requires design before migration.
9. Any automation table requires RLS/RBAC design before migration.
10. Any automation table requires audit impact review before migration.
11. Any automation table requires rollback plan before migration.
12. Any automation table requires acceptance criteria before migration.
13. No automation migration may be merged without following `docs/MIGRATION_SAFETY_POLICY.md`.
14. Pull requests that introduce source-of-truth fragmentation must be rejected.

## Related documents

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/MIGRATION_SAFETY_POLICY.md`
6. `docs/AUTOMATION_GAP_ANALYSIS.md`
7. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
8. `docs/automation/README.md`
9. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`
10. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
11. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
12. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
13. `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
14. `docs/automation/03_architecture/adr/ADR-002-no-laravel-in-phase-0.md`
15. `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
16. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
17. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
18. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
19. `openapi/automation-v1.yaml`
20. `schemas/automation/`
