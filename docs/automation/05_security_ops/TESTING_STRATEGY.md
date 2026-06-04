# Testing Strategy — Afra Automation Phase 0

This document defines the Phase 0 testing strategy for Afra Automation contracts, schemas, dummy-worker design, and safe end-to-end dummy-flow validation.

Phase 0 testing does not test real automation. It must not call real external services, use real credentials, send real messages, scrape real sources, run browser automation, execute OCR/STT, execute AI/LLM pipelines, or validate production integrations.

## 1. Purpose

The purpose of Phase 0 testing is to prove that the automation foundation is safe, reviewable, and internally consistent before any real automation module is considered.

Testing must validate:

1. Documentation completeness.
2. Contract consistency.
3. Schema validity.
4. Job lifecycle clarity.
5. Dummy-worker-only behavior.
6. Failure and recovery design.
7. Safe dummy E2E flow readiness.
8. Forbidden-work controls.
9. Secret-safety expectations.

## 2. Canonical references

Phase 0 tests must be traceable to:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`
4. `docs/automation/05_security_ops/RUNBOOK.md`
5. `docs/automation/05_security_ops/RELEASE_CHECKLIST.md`
6. `openapi/automation-v1.yaml`
7. `schemas/automation/job.schema.json`
8. `schemas/automation/worker-heartbeat.schema.json`
9. `schemas/automation/artifact.schema.json`

`docs/automation/05_security_ops/TEST_CASE_REGISTRY.md` is the canonical registry for Phase 0 test case tracking.

## 3. Testing scope

In scope:

1. Documentation review.
2. Phase label review.
3. OpenAPI review.
4. JSON schema validation review.
5. Job lifecycle review.
6. Worker runtime specification review.
7. Dummy-worker behavior review.
8. Failure and recovery path review.
9. Safe dummy E2E flow validation.
10. PR and release checklist evidence review.

Out of scope:

1. Real Divar testing.
2. Real WhatsApp testing.
3. Real Instagram testing.
4. Real Torob testing.
5. Real Google Maps testing.
6. Real OCR/STT testing.
7. Real AI/LLM testing.
8. Browser automation testing.
9. Proxy/account automation testing.
10. Production deployment testing.
11. Production scraping or sending.
12. Any test requiring real credentials.

## 4. Test layers

### 4.1 Documentation review

Purpose: confirm that Phase 0 documents are complete, consistent, and safe.

Review should check:

1. Phase 0 scope is explicit.
2. Forbidden work is clearly stated.
3. Existing repository remains Control Plane/Core.
4. Supabase/PostgreSQL remains source of truth.
5. React/TanStack/Lovable remains UI/operator layer only.
6. Worker Runtime remains separate and dummy-only.
7. No document claims real automation exists.
8. No document exposes secrets or private operational data.

### 4.2 Contract review

Purpose: confirm that contract documents describe the same system boundaries.

Review should check:

1. `WORKER_RUNTIME_SPEC.md` and `JOB_LIFECYCLE.md` agree.
2. OpenAPI placeholder does not imply production automation.
3. Contract terminology is consistent.
4. `artifact` is used as the canonical term.
5. No contract defines real external job types in Phase 0.
6. No contract includes credentials or private endpoints.

### 4.3 Schema validation

Purpose: confirm that JSON schemas are syntactically valid and aligned with Phase 0 contracts.

Review should check:

1. `schemas/automation/job.schema.json` is valid JSON schema.
2. `schemas/automation/worker-heartbeat.schema.json` is valid JSON schema.
3. `schemas/automation/artifact.schema.json` is valid JSON schema.
4. `schemas/automation/artifact.schema.json` remains the canonical artifact contract.
5. Schema examples do not contain real credentials.
6. Schema fields do not imply real external platform execution in Phase 0.

### 4.4 Lifecycle review

Purpose: confirm that dummy jobs have a safe state machine.

Review should check:

1. All canonical statuses are defined.
2. Allowed transitions are documented.
3. Illegal transitions are rejected or escalated.
4. Terminal states are clearly distinguished from recoverable states.
5. Pause, cancel, retry, fail, and success semantics are clear.
6. Heartbeat, checkpoint, log, and artifact concepts are referenced.

### 4.5 Dummy-worker behavior review

Purpose: confirm that the dummy worker concept remains safe and non-production.

Review should check:

1. Worker identity is defined.
2. Claim or simulated claim is defined.
3. Heartbeat behavior is defined.
4. Progress update behavior is defined.
5. Safe log behavior is defined.
6. Checkpoint behavior is defined.
7. Artifact registration behavior is defined.
8. Terminal state reporting is defined.
9. No real external calls are required.

### 4.6 Failure and recovery path review

Purpose: confirm that failures have safe, documented handling.

Review should check:

1. Stale heartbeat assumptions are documented.
2. Retry behavior is bounded conceptually.
3. Checkpoint/resume behavior is documented.
4. Stuck job handling is documented.
5. Pause/cancel handling is documented.
6. Contract/schema mismatch handling is documented.
7. Secret exposure escalation is documented.
8. Migration failure escalation is documented.

### 4.7 Safe E2E dummy-flow validation

Purpose: confirm that the future dummy-flow path is defined without real automation.

The safe dummy-flow test must validate only:

1. Create or define a dummy job.
2. Claim or simulate claiming the dummy job.
3. Send or simulate heartbeat.
4. Append safe logs.
5. Update progress.
6. Save checkpoint.
7. Register dummy artifact.
8. Mark final status.
9. Read final status through approved contract.

This test must not call real external systems.

## 5. Required coverage areas

Phase 0 testing must cover:

1. Job state transitions.
2. Illegal job state transitions.
3. Heartbeat behavior.
4. Stale-heartbeat assumptions.
5. Safe log behavior.
6. Checkpoint behavior.
7. Artifact registration.
8. Retry waiting behavior.
9. Pause and cancel behavior.
10. Fail and success semantics.
11. Forbidden-work checks.
12. Secret-safety checks.
13. OpenAPI/schema alignment.
14. Documentation completeness.
15. PR/release checklist compliance.

## 6. What Phase 0 tests must never do

Phase 0 tests must never:

1. Call real external services.
2. Use real credentials.
3. Send real messages.
4. Scrape real sources.
5. Run browser automation.
6. Execute OCR/STT.
7. Execute AI/LLM pipelines.
8. Connect to production integrations.
9. Use proxy/account automation.
10. Use production data.
11. Use private customer data.
12. Modify production database state.
13. Execute migrations unless a separate approved migration test task exists.

## 7. Test evidence requirements

Every Phase 0 test result must include:

1. Test case ID.
2. Date.
3. Tester.
4. Result.
5. Notes.
6. Linked PR.
7. Linked Task Packet.
8. Related document or schema path.
9. Block reason if blocked.

Recommended result values:

1. `PASS`
2. `FAIL`
3. `BLOCKED`
4. `NOT_APPLICABLE`

## 8. Pass / fail / block conventions

### 8.1 PASS

Use `PASS` only when the expected behavior or review criterion is fully satisfied and evidence is recorded.

### 8.2 FAIL

Use `FAIL` when the test was performed and the expected behavior or criterion was not met.

A failed test must include:

1. What failed.
2. Which requirement or acceptance criterion is affected.
3. Whether follow-up is required.
4. Linked PR or Task Packet.

### 8.3 BLOCKED

Use `BLOCKED` when the test cannot be completed because a prerequisite is missing.

A blocked test must include:

1. Missing prerequisite.
2. Owner or next action.
3. Whether the issue blocks Phase 0 acceptance.

### 8.4 NOT_APPLICABLE

Use `NOT_APPLICABLE` only when the test does not apply to the specific PR or task.

The reason must be stated.

## 9. Traceability rule

Every Phase 0 test must be registered in `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`.

Each test case must map to at least one of:

1. Phase 0 requirement.
2. Acceptance criterion.
3. Worker runtime responsibility.
4. Job lifecycle rule.
5. Security baseline rule.
6. Release checklist gate.
7. Contract or schema file.

If a test is discovered during review, add it to the registry before considering the area complete.

## 10. Review and release relationship

Testing evidence must be referenced in the PR and release checklist.

Before merge, reviewers should verify:

1. Required tests are listed.
2. Evidence fields are complete.
3. Blocked tests have owners and next actions.
4. No real external testing was performed.
5. No secrets were used.
6. No production system was touched.
7. Forbidden work checks passed.

## 11. Final rule

Phase 0 testing proves the foundation, not the real automation modules.

If a test requires real bots, real scraping, real sending, OCR/STT, AI/LLM, browser automation, proxy/account automation, production credentials, or production integration, it is not a Phase 0 test and must be blocked or reclassified as future work.
