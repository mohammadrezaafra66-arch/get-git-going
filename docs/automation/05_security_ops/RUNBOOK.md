# Operational Runbook — Afra Automation Phase 0

This runbook covers Phase 0 documentation, contract, schema, and dummy-worker operations only.

It does not cover real bots, real scraping, real sending, OCR/STT, AI/LLM pipelines, browser automation, proxy/account automation, production deployment, production integrations, or live external platform incidents.

## 1. Scope

This runbook is for:

1. Phase 0 documentation operations.
2. Phase 0 contract and schema review.
3. Dummy-worker-only preparation.
4. Safe dummy job lifecycle handling.
5. Documentation-level recovery and escalation.

This runbook is not a production automation operations manual.

Relevant references:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
4. `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`
5. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
6. `docs/automation/05_security_ops/TESTING_STRATEGY.md`
7. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`
8. `docs/automation/05_security_ops/SECRETS_POLICY.md`

## 2. Before you act

Before taking any action, confirm:

1. The task is labeled `PHASE-0`.
2. The task does not require real automation.
3. The task does not involve real bots.
4. The task does not involve real scraping.
5. The task does not involve real sending.
6. The task does not involve OCR/STT execution.
7. The task does not involve AI/LLM execution.
8. The task does not involve browser automation.
9. The task does not involve proxy/account automation.
10. The task does not involve production integration.
11. The task does not require migration unless separately approved.
12. The task does not require secret handling except policy-based escalation.
13. The task has a clear file boundary.
14. The task has a review path.

If any item is unclear, stop and escalate before continuing.

## 3. Procedure: dummy worker unavailable

### 3.1 What to check

1. Check the last known dummy worker status.
2. Check the last heartbeat timestamp if heartbeat records exist.
3. Check whether a dummy job was assigned.
4. Check whether the assigned job is terminal or recoverable under `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`.
5. Check whether the unavailable worker affects only the dummy flow.

### 3.2 What not to do

1. Do not start real automation.
2. Do not create a production worker workaround.
3. Do not manually edit database rows without an approved procedure.
4. Do not add runtime code in response to the incident.
5. Do not add secrets to recover the worker.

### 3.3 When to escalate

Escalate if:

1. Worker unavailability reveals a contract gap.
2. Worker unavailability suggests stale heartbeat handling is unclear.
3. Worker state cannot be reconciled with job lifecycle rules.
4. A secret or private value appears in logs or configuration.

### 3.4 What record/template to create

Create an incident record using `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md` if the issue blocks Phase 0 acceptance or exposes a process gap.

Create a postmortem using `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md` if the same issue repeats or affects acceptance criteria.

## 4. Procedure: stale heartbeat

### 4.1 What to check

1. Identify the worker id.
2. Identify the related dummy job id, if any.
3. Check the last heartbeat timestamp.
4. Check the job state.
5. Check whether the job is `RUNNING`, `CLAIMED`, `PAUSED`, `RETRY_WAITING`, or terminal.
6. Check the latest log context.
7. Check the latest checkpoint reference.

### 4.2 What not to do

1. Do not assume stale heartbeat automatically means failure.
2. Do not move terminal jobs back to active states.
3. Do not retry without a recorded reason.
4. Do not duplicate artifacts.
5. Do not edit state outside the documented lifecycle.

### 4.3 When to escalate

Escalate if:

1. The stale heartbeat state cannot be mapped to an allowed lifecycle transition.
2. The stale worker may have written incomplete checkpoint or artifact data.
3. There is no safe recovery decision.
4. The same stale heartbeat issue repeats.

### 4.4 What record/template to create

Record an incident if stale heartbeat blocks testing.

Add a test case to `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md` if stale heartbeat behavior is missing from tests.

## 5. Procedure: dummy job stuck

### 5.1 What to check

1. Check the job status.
2. Check the latest progress update.
3. Check the latest heartbeat.
4. Check the latest log entry.
5. Check the latest checkpoint reference.
6. Check whether the job is in an allowed active or recoverable state.

### 5.2 What not to do

1. Do not force a terminal state without reason.
2. Do not skip the lifecycle rules.
3. Do not duplicate job records.
4. Do not create a new hidden job path.
5. Do not add real automation to reproduce the issue.

### 5.3 When to escalate

Escalate if:

1. The job is stuck in a state not covered by the lifecycle.
2. There is no allowed transition from the current state.
3. The job cannot be cancelled, paused, failed, or retried safely.
4. The stuck state reveals a missing contract requirement.

### 5.4 What record/template to create

Create an incident record if the stuck job blocks dummy E2E testing.

Create or update a test case for stuck-job behavior in `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`.

## 6. Procedure: safe pause or cancel decision

### 6.1 What to check

1. Check current job state.
2. Check whether pause or cancel is an allowed transition.
3. Check whether a checkpoint exists.
4. Check whether the worker is alive.
5. Check whether the action is operator-requested or recovery-requested.
6. Check whether the action requires audit in the future design.

### 6.2 What not to do

1. Do not pause a terminal job.
2. Do not cancel without recording a reason.
3. Do not resume a cancelled job.
4. Do not use pause or cancel to hide an unclear failure.
5. Do not manually rewrite history.

### 6.3 When to escalate

Escalate if:

1. The lifecycle does not allow the requested transition.
2. The operator reason is missing.
3. The job state is inconsistent.
4. There is disagreement about whether the job is recoverable.

### 6.4 What record/template to create

If the pause/cancel decision is part of an incident, create an incident record.

If the decision reveals unclear lifecycle semantics, update testing requirements and create a follow-up Task Packet.

## 7. Procedure: retry-wait decision

### 7.1 What to check

1. Confirm the error is retryable.
2. Confirm retry count.
3. Confirm retry reason.
4. Confirm latest checkpoint reference.
5. Confirm latest artifact context.
6. Confirm latest log context.
7. Confirm no terminal state has already been recorded.

### 7.2 What not to do

1. Do not retry terminal jobs.
2. Do not retry without reason.
3. Do not retry without preserving checkpoint context.
4. Do not duplicate artifacts.
5. Do not retry indefinitely.
6. Do not add real external calls to test retry behavior.

### 7.3 When to escalate

Escalate if:

1. Retry count is unknown.
2. Checkpoint state is ambiguous.
3. Artifact duplication risk exists.
4. The retry decision is not covered by the lifecycle.
5. Retry behavior is missing from test cases.

### 7.4 What record/template to create

Record the retry decision in the incident record if it is part of an incident.

Add a retry test case to `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md` if missing.

## 8. Procedure: local network interruption

### 8.1 What to check

1. Confirm the issue is local network interruption.
2. Check whether the dummy worker can still preserve local state.
3. Check whether heartbeat has become stale.
4. Check whether checkpoint behavior is documented.
5. Check whether the job is active, paused, retry waiting, or terminal.

### 8.2 What not to do

1. Do not aggressively retry without backoff design.
2. Do not mark the job failed immediately unless lifecycle rules require it.
3. Do not switch to a real external platform workaround.
4. Do not add production networking instructions in Phase 0.
5. Do not expose private endpoints in documentation.

### 8.3 When to escalate

Escalate if:

1. Network interruption corrupts dummy state.
2. Recovery behavior is undefined.
3. Heartbeat behavior is ambiguous.
4. The issue affects acceptance testing.

### 8.4 What record/template to create

Create an incident record if the interruption blocks testing or reveals a design gap.

Add or update test cases for local interruption recovery.

## 9. Procedure: power interruption

### 9.1 What to check

1. Check last known job status.
2. Check last heartbeat.
3. Check latest checkpoint.
4. Check latest log context.
5. Check whether any artifact was registered before interruption.
6. Check whether the job can safely resume under lifecycle rules.

### 9.2 What not to do

1. Do not restart real automation.
2. Do not assume the job succeeded.
3. Do not assume the job failed without state review.
4. Do not duplicate artifacts.
5. Do not manually edit state without approved procedure.

### 9.3 When to escalate

Escalate if:

1. Checkpoint state is missing or inconsistent.
2. Artifact registration is ambiguous.
3. Job state cannot be reconciled.
4. The same interruption scenario is not covered by testing.

### 9.4 What record/template to create

Create an incident record if power interruption blocks dummy E2E verification.

Create a postmortem if the same issue repeats.

## 10. Procedure: contract/schema mismatch

### 10.1 What to check

1. Identify the contract or schema involved.
2. Check `openapi/automation-v1.yaml` if the API contract is involved.
3. Check JSON schemas if payload shape is involved.
4. Check `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`.
5. Check `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`.
6. Check whether tests cover the mismatch.

### 10.2 What not to do

1. Do not change schema casually.
2. Do not change OpenAPI and schema in conflicting ways.
3. Do not update runtime behavior to match an unapproved contract.
4. Do not add real external job examples.
5. Do not bypass validation expectations.

### 10.3 When to escalate

Escalate if:

1. Contract and schema disagree.
2. Worker README and contract docs disagree.
3. Artifact naming conflicts with the canonical artifact contract.
4. The mismatch affects Phase 0 acceptance criteria.

### 10.4 What record/template to create

Create a follow-up Task Packet for contract alignment.

Add a test case to the Test Case Registry for the mismatch.

## 11. Procedure: accidental secret exposure escalation

### 11.1 What to check

1. Identify where the suspected secret appeared.
2. Determine whether it is a real secret or secret-like placeholder.
3. Check whether it appears in docs, examples, commits, PR text, logs, artifacts, or screenshots.
4. Check `docs/automation/05_security_ops/SECRETS_POLICY.md`.

### 11.2 What not to do

1. Do not paste the secret into chat.
2. Do not copy the secret into an issue or PR comment.
3. Do not continue related work.
4. Do not try to hide the value with partial edits only.
5. Do not provide bypass instructions for secret scanning.

### 11.3 When to escalate

Escalate immediately if the value may be real.

### 11.4 What record/template to create

Create an incident record using `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`.

Create a postmortem if the value reached Git history, a PR, logs, artifacts, or a shared channel.

Secret rotation or revocation must be handled by the owner outside this repository workflow.

## 12. Procedure: migration failure escalation

### 12.1 What to check

1. Confirm whether a migration was actually involved.
2. Check whether the migration was approved.
3. Check the documented rollback plan.
4. Check `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`.
5. Check whether the migration affected RLS/RBAC, audit, or sensitive data.

### 12.2 What not to do

1. Do not run a second migration attempt blindly.
2. Do not manually edit production data.
3. Do not invent SQL fixes in this runbook.
4. Do not continue deployment until owner review.
5. Do not hide the failure in documentation.

### 12.3 When to escalate

Escalate immediately if:

1. A migration failed.
2. A migration was unapproved.
3. A migration affected sensitive tables.
4. A migration affected RLS/RBAC.
5. Rollback is unclear.

### 12.4 What record/template to create

Create an incident record.

Create a postmortem if the migration reached shared, LAN, staging, or production-like state.

## 13. Escalation

Escalate to the repository owner/admin reviewer when:

1. Phase boundaries are unclear.
2. A secret may be exposed.
3. A migration is involved.
4. RLS/RBAC impact is unclear.
5. Worker lifecycle state is inconsistent.
6. Contract and schema disagree.
7. Dummy E2E cannot proceed safely.
8. Real automation appears in a Phase 0 task.
9. Production behavior is requested.
10. The same incident repeats.

Use:

1. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
2. `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`

## 14. Not covered here

This runbook does not cover:

1. Real Divar incidents.
2. Real WhatsApp incidents.
3. Real Instagram incidents.
4. Real Torob incidents.
5. Real Google Maps incidents.
6. OCR/STT production incidents.
7. AI/LLM production incidents.
8. Browser automation incidents.
9. Proxy/account automation incidents.
10. Production scraping incidents.
11. Production sending incidents.
12. Production worker deployment incidents.
13. External platform compliance incidents.
14. Live production integration recovery.

All of these are outside Phase 0 and require later approved runbooks before implementation.

## 15. Final rule

If the situation requires runtime code, real automation, live production access, undocumented SQL edits, secrets, or external platform behavior, stop. This Phase 0 runbook does not authorize that action.
