# Phase 0 Requirements — Afra Automation

This document defines the full requirements for Afra Automation Phase 0.

Phase 0 is a foundation-only phase. It prepares the existing `get-git-going` repository for future automation without building real automation modules.

## 1. Purpose

Phase 0 must make the repository ready for safe future automation work by establishing structure, scope, decisions, contracts, schemas, worker boundaries, security expectations, and dummy-flow testing requirements.

Phase 0 must not implement real bots, real scraping, real sending, OCR/STT, AI pipelines, browser automation, proxy/account automation, production integrations, Laravel core, or parallel systems.

## 2. Phase 0 scope

Phase 0 includes only:

1. Repository inventory.
2. Documentation structure.
3. Scope and phase label control.
4. ADR placeholders and architecture decisions.
5. Automation table design.
6. API contract design.
7. JSON schemas.
8. Worker Runtime skeleton.
9. Dummy Worker only.
10. Logging, checkpoint, status, and start/stop contract design.
11. Safe end-to-end dummy flow test.

## 3. Functional requirements

### FR-01 — Repository inventory

The project must document the current state of the existing `get-git-going` repository.

The inventory must identify:

1. Existing core application areas.
2. Existing Supabase/PostgreSQL structure.
3. Existing auth and RBAC patterns.
4. Existing self-host deployment structure.
5. Existing bot/public API areas.
6. Existing documentation and governance files.
7. Existing modules that must not be duplicated.
8. Sensitive areas that must not be touched casually.

Output references:

1. `docs/REPO_STATE_INVENTORY.md`
2. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
3. `docs/AUTOMATION_GAP_ANALYSIS.md`

### FR-02 — Documentation structure

The repository must contain a clear `docs/automation/` documentation structure.

The structure must include:

1. Master execution documents.
2. Scope and phase label documents.
3. Phase 0 and Phase 1 documents.
4. Architecture and ADR documents.
5. Contracts and schema references.
6. Security and operations documents.
7. Team delivery documents.
8. Module specification documents.

Documentation must be navigable by operators, developers, reviewers, and future worker authors.

### FR-03 — Scope and phase label control

The project must define and enforce official phase labels:

1. `BASELINE`
2. `PHASE-0`
3. `PHASE-1`
4. `FUTURE`

Every Task Packet and pull request must include a phase label.

Unclear, risky, or real-automation-like tasks must default to `FUTURE` or `BLOCKED` until clarified.

### FR-04 — ADR placeholders and architecture decisions

Phase 0 must document the key architecture decisions that protect the project from duplication and scope creep.

Required decisions include:

1. Existing `get-git-going` repository remains the Control Plane/Core.
2. Laravel is not introduced in Phase 0.
3. Supabase/PostgreSQL remains the source of truth.
4. Python Worker Runtime is separate from the UI.
5. No real bots are built in Phase 0.
6. No parallel core, database, API, or admin panel may be created without a later approved ADR.

### FR-05 — Automation table design

Phase 0 must design automation tables before any migration is created.

The design must cover:

1. Jobs.
2. Workers.
3. Worker heartbeats.
4. Job logs.
5. Checkpoints.
6. Artifacts.
7. Plugin/driver registry.
8. Job events.
9. Commands.
10. Runtime settings.

The design must include:

1. Table purpose.
2. Required fields.
3. Relationships.
4. Index needs.
5. RLS/RBAC model.
6. Audit expectations.
7. Retention expectations.
8. Rollback strategy.

No automation migration may be added until the design is approved.

### FR-06 — API contract design

Phase 0 must define the automation API contract before implementation.

The contract must cover:

1. Worker registration or identification.
2. Claiming a dummy job.
3. Sending heartbeat.
4. Updating status.
5. Updating progress.
6. Appending logs.
7. Writing checkpoints.
8. Registering artifacts.
9. Reading commands.
10. Marking success, failure, cancellation, or retry state.

The contract must be represented in `openapi/automation-v1.yaml`.

### FR-07 — JSON schemas

Phase 0 must define placeholder JSON schemas for automation contracts.

Required schemas include:

