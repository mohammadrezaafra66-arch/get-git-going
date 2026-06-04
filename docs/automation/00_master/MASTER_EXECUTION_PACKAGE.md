# Master Execution Package — Afra Automation Phase 0

This document is the main entry point for Afra Automation Phase 0 inside the existing `get-git-going` repository.

It does not create runtime implementation. It organizes the documentation, decisions, contracts, security rules, delivery process, module boundaries, OpenAPI placeholder, schemas, and worker skeleton needed before any real automation module can be built.

## 1. Purpose

The Master Execution Package explains how the Phase 0 documentation package should be used by operators, developers, reviewers, and future automation contributors.

Phase 0 exists to prepare the foundation safely. It must prove that the project can define automation architecture, contracts, ownership, and dummy-worker boundaries without implementing real bots or production integrations.

## 2. Phase 0 definition

Phase 0 is limited to:

1. Documentation.
2. Repository structure.
3. Architecture decisions.
4. Scope and phase labels.
5. API contract placeholders.
6. JSON schema placeholders.
7. Worker runtime skeleton.
8. Dummy-worker-only preparation.
9. Security and operations documentation.
10. Team delivery process.
11. Acceptance criteria and test planning.

Phase 0 is not a bot-building phase.

## 3. Explicitly forbidden in Phase 0

The following are not allowed in Phase 0:

1. Real Divar crawler.
2. Real Divar messaging.
3. Real WhatsApp sender or reader.
4. Real Instagram extractor.
5. Real Torob scraper.
6. Real Google Maps scraper.
7. Real Google Search scraper.
8. Real Telegram, Rubika, Bale, or SMS integration.
9. OCR/STT pipeline.
10. AI/LLM pipeline.
11. Browser automation.
12. Proxy/account automation.
13. Production scraping.
14. Production message sending.
15. Runtime plugin execution.
16. Production worker deployment.
17. Laravel core.
18. Parallel database.
19. Parallel API layer.
20. Parallel admin panel.
21. Automation migration without approved design.
22. Real credentials, tokens, cookies, passwords, service role keys, or private operational data.

Anything in this list must be labeled `FUTURE` unless a later approved ADR moves it into a later phase.

## 4. Repository baseline

The current `get-git-going` repository is the Control Plane and Core for Afra Automation.

The repository already contains:

1. React / TanStack / TypeScript application structure.
2. Persian RTL operator UI patterns.
3. Supabase integration.
4. Auth and RBAC foundation.
5. Product, pricing, sales, accounting, knowledge, feedback, and operational modules in different maturity states.
6. PostgreSQL migrations.
7. Self-host deployment structure.
8. Repository inventory and acceptance criteria.
9. Self-host, migration, resilience, and operations documentation.
10. Partial bot/public API foundation.

Phase 0 must extend this repository. It must not bypass or duplicate it.

## 5. Required reading order

Before doing Phase 0 automation work, read documents in this order:

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/AUTOMATION_GAP_ANALYSIS.md`
6. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
7. `docs/automation/README.md`
8. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
9. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
10. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
11. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`

After this, read the specific document set for the task area.

## 6. Documentation map

### 6.1 Master documents

Use these to understand the full package:

1. `docs/automation/README.md`
2. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`
3. `docs/AUTOMATION_GAP_ANALYSIS.md`
4. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`

### 6.2 Scope documents

Use these to decide what belongs in each phase:

1. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
2. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`

### 6.3 Phase documents

Use these to understand Phase 0 and later planning:

1. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
2. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
3. `docs/automation/02_phases/phase_1/`

Phase 1 files are planning-only until Phase 0 is accepted.

### 6.4 Architecture and ADRs

Use these to understand the decisions that control the work:

1. `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
2. `docs/automation/03_architecture/adr/ADR-002-no-laravel-in-phase-0.md`
3. `docs/automation/03_architecture/adr/ADR-003-supabase-as-source-of-truth.md`
4. `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
5. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
6. `docs/automation/03_architecture/c4/`
7. `docs/automation/03_architecture/deps/`

Any new architectural exception requires a new ADR before implementation.

### 6.5 Contracts

Use these before designing any worker or module behavior:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `docs/automation/04_contracts/apis/`
4. `docs/automation/04_contracts/events/`
5. `docs/automation/04_contracts/plugin_sdk/`
6. `openapi/automation-v1.yaml`
7. `schemas/automation/`

Contract files must be reviewed before implementation.

### 6.6 Security and operations

Use these before any operational, environment, access, or release decision:

1. `docs/automation/05_security_ops/SECURITY_BASELINE.md`
2. `docs/automation/05_security_ops/SECRETS_POLICY.md`
3. `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`
4. `docs/automation/05_security_ops/RUNBOOK.md`
5. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
6. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`
7. `docs/automation/05_security_ops/TESTING_STRATEGY.md`
8. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`
9. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
10. `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`
11. `docs/automation/05_security_ops/RELEASE_CHECKLIST.md`

### 6.7 Team delivery

Use these to turn documentation into controlled work:

1. `docs/automation/06_team_delivery/RACI_OWNERSHIP.md`
2. `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
3. `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`
4. `docs/automation/06_team_delivery/TASK_PACKET_SYSTEM.md`
5. `docs/automation/06_team_delivery/task_packets/WPC-0-001.md`
6. `.github/pull_request_template.md`
7. `CODEOWNERS`
8. `CONTRIBUTING.md`
9. `LOVABLE_RULES.md`

