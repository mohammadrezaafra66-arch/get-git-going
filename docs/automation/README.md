# Afra Automation Documentation

This directory contains the Phase 0 documentation structure for Afra Automation inside the existing `get-git-going` repository.

Phase 0 is documentation, contracts, governance, and dummy-worker preparation only. It does not include real bots, real scraping, real sending, OCR/STT, AI pipelines, browser automation, proxy/account automation, production integrations, database migrations, or runtime automation.

## 1. Purpose

The purpose of `docs/automation/` is to provide one controlled documentation space for the future Afra Automation / multi-robot platform while preserving the existing AfraKala smart assistant as the Control Plane and Core.

This documentation must help the team understand:

1. What Phase 0 is allowed to do.
2. What Phase 0 must not do.
3. How the existing repository remains the Control Plane/Core.
4. How Supabase/PostgreSQL remains the source of truth.
5. How the future Python Worker Runtime stays separate from the UI.
6. How contracts, schemas, runbooks, and task packets must be prepared before real modules are built.

## 2. Phase boundary

### Phase 0

Phase 0 is limited to:

1. Documentation.
2. Repository structure.
3. Architecture decisions.
4. API and schema contracts.
5. Worker runtime planning.
6. Dummy-worker-only preparation.
7. Runbooks, incident templates, testing strategy, RACI, DoR, DoD, and task-packet process.
8. Safe end-to-end dummy-flow planning.

Phase 0 must not include real automation.

### Phase 1 and later

Phase 1 and later may only begin after Phase 0 acceptance criteria are met.

Any real automation module must require:

1. A new or approved ADR.
2. A module-specific specification.
3. Approved contracts.
4. Approved database/RLS/RBAC design if data changes are required.
5. Approved runbook and test cases.
6. Explicit owner approval.

### Future

Anything involving real external automation is `FUTURE` unless explicitly moved into an approved later phase.

Examples:

1. Real Divar crawler.
2. Real WhatsApp sender.
3. Real Instagram extractor.
4. Real Torob scraper.
5. Real Google Maps scraper.
6. Real OCR/STT pipeline.
7. Real AI/LLM pipeline.
8. Browser automation.
9. Proxy/account automation.
10. Production scraping or sending.

## 3. Folder map

```text
docs/automation/
  README.md
  00_master/
  01_product_scope/
  02_phases/
    phase_0/
    phase_1/
  03_architecture/
    adr/
    c4/
    deps/
  04_contracts/
    apis/
    events/
    jobs/
    plugin_sdk/
  05_security_ops/
    incidents/
    resilience/
    runbooks/
    security/
    testing/
  06_team_delivery/
    pr_review/
    raci/
    ready_done/
    task_packets/
  07_modules/
    dummy_worker/
    google_maps/
    torob/
    divar_future/
```

## 4. Folder responsibilities

### `00_master/`

Master execution documents live here.

Use this folder to understand the whole documentation package, the order of reading, and how Phase 0 work should be coordinated.

### `01_product_scope/`

Scope, phase labels, and product boundaries live here.

Use this folder to decide whether a task is `BASELINE`, `PHASE-0`, `PHASE-1`, or `FUTURE`.

### `02_phases/`

Phase-specific documents live here.

Use `phase_0/` for Phase 0 requirements and acceptance criteria. Use `phase_1/` only for future planning, not implementation during Phase 0.

### `03_architecture/`

Architecture and decision records live here.

Use `adr/` for Architecture Decision Records. Use `c4/` and `deps/` for diagrams, boundaries, and dependency maps when they are approved.

### `04_contracts/`

API, event, job lifecycle, worker runtime, and plugin/driver contracts live here.

Use this folder before implementing any worker or module behavior.

### `05_security_ops/`

Security, reliability, operations, testing, incident, release, and migration/rollback documentation live here.

Use this folder before any change that touches operations, environment behavior, access control, secrets, migration planning, or release readiness.

### `06_team_delivery/`

Team execution documents live here.

Use this folder for RACI, Definition of Ready, Definition of Done, PR review process, and task packets.

### `07_modules/`

Module specifications live here.

In Phase 0, only `dummy_worker/` is allowed to support executable planning. Google Maps, Torob, and Divar Future documents are planning references only and must not be treated as implementation permission.

## 5. How operators should use these docs

Operators should start with:

1. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`
2. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
3. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
4. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
5. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
6. `docs/automation/06_team_delivery/TASK_PACKET_SYSTEM.md`
7. `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
8. `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`

Operators should not request real bot behavior in Phase 0. If a task mentions real scraping, sending, AI, OCR/STT, browser automation, proxy/account automation, or production integration, it must be treated as `FUTURE` unless a later approved ADR says otherwise.

## 6. How developers should use these docs

Developers should always read these repository-level files first:

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

Then read the relevant automation documents for the task.

For contract work, read:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `openapi/automation-v1.yaml`
4. `schemas/automation/`

For worker work, read:

1. `afrakala-worker/README.md`
2. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
3. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
4. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`

For security or operations work, read:

1. `docs/automation/05_security_ops/SECURITY_BASELINE.md`
2. `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`
3. `docs/automation/05_security_ops/RUNBOOK.md`
4. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
5. `docs/automation/05_security_ops/TESTING_STRATEGY.md`

## 7. Documentation rules

Automation documentation must:

1. Stay aligned with the existing repository architecture.
2. Keep Phase 0 boundaries explicit.
3. Avoid pretending future modules are already implemented.
4. Avoid duplicate or parallel architecture.
5. Reference canonical files instead of copying them.
6. Stay free of secrets and private operational data.
7. Use clear, operational language.
8. Include owner, phase, and acceptance boundaries where relevant.

## 8. Contract rules

Contracts must be reviewed before implementation.

Canonical contract areas:

1. `openapi/automation-v1.yaml`
2. `schemas/automation/job.schema.json`
3. `schemas/automation/worker-heartbeat.schema.json`
4. `schemas/automation/artifact.schema.json`
5. `schemas/automation/plugin-manifest.schema.json`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

## 9. What this directory does not authorize

This directory does not authorize:

1. Real automation implementation.
2. Production worker deployment.
3. Real external service calls.
4. Browser automation.
5. Scraping.
6. Sending messages.
7. AI/LLM execution.
8. OCR/STT execution.
9. Proxy/account automation.
10. Database migration.
11. New runtime services.
12. Parallel core or admin panel.

## 10. Final rule

If a task is not clearly safe, documentation-only, contract-only, or dummy-worker-only for Phase 0, stop and require an approved ADR before implementation.
