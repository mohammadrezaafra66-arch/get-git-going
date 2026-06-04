# Dummy Worker Module Specification — Phase 0

Phase label: `PHASE-0`

Dummy Worker is the only worker-like module allowed in Phase 0.

Dummy Worker is simulation-only. It must not call external platforms, run real automation, use real credentials, perform scraping, send messages, execute OCR/STT, execute AI/LLM workflows, run browser automation, use proxy/account automation, or touch production systems.

## 1. Purpose

The Dummy Worker exists to prove that the Afra Automation foundation can safely orchestrate a job without performing real external automation.

It is used to prove:

1. Job lifecycle behavior.
2. Worker heartbeat behavior.
3. Progress update behavior.
4. Checkpoint behavior.
5. Safe log behavior.
6. Artifact registration behavior.
7. Safe success handling.
8. Safe failure handling.
9. Safe stop behavior.
10. Reviewability through the test case registry.

The Dummy Worker is not a real driver and must not be converted into a real platform integration during Phase 0.

## 2. Required references

The Dummy Worker must stay aligned with:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `openapi/automation-v1.yaml`
4. `schemas/automation/job.schema.json`
5. `schemas/automation/worker-heartbeat.schema.json`
6. `schemas/automation/artifact.schema.json`
7. `schemas/automation/plugin-manifest.schema.json`
8. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`
9. `afrakala-worker/README.md`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

## 3. Allowed dummy behavior

The Dummy Worker may simulate:

1. Claim dummy job.
2. Set job status to `RUNNING`.
3. Send heartbeat.
4. Append log.
5. Update progress.
6. Save checkpoint.
7. Register artifact using `schemas/automation/artifact.schema.json`.
8. Mark job `SUCCEEDED`.
9. Mark job `FAILED` in a simulated failure path.
10. Stop safely when requested.
11. Enter or demonstrate `RETRY_WAITING` conceptually when a simulated retryable failure is used.
12. Demonstrate `PAUSED` or `CANCELLED` behavior conceptually when required by test cases.

All behavior must be safe, synthetic, and non-production.

## 4. Forbidden behavior

The Dummy Worker must not perform:

1. Real Divar crawling.
2. Real WhatsApp sending or reading.
3. Real Instagram extraction.
4. Real Torob scraping.
5. OCR/STT.
6. AI/LLM processing.
7. Browser automation.
8. Proxy/account management.
9. External platform calls.
10. Production scraping.
11. Production sending.
12. Real credential usage.
13. Real API calls.
14. Real Supabase credential usage in documentation or examples.
15. Playwright/Selenium execution.
16. Migration.
17. Production worker deployment.
18. Runtime plugin/driver execution.

If any task requires the forbidden behavior above, it is not a Dummy Worker task and must be blocked or reclassified.

## 5. Required interfaces

The Dummy Worker must be designed against these future contract surfaces:

1. OpenAPI automation contract: `openapi/automation-v1.yaml`.
2. Job schema: `schemas/automation/job.schema.json`.
3. Worker heartbeat schema: `schemas/automation/worker-heartbeat.schema.json`.
4. Artifact schema: `schemas/automation/artifact.schema.json`.
5. Plugin manifest schema: `schemas/automation/plugin-manifest.schema.json` if needed for future driver registration planning.

Phase 0 may validate the shape of these contracts, but must not add real external driver behavior.

## 6. Expected dummy test scenarios

The Dummy Worker specification must support these safe test scenarios:

### 6.1 Happy path success

The dummy job moves through allowed lifecycle states and reaches `SUCCEEDED`.

Expected proof:

1. Job is claimed or simulated as claimed.
2. Job becomes `RUNNING`.
3. Heartbeat is recorded or simulated.
4. Progress is updated.
5. Logs are appended safely.
6. Checkpoint is saved.
7. Artifact is registered.
8. Job reaches `SUCCEEDED`.

### 6.2 Simulated failure

The dummy job reaches `FAILED` through a safe simulated failure path.

Expected proof:

1. Failure reason is safe and non-sensitive.
2. Logs do not include secrets.
3. Checkpoint context is preserved when relevant.
4. No real external system is touched.

### 6.3 Checkpoint/resume simulation

The dummy job demonstrates checkpoint behavior conceptually.

Expected proof:

1. Checkpoint can be saved.
2. Checkpoint can be referenced during recovery.
3. Resume behavior follows the job lifecycle.
4. No duplicate artifact is produced by simulated resume.

### 6.4 Heartbeat stale simulation

The dummy job demonstrates stale-heartbeat assumptions conceptually.

Expected proof:

1. Last heartbeat age can be reasoned about.
2. Stale state does not automatically imply success or failure.
3. Recovery path follows runbook and lifecycle rules.

### 6.5 Cancellation simulation

The dummy job demonstrates cancellation behavior conceptually.

Expected proof:

1. Cancel reason is recorded.
2. Job reaches `CANCELLED` through allowed lifecycle transition.
3. Job does not resume after cancellation.
4. Logs remain safe.

## 7. Logging rules

Dummy Worker logs must be safe.

Logs may include:

1. Timestamp.
2. Dummy worker id.
3. Dummy job id.
4. Event name.
5. Severity level.
6. Safe message.
7. Non-sensitive context.

Logs must not include:

1. Secrets.
2. API keys.
3. Service role keys.
4. JWT secrets.
5. Passwords.
6. Cookies.
7. Tokens.
8. Private keys.
9. Browser profiles.
10. Proxy credentials.
11. Personal production data.
12. Real external data.
13. Customer/private operational data.

## 8. Artifact rules

Use `artifact` as the canonical term.

The Dummy Worker may register only dummy artifacts.

Dummy artifacts must be:

1. Synthetic.
2. Non-sensitive.
3. Reviewable.
4. Safe to store as metadata.
5. Aligned with `schemas/automation/artifact.schema.json`.

Dummy artifacts must not include real external data, customer data, credentials, or private operational data.

## 9. Acceptance

The Dummy Worker specification is accepted only if it proves that the platform can orchestrate a job safely without real external automation.

Acceptance requires:

1. Dummy Worker is explicitly Phase 0.
2. Dummy Worker is explicitly simulation-only.
3. Job lifecycle is referenced.
4. Worker runtime spec is referenced.
5. OpenAPI contract is referenced.
6. Canonical schemas are referenced.
7. All real external automation is forbidden.
8. Safe dummy scenarios are defined.
9. Test case registry review is possible.
10. No runtime code is included.
11. No migration is included.
12. No secret is included.
13. No real integration is introduced.

## 10. Final rule

The Dummy Worker is a safe simulation module for Phase 0 only.

If a task asks the Dummy Worker to touch a real external platform, real credentials, real browser automation, real scraping, real sending, AI/OCR/STT, proxy/account automation, production systems, or database migrations, the task must stop and escalate.
