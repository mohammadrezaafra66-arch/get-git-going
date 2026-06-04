# Job Lifecycle — Phase 0 Dummy Jobs

This document defines the canonical Phase 0 dummy-job lifecycle for Afra Automation.

The lifecycle is a safe state machine for dummy jobs only. It does not authorize real bots, real scraping, real sending, OCR/STT, AI/LLM pipelines, browser automation, proxy/account automation, production integrations, migrations, SQL triggers, or external job types.

## 1. Purpose

The purpose of this lifecycle is to define how a dummy job moves through safe, observable states during Phase 0.

It supports future contract design for:

1. Job creation.
2. Worker claim or simulated claim.
3. Running state.
4. Heartbeat monitoring.
5. Progress update.
6. Log append.
7. Checkpoint save/read.
8. Artifact registration.
9. Retry behavior.
10. Pause, cancel, fail, and success semantics.
11. Recovery assumptions for stale workers.

Phase 0 uses this lifecycle to test the platform foundation without calling any real external platform.

## 2. Canonical states

The canonical Phase 0 dummy-job states are:

1. `PENDING`
2. `CLAIMED`
3. `RUNNING`
4. `PAUSED`
5. `SUCCEEDED`
6. `FAILED`
7. `CANCELLED`
8. `RETRY_WAITING`

No additional state may be introduced without updating this document and the relevant schema/contract references.

## 3. State definitions

### 3.1 `PENDING`

The job exists and is waiting to be claimed.

A `PENDING` job has not been assigned to a worker runtime.

### 3.2 `CLAIMED`

The job has been assigned to a specific worker runtime or simulated worker runtime.

A `CLAIMED` job is not yet actively executing.

### 3.3 `RUNNING`

The worker is actively executing or simulating execution of the dummy job.

A `RUNNING` job should produce heartbeat and may produce logs, progress, checkpoints, and artifacts.

### 3.4 `PAUSED`

The job is intentionally paused and may be resumed later.

A `PAUSED` job is recoverable. It is not terminal.

### 3.5 `SUCCEEDED`

The job completed successfully.

`SUCCEEDED` is terminal.

### 3.6 `FAILED`

The job ended with an error that should not be retried automatically without a new decision.

`FAILED` is terminal unless a later approved recovery process creates a new job or explicitly requeues it according to a documented rule.

### 3.7 `CANCELLED`

The job was intentionally stopped before successful completion.

`CANCELLED` is terminal.

### 3.8 `RETRY_WAITING`

The job is waiting before a retry attempt.

`RETRY_WAITING` is recoverable. It must record why retry is needed, what retry count applies, and what checkpoint or context should be used before the next attempt.

## 4. State categories

| Category | States | Meaning |
|---|---|---|
| Initial | `PENDING` | The job is created and waiting for claim. |
| Active | `CLAIMED`, `RUNNING` | The job is assigned or executing. |
| Paused / recoverable | `PAUSED`, `RETRY_WAITING` | The job is not executing now but may continue later. |
| Terminal | `SUCCEEDED`, `FAILED`, `CANCELLED` | The job has reached a final state and must not continue without an explicit new process. |

## 5. Transition ownership

A transition may be triggered by one of three actor types.

### 5.1 Control plane / operator

The control plane or operator may:

1. Create a dummy job.
2. Pause a job.
3. Resume a job.
4. Cancel a job.
5. Request retry through an approved command.
6. Review failed jobs.

### 5.2 Worker runtime

The worker runtime may:

1. Claim or simulate claiming a dummy job.
2. Move a claimed job to running.
3. Emit heartbeat.
4. Append logs.
5. Save checkpoints.
6. Register artifacts.
7. Mark success.
8. Mark failure.
9. Enter retry waiting when a safe retry is required.
10. Stop safely when requested.

### 5.3 Recovery procedure

A recovery procedure may:

