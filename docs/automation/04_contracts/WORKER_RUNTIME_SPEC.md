# Worker Runtime Specification — Phase 0

This document is the canonical Phase 0 Worker Runtime specification for Afra Automation.

Phase 0 is dummy-worker-only. This specification defines the future worker boundary, required contracts, and safe behavior expectations. It does not authorize real bots, scraping, sending, OCR/STT, AI/LLM pipelines, browser automation, proxy/account automation, production deployment, database migrations, or external integrations.

## 1. Purpose

The Worker Runtime is the future execution layer for Afra Automation jobs.

It must remain separate from the React/TanStack/Lovable UI. The UI is the operator panel. It may display job state, worker state, logs, checkpoints, artifacts, and controls after approved contracts exist, but it must not execute worker logic.

The existing `get-git-going` repository remains the Control Plane/Core.

Supabase/PostgreSQL remains the source of truth.

The Worker Runtime must eventually communicate with the Control Plane/Core through approved contracts, not through ad hoc scripts or hidden direct integrations.

## 2. Phase 0 scope

In Phase 0, the Worker Runtime scope is limited to dummy-worker behavior and contract design.

Allowed Phase 0 worker concepts:

1. Dummy worker identity.
2. Dummy job claim or simulated claim.
3. Dummy lease concept.
4. Dummy heartbeat.
5. Dummy progress update.
6. Dummy log append behavior.
7. Dummy checkpoint save/read behavior.
8. Dummy artifact registration.
9. Dummy success state.
10. Dummy failure state.
11. Dummy retry state.
12. Dummy pause state.
13. Dummy cancel state.
14. Safe stop behavior.

Phase 0 worker behavior must never call real external platforms.

## 3. Actor model

Phase 0 uses a minimum actor model with three roles.

### 3.1 Operator / Control Plane

The operator uses the existing `get-git-going` application as the Control Plane/Core.

Responsibilities:

1. Define or trigger dummy jobs in an approved safe way.
2. Read job status.
3. Read worker status.
4. Read heartbeat age.
5. Read logs.
6. Read checkpoint references.
7. Read artifact references.
8. Issue future approved stop, pause, resume, retry, or cancel commands through the contract.

### 3.2 Worker Runtime

The Worker Runtime is the future background execution layer.

In Phase 0, it is dummy-only.

Responsibilities:

1. Identify itself.
2. Claim or simulate claiming a dummy job.
3. Move a dummy job into running state.
4. Emit heartbeat.
5. Append safe logs.
6. Update progress.
7. Save and read checkpoints.
8. Register artifacts.
9. Report terminal states.
10. Stop safely when requested.

### 3.3 Database / Source of Truth

Supabase/PostgreSQL is the source of truth.

Responsibilities:

1. Store approved automation state after database design and migration approval.
2. Preserve job lifecycle state.
3. Preserve worker identity and heartbeat state.
4. Preserve log references.
5. Preserve checkpoint state.
6. Preserve artifact references.
7. Support RLS/RBAC and audit requirements.

In Phase 0, database design may be documented, but migrations must not be added unless separately approved.

## 4. Required runtime responsibilities

### 4.1 Worker identification

The worker must have a stable identity.

The identity must be safe to log and display. It must not contain secrets, tokens, cookies, passwords, service role keys, or private operational data.

### 4.2 Claim or simulated claim

The worker must eventually claim or simulate claiming a dummy job through the approved job contract.

Claim behavior must be idempotent. A repeated claim attempt must not corrupt job state.

### 4.3 Running state transition

After a successful dummy claim, the worker must transition the job into a running state according to `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`.

The transition must be explicit and observable.

### 4.4 Heartbeat emission

The worker must emit heartbeat while a dummy job is running.

Heartbeat data must be safe and non-sensitive.

Heartbeat behavior must support future stale-heartbeat detection by the Control Plane/Core.

### 4.5 Safe log append behavior

The worker must append structured logs.

Logs may include:

1. Timestamp.
2. Worker id.
3. Job id.
4. Event name.
5. Severity level.
6. Safe message.
7. Non-sensitive context.

Logs must not include secrets, tokens, cookies, credentials, passwords, private keys, browser profiles, customer private data, or production-only infrastructure details.

### 4.6 Progress update behavior

The worker must report progress in a safe, bounded, and idempotent way.

Progress updates must not imply real external work in Phase 0.

### 4.7 Checkpoint save/read behavior

The worker must be designed to save and read checkpoint state.

Checkpoint behavior must support future safe stop and resume behavior.

Checkpoint data must be minimal, safe, and free of secrets.

### 4.8 Artifact registration behavior

The worker must register artifacts using the canonical artifact contract.

Use the term `artifact` as the canonical term. Do not use `output` as the primary contract term.

