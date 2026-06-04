# Afra Automation Phase 0 Gap Analysis

This document analyzes the current `get-git-going` repository against the intended Afra Automation / multi-robot platform direction.

It is a Phase 0 planning document only. It does not authorize real bots, scraping, sending, OCR/STT, AI pipelines, browser automation, proxy/account automation, production integrations, migrations, or runtime worker implementation.

## 1. Purpose

The purpose of this document is to answer four questions:

1. What already exists in the current repository and must be reused?
2. What is missing for a safe automation foundation?
3. What must not be built in Phase 0?
4. What must be completed before real automation modules can be implemented in a later approved phase?

## 2. Current repository baseline

The current repository is not an empty scaffold. It already contains the live AfraKala smart assistant foundation.

Existing baseline areas include:

1. React / TanStack / TypeScript application shell.
2. Persian RTL operator UI.
3. Supabase integration.
4. Auth and role-based access control.
5. Product, pricing, sales, accounting, knowledge, feedback, and operational modules in different maturity states.
6. PostgreSQL migrations under `supabase/migrations/`.
7. Self-host deployment structure under `deploy/`.
8. Existing documentation for inventory, acceptance criteria, migration safety, self-hosting, internet resilience, and operations.
9. Partial public bot API foundation under the existing application architecture.

This means Phase 0 automation work must extend the existing repository. It must not create a new core beside it.

## 3. Existing assets that must be reused

### 3.1 Control plane / core

The existing `get-git-going` application is the control plane and core application.

Reuse:

1. Existing auth model.
2. Existing RBAC model.
3. Existing Supabase/PostgreSQL connection pattern.
4. Existing self-host deployment strategy.
5. Existing app shell and operator UI patterns.
6. Existing documentation governance.
7. Existing inventory and acceptance criteria.

Do not create:

1. Laravel core.
2. Separate admin panel.
3. Separate automation database.
4. Separate automation API that bypasses the current core.
5. New isolated control plane.

### 3.2 Supabase/PostgreSQL

Supabase/PostgreSQL is the source of truth.

Reuse:

1. Existing migrations discipline.
2. Existing RLS/RBAC expectations.
3. Existing self-host Supabase design.
4. Existing migration safety policy.
5. Existing backup/restore expectations.

Missing for automation:

1. Automation jobs table design.
2. Worker registry table design.
3. Worker heartbeat table design.
4. Job logs table design.
5. Checkpoints table design.
6. Artifacts table design.
7. Plugin/driver registry table design.
8. Job event history design.
9. RLS/RBAC plan for automation tables.
10. Audit plan for automation actions.
11. Rollback plan for automation migrations.

No automation migration may be added before the design is approved.

### 3.3 Existing bot/public API foundation

The repository already contains partial bot/public API capability. This is useful, but it is not yet the full automation runtime contract.

Reuse:

1. Existing bot API security thinking.
2. Existing server-side API patterns.
3. Existing API key / rate-limit direction where applicable.
4. Existing distinction between public bot API and internal server functions.

Missing for automation:

1. Worker claim-job endpoint contract.
2. Worker heartbeat endpoint contract.
3. Job progress update contract.
4. Job log append contract.
5. Checkpoint write/read contract.
6. Artifact registration contract.
7. Cancel/pause/resume command contract.
8. Error reporting contract.
9. Idempotency rules.
10. Retry and stale-worker behavior.

## 4. Existing documentation baseline