1. Detect a stale heartbeat.
2. Mark a job as recoverable when allowed.
3. Move a job to `RETRY_WAITING` when retry conditions are met.
4. Escalate a job to manual review.
5. Mark a job as failed when recovery is not safe.

Phase 0 only documents these assumptions. It does not implement production recovery automation.

## 6. Allowed transitions

| From | To | Triggered by | Conditions / notes |
|---|---|---|---|
| none | `PENDING` | Control plane / operator | Dummy job is created or defined. |
| `PENDING` | `CLAIMED` | Worker runtime | Worker claims or simulates claim. Must record worker identity and timestamp. |
| `CLAIMED` | `RUNNING` | Worker runtime | Worker starts dummy execution. Must be observable. |
| `CLAIMED` | `CANCELLED` | Control plane / operator | Operator cancels before running. Must record reason. |
| `CLAIMED` | `FAILED` | Worker runtime or recovery procedure | Claim cannot proceed safely. Must record reason. |
| `RUNNING` | `PAUSED` | Control plane / operator or worker runtime | Pause requested or safe pause condition reached. Checkpoint should be saved when available. |
| `RUNNING` | `SUCCEEDED` | Worker runtime | Dummy work completed successfully. Artifacts/log context may be linked when relevant. |
| `RUNNING` | `FAILED` | Worker runtime or recovery procedure | Non-retryable error or unsafe state. Must record reason and checkpoint context when available. |
| `RUNNING` | `CANCELLED` | Control plane / operator or worker runtime | Cancel requested and safe stop completed. Must record reason. |
| `RUNNING` | `RETRY_WAITING` | Worker runtime or recovery procedure | Retryable failure detected. Must record reason, retry count, checkpoint reference, and next retry condition. |
| `PAUSED` | `RUNNING` | Control plane / operator and worker runtime | Resume approved. Worker continues from checkpoint when available. |
| `PAUSED` | `CANCELLED` | Control plane / operator | Operator cancels paused job. Must record reason. |
| `PAUSED` | `FAILED` | Control plane / operator or recovery procedure | Paused job cannot safely resume. Must record reason. |
| `RETRY_WAITING` | `CLAIMED` | Worker runtime or recovery procedure | Retry window reached and worker claims job again. Must not duplicate completed artifacts. |
| `RETRY_WAITING` | `CANCELLED` | Control plane / operator | Operator cancels before retry. Must record reason. |
| `RETRY_WAITING` | `FAILED` | Recovery procedure | Retry limit exceeded or retry no longer safe. Must record reason. |

Terminal states must not transition to another state inside the same job lifecycle unless a later approved recovery procedure explicitly defines a new job or a controlled requeue process.

## 7. Illegal transitions

Any transition not listed in the allowed-transitions table is illegal.

Illegal transitions must be rejected or escalated.

Examples of illegal transitions:

1. `PENDING` to `RUNNING` without `CLAIMED`.
2. `PENDING` to `SUCCEEDED`.
3. `SUCCEEDED` to `RUNNING`.
4. `FAILED` to `RUNNING` without a new approved recovery process.
5. `CANCELLED` to `RUNNING`.
6. `RETRY_WAITING` to `SUCCEEDED` without execution.
7. `PAUSED` to `SUCCEEDED` without resuming or completing through an approved path.

Illegal transition attempts must record enough context for review, but must not expose secrets.

## 8. Heartbeat and stale-worker assumptions

A worker in `RUNNING` state should emit heartbeat according to the Worker Runtime specification.

Heartbeat concepts are defined with reference to:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `schemas/automation/worker-heartbeat.schema.json`

Stale heartbeat means the last worker heartbeat is older than the accepted threshold for the job or worker class.

Phase 0 assumptions:

1. Stale heartbeat detection is a design requirement.
2. Stale heartbeat recovery must be safe and idempotent.
3. Stale heartbeat does not automatically prove job failure.
4. A stale job may move to `RETRY_WAITING`, `FAILED`, or manual review only according to documented recovery rules.
5. Phase 0 does not require production stale-worker automation.