### 6.8 Module specifications

Use these only as scoped planning references:

1. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
2. `docs/automation/07_modules/GOOGLE_MAPS_MODULE_SPEC.md`
3. `docs/automation/07_modules/TOROB_MODULE_SPEC.md`
4. `docs/automation/07_modules/DIVAR_FUTURE_MODULE_SPEC.md`

Only the dummy worker belongs to Phase 0 preparation. Google Maps, Torob, and Divar remain planning references unless a later ADR changes their phase.

### 6.9 Worker skeleton

Use these for future dummy-worker preparation:

1. `afrakala-worker/README.md`
2. `afrakala-worker/.env.example`
3. `afrakala-worker/src/`
4. `afrakala-worker/tests/`

This skeleton must remain dummy-only during Phase 0.

## 7. Ownership model

Phase 0 ownership follows `docs/automation/06_team_delivery/RACI_OWNERSHIP.md`.

General responsibilities:

1. Afra: final owner, product direction, security approval, sensitive decisions, architecture boundary approval.
2. Porchista: main technical implementation owner and technical reviewer.
3. Heidari: execution, testing, documentation support, task completion review.
4. Talebizadeh: execution, testing, quality control, acceptance and quality review.

Sensitive work requires final approval from Afra before merge.

## 8. Execution process

Every Phase 0 task must follow this process:

1. Confirm the file is approved for editing.
2. Read required repository baseline documents.
3. Read the target file.
4. Confirm the task is Phase 0 safe.
5. Confirm no runtime implementation is being added.
6. Confirm no migration or secret is being added.
7. Write or expand exactly the approved file.
8. Use the PR template.
9. Get review according to CODEOWNERS and RACI.
10. Merge only after acceptance gates pass.

## 9. Definition of Phase 0 completion

Phase 0 is complete only when:

1. Required documentation structure exists.
2. Scope and phase labels are defined.
3. Gap analysis is complete.
4. Repository inventory addendum is complete.
5. ADRs exist for the major architecture decisions.
6. Worker runtime spec exists.
7. Dummy worker spec exists.
8. Job lifecycle exists.
9. OpenAPI placeholder exists.
10. JSON schema placeholders exist.
11. Worker skeleton exists.
12. `.env.example` contains placeholders only.
13. PR template enforces Phase 0 gates.
14. CODEOWNERS routes review.
15. No real bots are added.
16. No runtime automation is added.
17. No migration is added without approval.
18. No secrets are committed.
19. The team can create task packets from the documentation.
20. A later approved task can safely implement and test a dummy-worker-only flow.

## 10. Required state before real automation

Real automation modules may not start until the project has:

1. Approved automation database design.
2. Approved RLS/RBAC and audit plan.
3. Approved migration and rollback plan.
4. Approved OpenAPI contract.
5. Approved JSON schemas.
6. Approved worker authentication design.
7. Approved job lifecycle.
8. Approved heartbeat and stale-worker behavior.
9. Approved checkpoint/resume behavior.
10. Approved artifact contract.
11. Approved worker runbook.
12. Approved test case registry.
13. Successful dummy-worker end-to-end test.
14. Module-specific specification.
15. ADR approving the specific module for implementation.

## 11. Final rule

This package prepares the ground. It does not authorize construction of real robots.

If a task requires real external automation, scraping, sending, AI, OCR/STT, browser automation, proxy/account automation, production integration, migration, or secret handling, it must stop until a later approved ADR and task packet explicitly allow it.