The canonical artifact contract is `schemas/automation/artifact.schema.json`.

Phase 0 artifacts must be dummy artifacts only.

### 4.9 Terminal state reporting

The worker must report terminal state according to the approved job lifecycle.

Terminal states may include:

1. Succeeded.
2. Failed.
3. Cancelled.
4. Retry waiting.

Terminal state reporting must be idempotent and must not overwrite a final state incorrectly.

### 4.10 Safe stop behavior

The worker must support safe stop behavior.

Safe stop means:

1. Stop accepting new dummy work.
2. Write final safe log entry.
3. Save checkpoint when applicable.
4. Report status according to the job lifecycle.
5. Avoid corrupting job state.

## 5. Required non-functional rules

### 5.1 Idempotency

Worker operations must be safe to retry.

Repeated heartbeat, progress, log, checkpoint, artifact, or terminal-state operations must not corrupt source-of-truth state.

### 5.2 Retry safety

Retry behavior must be bounded and observable.

A retry must not create duplicate artifacts, duplicate terminal states, or inconsistent job status.

### 5.3 Stale-heartbeat detection assumptions

The Control Plane/Core must be able to detect stale workers through heartbeat age.

Phase 0 documents the assumption. It does not require production stale-worker automation unless explicitly approved by a later task.

### 5.4 No secret leakage in logs

Logs must never contain secrets or private operational values.

Forbidden in logs:

1. API keys.
2. Service role keys.
3. JWT secrets.
4. Cookies.
5. Tokens.
6. Passwords.
7. Private keys.
8. Browser profiles.
9. Proxy credentials.
10. Production-only infrastructure values.

### 5.5 No direct browser execution of worker logic

Worker logic must not run in the browser or inside React/Lovable UI.

The UI may display state and controls. It must not execute worker jobs.

### 5.6 No worker-side source-of-truth drift

Worker-local files, local JSON, local SQLite, and local artifacts may be temporary cache or local recovery support only when documented.

They must not become platform source of truth.

Supabase/PostgreSQL remains the source of truth.

## 6. Phase 0 non-goals

Phase 0 does not include:

1. Real bot execution.
2. Real scraping.
3. Real sending.
4. OCR/STT.
5. AI/LLM pipeline.
6. Browser automation.
7. Proxy/account automation.
8. Production deployment.
9. Production external integrations.
10. Real plugin/driver execution.
11. Database migration.
12. Service role distribution to workers.
13. Real credentials.
14. Real environment values.

## 7. Canonical contract dependencies

This specification depends on the following canonical contract files:

1. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
2. `openapi/automation-v1.yaml`
3. `schemas/automation/job.schema.json`
4. `schemas/automation/worker-heartbeat.schema.json`
5. `schemas/automation/artifact.schema.json`
6. `schemas/automation/plugin-manifest.schema.json`
7. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
8. `afrakala-worker/README.md`

The four canonical JSON schemas for Phase 0 worker contract design are:

1. `schemas/automation/job.schema.json`
2. `schemas/automation/worker-heartbeat.schema.json`
3. `schemas/automation/artifact.schema.json`
4. `schemas/automation/plugin-manifest.schema.json`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

## 8. Relationship to Plugin/Driver architecture

Future plugins and drivers may eventually run through the Worker Runtime after later approval.

In Phase 0:

1. Plugin/driver behavior may be documented.
2. Plugin/driver manifest shape may be drafted.
3. Real plugin/driver execution is forbidden.
4. Real external platform integrations are forbidden.
5. Driver logic must not be placed inside UI.

## 9. What this spec does not authorize

This specification does not authorize:

1. Runtime code.
2. Database migrations.
3. Real bots.
4. Real scraping.
5. Real sending.
6. OCR/STT pipelines.
7. AI/LLM pipelines.
8. Browser automation.
9. Proxy/account automation.
10. Production deployment.
11. Real external integrations.
12. Service role keys in worker config.
13. Production credentials.
14. Private infrastructure URLs.
15. Implementation instructions for real drivers.

## 10. Acceptance requirements for this spec

This specification is acceptable only if:

1. It states that Phase 0 is dummy-worker-only.
2. It keeps Worker Runtime separate from UI/Core.
3. It identifies `get-git-going` as the Control Plane/Core.
4. It identifies Supabase/PostgreSQL as the source of truth.
5. It uses `artifact` as the canonical term.
6. It references `JOB_LIFECYCLE.md`.
7. It references `openapi/automation-v1.yaml`.
8. It references all four canonical schemas.
9. It references `DUMMY_WORKER_SPEC.md`.
10. It references `afrakala-worker/README.md`.
11. It contains explicit required behaviors.
12. It contains explicit non-goals.
13. It contains no executable runtime code.
14. It contains no migration content.
15. It contains no secrets.