Already present and authoritative:

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/MIGRATION_SAFETY_POLICY.md`
6. `docs/SELF_HOST_UPDATE_RUNBOOK.md`
7. `docs/INTERNET_RESILIENCE.md`
8. `docs/OPERATIONS_QUICK_REFERENCE.md`
9. Self-host governance documentation.

Phase 0 automation documentation must reference these files instead of duplicating or contradicting them.

## 5. Phase 0 automation structure now being prepared

The Phase 0 automation documentation structure should cover:

1. Master execution package.
2. Project scope and phase labels.
3. Phase 0 requirements.
4. Phase 0 acceptance criteria.
5. Technical architecture for Phase 0 and Phase 1 preparation.
6. Worker runtime specification.
7. Job lifecycle.
8. API contracts.
9. Event contracts.
10. Plugin/driver contract.
11. Security baseline.
12. RLS/RBAC plan.
13. Testing strategy.
14. Runbook.
15. Incident and postmortem templates.
16. Release checklist.
17. RACI ownership.
18. Definition of Ready.
19. Definition of Done.
20. Task packet system.
21. Dummy worker module spec.
22. Future module specs for Google Maps, Torob, and Divar.

This structure is documentation-first. It is not permission to implement real modules.

## 6. Missing items for Phase 0 readiness

The repository needs the following before Phase 0 can be considered complete.

### 6.1 Contract readiness

Required:

1. Stable `openapi/automation-v1.yaml` placeholder and later full contract.
2. JSON schema files under `schemas/automation/`.
3. Job schema.
4. Worker heartbeat schema.
5. Artifact schema.
6. Plugin manifest schema.
7. Clear rule that `schemas/automation/artifact.schema.json` is the canonical artifact contract.
8. Contract versioning policy.
9. Backward compatibility notes.
10. Explicit forbidden fields such as secrets, cookies, and credentials.

### 6.2 Worker readiness

Required:

1. `afrakala-worker/` skeleton.
2. Worker README.
3. `.env.example` with placeholder-only values.
4. Dummy worker specification.
5. No real runtime behavior unless explicitly approved.
6. No external service calls.
7. No browser automation.
8. No scraping.
9. No sending.
10. No AI/OCR/STT.

### 6.3 Database design readiness

Required before any automation migration:

1. Table design.
2. RLS/RBAC design.
3. Audit design.
4. Index design.
5. Retention policy.
6. Rollback plan.
7. Backup requirement.
8. Staging test plan.
9. Acceptance criteria.
10. Owner approval.

### 6.4 Operations readiness

Required:

1. Runbook for dummy worker operation.
2. Stale worker detection design.
3. Heartbeat monitoring design.
4. Job retry design.
5. Checkpoint/resume design.
6. Incident state template.
7. Postmortem template.
8. Release checklist.
9. Environment matrix.
10. Test case registry.

### 6.5 Team workflow readiness

Required:

1. RACI ownership.
2. Definition of Ready.
3. Definition of Done.
4. Pull request checklist.
5. Task packet template.
6. CODEOWNERS.
7. CONTRIBUTING rules.
8. Lovable rules.
9. Cursor/agent operating rules through `AGENTS.md`.
10. Clear reviewer expectations.

## 7. What must not be built in Phase 0

The following are explicitly out of scope for Phase 0:

1. Real Divar crawler.
2. Real Divar messaging.
3. Real WhatsApp sender.
4. Real WhatsApp reader.
5. Real Instagram extractor.
6. Real Torob scraper.
7. Real Google Maps scraper.
8. Real Google Search scraper.
9. Real Telegram ingestion.
10. Real Rubika or Bale integration.
11. Real SMS integration.
12. Real OCR/STT pipeline.
13. Real AI/LLM pipeline.
14. Browser automation.
15. Proxy management.
16. Account/session automation.
17. Production scraping.
18. Production message sending.
19. Runtime plugin execution.
20. Production worker deployment.
21. Laravel core.
22. Parallel API layer.
23. Parallel database.
24. Parallel admin panel.
25. Database migration without approved design.
26. Any committed secret or real credential.

If any of these items are discussed in Phase 0 documents, they must be clearly labeled as `FUTURE` or as non-executable design context.

## 8. Required state before real automation modules

Before implementing real automation modules in a later phase, the project must have all items below approved and tested.

### 8.1 Control-plane requirements

1. Automation job creation UI or safe internal trigger.
2. Job list and status view.
3. Worker registry view.
4. Heartbeat status view.
5. Job logs view.
6. Artifact reference view.
7. Pause/cancel/retry controls.
8. RBAC controls for automation operators.
9. Audit logging for sensitive automation commands.
10. Clear separation between UI and worker runtime.

### 8.2 API requirements

1. Versioned automation API.
2. Worker authentication.
3. Claim-job endpoint.
4. Heartbeat endpoint.
5. Progress endpoint.
6. Log endpoint.
7. Checkpoint endpoint.
8. Artifact endpoint.
9. Cancel/pause/resume command endpoint.
10. Rate limiting.
11. Timeout behavior.
12. Idempotency strategy.
13. Error response standard.

### 8.3 Database requirements

1. Approved automation tables.
2. RLS/RBAC policies.
3. Audit triggers or audit writer design.
4. Required indexes.
5. Retention policy.
6. Backup and restore compatibility.
7. Migration rollback path.
8. Staging validation.

### 8.4 Worker requirements

1. Dummy worker successfully tested first.
2. Stale heartbeat detection tested.
3. Retry and lease behavior tested.
4. Checkpoint/resume tested.
5. Safe shutdown behavior tested.
6. Logs and artifact registration tested.
7. No secret leakage in logs.
8. No service role distributed to worker machines unless a later approved security design allows it.
9. Feature flags for any external integration.
10. Manual fallback for critical operations.

### 8.5 Module readiness requirements

Each real module must have its own approved module spec before implementation.

Each module spec must define:

1. Source system.
2. Legal and ethical boundary.
3. Allowed data.
4. Forbidden data.
5. Rate limits.
6. Failure modes.
7. Retry behavior.
8. Checkpoint model.
9. Output schema.
10. Security and access model.
11. Test cases.
12. Rollback or disable plan.
13. Owner and reviewer.

## 9. Gap summary by area

| Area | Current state | Gap | Phase 0 action |
|---|---|---|---|
| Core app | Existing and active | Automation UI/worker contract missing | Document and design only |
| Database | Supabase/PostgreSQL exists | Automation tables not designed/approved | Design before migration |
| API | Partial bot API exists | Worker API missing | Define OpenAPI contract |
| Worker | Skeleton only | No dummy worker runtime yet | Document and prepare dummy-only flow |
| Schemas | Placeholders started | Need stable schema contracts | Expand placeholders safely |
| Security | Strong baseline exists | Worker-specific rules missing | Add worker-specific security docs |
| Operations | Self-host runbooks exist | Automation runbooks missing | Add dummy-worker runbook |
| Testing | General verification exists | Automation test registry missing | Define Phase 0 test cases |
| Team workflow | RACI and task docs started | Needs consistent execution discipline | Use DoR, DoD, PR checklist |
| Real modules | Future only | Not ready | Keep out of Phase 0 |

## 10. Phase 0 success criteria

Phase 0 is successful only when the repository proves the foundation is ready without building real automation.

Minimum success criteria:

1. Documentation structure exists.
2. Scope and phase label policy exists.
3. Gap analysis exists.
4. ADRs exist for core architectural decisions.
5. Worker runtime spec exists.
6. Dummy worker spec exists.
7. Job lifecycle exists.
8. OpenAPI placeholder exists.
9. JSON schema placeholders exist.
10. Worker skeleton exists.
11. `.env.example` is placeholder-only.
12. Pull request template enforces Phase 0 gates.
13. CODEOWNERS routes review to the owner.
14. No real bots are added.
15. No runtime automation is added.
16. No migration is added without approval.
17. No secrets are committed.
18. Next-step task packets can be created from the docs.

## 11. Final recommendation

Do not start real Google Maps, Torob, Divar, WhatsApp, Instagram, OCR/STT, or AI automation yet.

The correct next step is to complete the Phase 0 documentation and contract package, then design and test a safe dummy-worker end-to-end flow.

Only after that flow is accepted should the team consider a limited Phase 1 module under a new ADR, new module spec, and strict acceptance criteria.