1. `schemas/automation/job.schema.json`
2. `schemas/automation/worker-heartbeat.schema.json`
3. `schemas/automation/artifact.schema.json`
4. `schemas/automation/plugin-manifest.schema.json`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

Schemas must be syntactically valid and contain no secrets or production-specific private values.

### FR-08 — Worker Runtime skeleton

Phase 0 must include a worker skeleton under `afrakala-worker/`.

The skeleton may include:

1. README.
2. Placeholder `.env.example`.
3. Empty `src/` placeholder.
4. Empty `tests/` placeholder.
5. Documentation that explains future dummy-worker behavior.

The skeleton must not include real runtime automation code unless a later approved dummy-worker task explicitly allows it.

### FR-09 — Dummy Worker only

The only worker concept allowed in Phase 0 is the dummy worker.

The dummy worker may only simulate:

1. Job claim.
2. Heartbeat.
3. Progress update.
4. Log append.
5. Checkpoint save.
6. Artifact registration.
7. Success state.
8. Failure state.
9. Cancellation state.
10. Retry state.

The dummy worker must not call real external platforms.

### FR-10 — Logging, checkpoint, status, and command design

Phase 0 must design the contracts for:

1. Structured logs.
2. Job status transitions.
3. Worker heartbeat.
4. Stale worker handling.
5. Checkpoint write/read.
6. Start command.
7. Stop command.
8. Pause command.
9. Resume command.
10. Retry command.
11. Cancel command.

The design must be safe, idempotent, and recoverable.

### FR-11 — Safe end-to-end dummy flow test

Phase 0 must define a safe E2E dummy flow.

The flow must prove only this sequence:

1. Create or define a dummy job.
2. Claim or simulate claiming the dummy job.
3. Send or simulate heartbeat.
4. Write safe logs.
5. Update progress.
6. Save checkpoint.
7. Register a dummy artifact.
8. Mark final status.
9. Read the final status through the approved contract.

The flow must not contact real external platforms.

## 4. Non-functional requirements

### NFR-01 — Self-host safety

All Phase 0 outputs must preserve the project requirement to run on Linux + Docker + Supabase Self-host.

Phase 0 must not introduce a critical dependency on:

1. CDN-hosted assets.
2. Online fonts.
3. Non-self-hostable cloud services.
4. External APIs as a critical path.
5. Lovable Cloud as runtime dependency.

### NFR-02 — Reliability and recoverability

The future automation foundation must be designed for:

1. Job recovery.
2. Heartbeat monitoring.
3. Stale worker detection.
4. Retry with bounded behavior.
5. Checkpoint/resume.
6. Safe shutdown.
7. Clear final states.

### NFR-03 — Maintainability

Documentation and contracts must be modular, traceable, and easy to convert into Task Packets.

Each requirement should be small enough to become a reviewable task.

### NFR-04 — Observability

Phase 0 must define future observability needs:

1. Worker status.
2. Job status.
3. Heartbeat age.
4. Logs.
5. Progress.
6. Checkpoints.
7. Artifacts.
8. Error states.

### NFR-05 — Security by default

Phase 0 must keep secrets outside Git and must not weaken existing security posture.

No file may contain real credentials, tokens, cookies, service role keys, passwords, private keys, production dumps, or private operational data.

## 5. Documentation requirements

Phase 0 documentation must:

1. Be written in clear operational language.
2. State phase boundaries explicitly.
3. Avoid implementation instructions for real bots.
4. Reference existing canonical repository documents.
5. Avoid duplicating existing inventory and acceptance criteria.
6. Separate Phase 0 from Phase 1 and Future work.
7. Be safe for GitHub storage.
8. Avoid private operational details.
9. Be detailed enough to create Task Packets.
10. Include acceptance gates where applicable.

## 6. Data and contract requirements

Before any real automation work, Phase 0 must define:

1. Data entities.
2. API endpoints.
3. JSON schemas.
4. Event contracts.
5. Job lifecycle.
6. Artifact contract.
7. Plugin/driver manifest expectations.
8. Error response patterns.
9. Idempotency requirements.
10. Versioning expectations.

No database table may be implemented before design approval.

## 7. Worker and dummy requirements