## 9. Retry behavior

`RETRY_WAITING` is entered only when the job failed in a way that is considered retryable.

Before entering `RETRY_WAITING`, the system must record:

1. Timestamp.
2. Actor.
3. Reason.
4. Retry count.
5. Last known state.
6. Checkpoint reference when available.
7. Related log context when available.
8. Related artifact context when relevant.

A retry must not duplicate:

1. Completed terminal states.
2. Registered artifacts.
3. Completed irreversible work.
4. Log entries that are meant to be unique.
5. Checkpoint records without idempotency rules.

In Phase 0, retry behavior applies only to dummy jobs.

## 10. Pause semantics

A paused job is intentionally stopped but recoverable.

When entering `PAUSED`, the system should record:

1. Timestamp.
2. Actor.
3. Reason.
4. Current progress.
5. Checkpoint reference when available.
6. Worker identity when available.

A paused job may resume only through an approved control-plane/operator action and worker continuation path.

## 11. Cancel semantics

A cancelled job is intentionally stopped and terminal.

When entering `CANCELLED`, the system must record:

1. Timestamp.
2. Actor.
3. Reason.
4. Last known status.
5. Checkpoint reference when available.
6. Related log context when available.

A cancelled job must not resume inside the same job lifecycle.

## 12. Fail semantics

A failed job is terminal unless a later approved recovery process creates a new job or explicitly requeues it.

When entering `FAILED`, the system must record:

1. Timestamp.
2. Actor.
3. Reason.
4. Error category when available.
5. Last checkpoint reference when available.
6. Related logs when available.
7. Related artifacts when relevant.

Failure must not expose secrets in logs, reasons, or metadata.

## 13. Success semantics

A succeeded job is terminal.

When entering `SUCCEEDED`, the system must record:

1. Timestamp.
2. Actor.
3. Completion reason or summary.
4. Final progress.
5. Artifact references when relevant.
6. Related log context when relevant.

A succeeded job must not be retried or resumed.

## 14. Required recorded metadata

Every transition should record metadata conceptually sufficient for audit and recovery.

Required metadata concepts:

1. Transition timestamp.
2. Actor type.
3. Actor identifier when safe.
4. Previous state.
5. New state.
6. Reason.
7. Worker id when relevant.
8. Checkpoint reference when relevant.
9. Artifact reference when relevant.
10. Linked log context when relevant.
11. Retry count when relevant.
12. Correlation or trace id when available.

Metadata must not contain secrets, tokens, passwords, cookies, private keys, browser profiles, or private production credentials.

## 15. Runbook and testing references

Operational handling must be documented through:

1. `docs/automation/05_security_ops/RUNBOOK.md`
2. `docs/automation/05_security_ops/TESTING_STRATEGY.md`
3. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`

The runbook should explain how operators interpret dummy-job states.

The testing strategy and test case registry should verify allowed transitions, illegal transitions, retry behavior, checkpoint behavior, heartbeat behavior, and artifact registration.

## 16. Contract references

This lifecycle must remain aligned with:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `openapi/automation-v1.yaml`
3. `schemas/automation/job.schema.json`
4. `schemas/automation/worker-heartbeat.schema.json`
5. `schemas/automation/artifact.schema.json`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

## 17. What this lifecycle does not authorize

This lifecycle does not authorize:

1. Runtime code.
2. Database migrations.
3. SQL triggers.
4. Real bots.
5. Real scraping.
6. Real sending.
7. OCR/STT.
8. AI/LLM pipelines.
9. Browser automation.
10. Proxy/account automation.
11. Production job types.
12. Real external integrations.
13. Real credentials or environment values.

## 18. Final rule

This lifecycle is for Phase 0 dummy jobs only.

If a transition, state, job type, or recovery behavior would require real external automation, production execution, migration, secret handling, or implementation code, it is outside this lifecycle and must be blocked until a later approved ADR and task packet allow it.
