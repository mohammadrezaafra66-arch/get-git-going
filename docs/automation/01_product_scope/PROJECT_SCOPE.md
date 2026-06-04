# Project Scope — Afra Automation Phase 0

This document defines the official scope of Afra Automation Phase 0.

Phase 0 is a preparation phase only. It exists to make the existing `get-git-going` repository ready for safe future automation work without building real automation modules.

## 1. Core decision

The existing `get-git-going` repository remains the Control Plane and Core for Afra Automation.

This means:

1. No new central application is created.
2. No Laravel core is introduced.
3. No parallel admin panel is introduced.
4. No parallel API layer is introduced.
5. No parallel database is introduced.
6. Existing repository architecture remains the source of truth for application structure.
7. Existing repository inventory and acceptance criteria remain mandatory references.

Any proposal to change this decision requires a new approved ADR before implementation.

## 2. UI boundary

Lovable, React, and TanStack belong to the UI/operator panel layer.

The UI may eventually display automation jobs, worker status, logs, checkpoints, artifacts, and operator controls after the required contracts and acceptance criteria are approved.

The UI must not contain:

1. Worker runtime logic.
2. Real bot logic.
3. Scraping logic.
4. Sending logic.
5. OCR/STT logic.
6. AI pipeline logic.
7. Browser automation.
8. Proxy/account automation.
9. Service-role secrets.
10. Hidden automation control systems that bypass the approved core.

Lovable may help with safe UI and documentation work, but it is not the automation runtime.

## 3. Data boundary

Supabase/PostgreSQL remains the source of truth.

Phase 0 may document future automation data needs, including jobs, workers, heartbeats, logs, checkpoints, artifacts, commands, and plugin registry concepts.

Phase 0 must not add automation database migrations unless a separate approved task explicitly allows it after table design, RLS/RBAC, audit, rollback, and acceptance criteria have been reviewed.

No separate database may be created for automation.

## 4. Worker boundary

The Worker Runtime is separate from the UI.

The future worker runtime belongs outside Lovable/React UI code. It will eventually handle background work through approved contracts.

In Phase 0, the worker is dummy-only.

A Phase 0 dummy worker may only be used to design or later test a safe simulated flow:

1. Worker identity.
2. Dummy job claiming.
3. Heartbeat.
4. Progress update.
5. Log append.
6. Checkpoint save.
7. Dummy artifact registration.
8. Safe success or failure state.

The Phase 0 worker must not call real external platforms.

## 5. In scope for Phase 0

The following work is inside Phase 0 scope:

1. Repository structure preparation for automation documentation.
2. Master execution documentation.
3. Project scope documentation.
4. Phase label policy.
5. Phase 0 requirements.
6. Phase 0 acceptance criteria.
7. Repository inventory addendum for automation.
8. Automation gap analysis.
9. Architecture decision records for Phase 0 decisions.
10. OpenAPI placeholder for automation contracts.
11. JSON schema placeholders under `schemas/automation/`.
12. Worker runtime specification.
13. Dummy worker specification.
14. Job lifecycle documentation.
15. Event contract documentation.
16. Plugin/driver contract documentation.
17. Security baseline documentation.
18. RLS/RBAC planning documentation.
19. Secrets policy documentation.
20. Testing strategy and test case registry.
21. Runbook, incident, postmortem, and release checklist documentation.
22. RACI ownership documentation.
23. Definition of Ready.
24. Definition of Done.
25. Pull request and review process documentation.
26. Task packet system and sample task packet.
27. Worker skeleton folder and placeholder-only `.env.example`.
28. Safe end-to-end dummy-flow design.

All Phase 0 work must remain documentation, contracts, skeleton, or dummy-flow preparation only.

## 6. Out of scope for Phase 0

The following are explicitly out of scope and must not be built in Phase 0:

1. Real Divar crawler.
2. Real Divar messaging.
3. Real WhatsApp sender.
4. Real WhatsApp reader.
5. Real Instagram extractor.
6. Real Torob scraper.
7. Real Google Maps scraper.
8. Real Google Search scraper.
9. Real Telegram integration.
10. Real Rubika integration.
11. Real Bale integration.
12. Real SMS integration.
13. OCR/STT pipeline.
14. AI/LLM pipeline.
15. Browser automation.
16. Proxy/account automation.
17. Production scraping.
18. Production message sending.
19. Production worker deployment.
20. Runtime plugin execution.
21. Real external platform integration.
22. Laravel core.
23. Parallel database.
24. Parallel API layer.
25. Parallel admin panel.
26. Parallel control plane.
27. Automation migration without explicit approval.
28. Real secrets, credentials, cookies, tokens, browser profiles, or service role keys.

If a task includes any item above, it must be labeled `FUTURE` unless a later approved ADR and task packet explicitly move it into a later implementation phase.

## 7. Safe dummy end-to-end flow

Phase 0 may prepare the design for a safe dummy end-to-end flow.

The only acceptable dummy flow is:

1. Create or define a dummy job.
2. Claim or simulate claiming the dummy job.
3. Send or simulate heartbeat.
4. Write safe logs.
5. Update progress.
6. Save checkpoint state.
7. Register a dummy artifact.
8. Mark the dummy job as succeeded, failed, cancelled, or retryable.
9. Read the final status through the approved contract.

This flow must not connect to Divar, WhatsApp, Instagram, Torob, Google Maps, Telegram, Rubika, Bale, SMS, OCR/STT services, AI services, browser automation, proxy providers, or production systems.

## 8. Phase labels

Use these labels consistently:

1. `BASELINE`: current repository state and inventory.
2. `PHASE-0`: documentation, contracts, structure, skeleton, and dummy-worker preparation only.
3. `PHASE-1`: limited MVP after Phase 0 acceptance and new approval.
4. `FUTURE`: not to be built now.

When uncertain, classify the task as `FUTURE` and request an ADR decision.

## 9. Required approval before real automation

Before any real automation module can be implemented, the project must have:

1. Accepted Phase 0 documentation package.
2. Approved automation data model.
3. Approved RLS/RBAC plan.
4. Approved audit plan.
5. Approved migration and rollback plan.
6. Approved OpenAPI contract.
7. Approved JSON schemas.
8. Approved worker authentication design.
9. Approved job lifecycle.
10. Approved heartbeat and stale-worker behavior.
11. Approved checkpoint/resume behavior.
12. Approved artifact contract.
13. Approved worker runbook.
14. Approved test case registry.
15. Successful dummy-worker end-to-end test.
16. Module-specific specification.
17. ADR approving the specific real module for implementation.

## 10. Final rule

Phase 0 prepares the foundation. It does not build real robots.

If a requested change would introduce runtime behavior, real automation, production integration, database migration, secrets, or a parallel system, it is outside Phase 0 scope and must be blocked until explicitly approved through the architecture decision process.