The worker skeleton must remain dummy-only.

Requirements:

1. `afrakala-worker/README.md` explains the boundary.
2. `afrakala-worker/.env.example` contains placeholders only.
3. Worker mode remains dummy in Phase 0.
4. Safety switches must disable real automation.
5. No real external calls are allowed.
6. No browser automation is allowed.
7. No production integration is allowed.
8. No service role key may be distributed through worker config.

## 8. Security requirements

Phase 0 security requirements:

1. No real secrets in GitHub.
2. No production `.env` files.
3. No service role key in worker config.
4. No server secret with `VITE_` prefix.
5. No frontend-only authorization for future sensitive features.
6. RLS/RBAC plan required before automation tables.
7. Audit plan required before sensitive automation commands.
8. Feature flags required for future external integrations.
9. Manual fallback required for future critical integrations.
10. Secrets must remain outside the repository.

## 9. Testing requirements

Phase 0 must define tests for:

1. Documentation completeness.
2. Phase label compliance.
3. OpenAPI syntax.
4. JSON schema syntax.
5. Placeholder-only `.env.example` values.
6. No real external integrations.
7. Dummy job lifecycle.
8. Heartbeat behavior.
9. Checkpoint behavior.
10. Artifact registration.
11. Safe final status reporting.

If runtime tests do not exist yet, the file must state that the change is documentation-only and identify which tests will be required before dummy-flow implementation.

## 10. Explicit forbidden scope

Phase 0 must not include:

1. Real Divar crawler.
2. Real WhatsApp sender.
3. Real Instagram extractor.
4. Real Torob scraper.
5. Real Google Maps scraper.
6. OCR/STT production pipeline.
7. AI/LLM production pipeline.
8. Browser automation.
9. Proxy/account automation.
10. Laravel core.
11. Parallel database.
12. Parallel API.
13. Parallel admin panel.
14. Database migration without approved design and rollback.
15. Any real secret.
16. Production scraping.
17. Production sending.
18. Production worker deployment.

## 11. Requirement dependencies

| Requirement | Depends on | Must be completed before |
|---|---|---|
| Repository inventory | Existing repo review | Gap analysis, scope control, ADRs |
| Documentation structure | Scope agreement | Writing detailed Phase 0 docs |
| Scope and labels | Project scope | Task Packets and PRs |
| ADRs | Inventory and scope | Contract implementation decisions |
| Table design | Scope, ADRs, security requirements | Any automation migration |
| API contract | Job lifecycle, worker boundary | Dummy E2E implementation |
| JSON schemas | Data and API contract | Contract validation |
| Worker skeleton | Worker boundary | Dummy worker implementation |
| Dummy worker spec | Worker skeleton, job lifecycle | Dummy E2E test |
| Logging/checkpoint/status design | Job lifecycle | Dummy E2E test |
| Safe dummy E2E plan | Contracts and skeleton | Phase 0 acceptance |

## 12. Ready to implement dummy flow

The project is ready to implement the dummy flow only when all of the following are true:

1. Phase 0 scope is approved.
2. Phase labels are enforced in Task Packets and PRs.
3. Automation gap analysis exists.
4. Repository inventory addendum exists.
5. ADRs for core decisions exist.
6. Worker runtime spec exists.
7. Dummy worker spec exists.
8. Job lifecycle is defined.
9. OpenAPI contract placeholder exists.
10. JSON schemas exist and are syntactically valid.
11. Worker skeleton exists.
12. `.env.example` uses placeholder-only values.
13. Security baseline exists.
14. RLS/RBAC plan exists for future automation tables.
15. Runbook exists.
16. Test case registry exists.
17. PR template enforces Phase 0 safety.
18. CODEOWNERS routes review.
19. No real bots or runtime integrations have been added.
20. Owner approval is recorded through the PR process.

## 13. Phase 0 completion condition

Phase 0 is complete only when the repository has safe structure, complete foundation documentation, approved contracts, worker skeleton, and a defined dummy E2E plan without any real external automation.

Phase 0 completion does not mean real automation may start automatically. Real automation requires a later approved ADR, module specification, contracts, test cases, and owner approval.
