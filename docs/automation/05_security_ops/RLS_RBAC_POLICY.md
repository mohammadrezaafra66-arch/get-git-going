# RLS / RBAC Policy — Afra Automation Phase 0

This document defines the Phase 0 access-control design policy for future Afra Automation data.

It is a design policy only. It does not authorize database migrations, live RLS policy rollout, runtime worker access, real bots, production integrations, or privileged browser access.

## 1. Purpose

The purpose of this policy is to make sure automation data is designed with proper access control before any database change is made.

Automation work will eventually involve jobs, workers, heartbeats, logs, checkpoints, artifacts, and plugin metadata. These records can become operationally sensitive. They must not be added casually without access-control design.

This policy aligns with:

1. `docs/automation/05_security_ops/SECURITY_BASELINE.md`
2. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
3. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`
4. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
5. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
6. `schemas/automation/job.schema.json`
7. `schemas/automation/worker-heartbeat.schema.json`
8. `schemas/automation/artifact.schema.json`
9. `schemas/automation/plugin-manifest.schema.json`

## 2. Why frontend-only authorization is insufficient

Frontend-only authorization is not a security boundary.

A UI can hide buttons, menus, routes, and controls, but that does not protect the database or server-side actions by itself.

Sensitive automation capabilities require layered authorization:

1. UI guard for usability and operator experience.
2. Server-side permission check for trusted action boundaries.
3. Database-level RLS/RBAC or equivalent backend access control for data protection.
4. Auditability for sensitive actions.

A browser user must never receive privileged keys or direct privileged access.

## 3. Source of truth

Supabase/PostgreSQL remains the source of truth.

Before any automation data is added, the project must define:

1. Which actors can read the data.
2. Which actors can write the data.
3. Which writes require server-side mediation.
4. Which operations require audit logging.
5. Which data is visible to operators.
6. Which data is internal-only.
7. Which data must never be exposed to browser code.

No automation table may be added until its access-control design, rollback plan, and acceptance criteria are approved.

## 4. Actor categories

### 4.1 `anon/public`

Unauthenticated or public access.

Default position:

1. No access to automation jobs.
2. No access to workers.
3. No access to heartbeats.
4. No access to logs.
5. No access to checkpoints.
6. No access to artifacts.
7. No access to plugin metadata.

Any exception requires explicit approval and documentation.

### 4.2 Authenticated operator user

A signed-in application user operating through the AfraKala UI.

Possible future access:

1. Read approved job status views.
2. Read approved worker status views.
3. Read safe logs or summaries.
4. Read artifact references when authorized.
5. Request allowed actions through the control plane.

Restrictions:

1. Must not receive service-role access.
2. Must not directly bypass server-side checks for sensitive commands.
3. Must not see secrets, credentials, private worker state, or sensitive internal details.

### 4.3 Privileged server-side actor

Trusted server-side code inside the existing `get-git-going` Control Plane/Core.

Possible future responsibilities:

1. Validate operator permissions.
2. Mediate sensitive commands.
3. Apply audit logging.
4. Issue safe job commands.
5. Read or write automation records according to approved policy.

Restrictions:

1. Must not expose service-role credentials to browser code.
2. Must not bypass audit expectations for sensitive actions.
3. Must not become a hidden parallel API layer.

### 4.4 Future worker runtime actor

A future worker process that performs approved background work through contracts.

Phase 0 position:

1. Dummy-worker only.
2. No real production worker access.
3. No real external integrations.
4. No distributed service-role access.

Future worker access must be scoped and mediated through approved contracts.

### 4.5 Repository owner/admin reviewer

The repository owner or approved admin reviewer controls sensitive architecture, security, and phase-boundary decisions.

Responsibilities:

1. Approve sensitive scope.
2. Review migration impact.
3. Review RLS/RBAC impact.
4. Review secrets risk.
5. Review worker access design.
6. Reject unsafe or unclear changes.

## 5. Core principles

### 5.1 Least privilege

Every actor receives the minimum access required for its role.

No actor should receive broad access by default.

### 5.2 Separation of worker and operator permissions

Operator users and worker runtime actors must have different permission models.

Operators request and observe work through the Control Plane/Core.

Workers perform approved background tasks through worker contracts.

### 5.3 Service role isolation

Service role access must stay server-side and must not be exposed to:

1. Browser code.
2. React components.
3. Lovable-generated UI.
4. Documentation examples.
5. Worker `.env.example` files.
6. Distributed worker machines during Phase 0.

### 5.4 Auditability

Sensitive actions must be auditable.

Examples:

1. Job creation.
2. Job cancellation.
3. Job retry.
4. Worker registration.
5. Worker disablement.
6. Permission changes.
7. Plugin/driver configuration changes.
8. Artifact deletion or retention changes.

### 5.5 No browser exposure of privileged access

The browser must not hold privileged keys.

The browser may display allowed data and send user requests to approved server-side paths, but it must not directly execute privileged automation actions.

### 5.6 Source-of-truth discipline

Access policies must protect Supabase/PostgreSQL as the source of truth.

Worker-local files, local JSON, SQLite, spreadsheets, and exports must not become the authority for platform state.

### 5.7 No parallel core or hidden side channel

Access control must not be bypassed by a hidden second API, second database, second admin panel, or direct worker side channel.

## 6. Automation data families requiring policy design

The following data families require policy design before migration.

### 6.1 Jobs

Policy design must define:

1. Read model: who can see job list, job detail, and job status.
2. Write model: who can create, update, cancel, retry, pause, or resume a job.
3. Actor ownership: operator, server-side actor, worker runtime, or recovery procedure.
4. Review path: owner review required for command behavior and sensitive job types.
5. Audit implications: job commands and terminal state changes should be auditable.

### 6.2 Workers

Policy design must define:

1. Read model: who can view workers and worker status.
2. Write model: who can register, disable, or update worker metadata.
3. Actor ownership: server-side actor and approved worker runtime.
4. Review path: security review required before worker registration is implemented.
5. Audit implications: worker registration, disablement, and permission changes should be auditable.

### 6.3 Heartbeats

Policy design must define:

1. Read model: who can view heartbeat status and stale-heartbeat signals.
2. Write model: which worker actor may write heartbeat records.
3. Actor ownership: worker runtime.
4. Review path: contract and security review required before live heartbeat writes.
5. Audit implications: heartbeat is operational telemetry; suspicious heartbeat gaps may require incident review.

### 6.4 Logs

Policy design must define:

1. Read model: who can view logs, summaries, or detailed logs.
2. Write model: which actor can append logs.
3. Actor ownership: worker runtime and server-side actor.
4. Review path: redaction review required before log storage.
5. Audit implications: logs must avoid secrets and may support incident review.

### 6.5 Checkpoints

Policy design must define:

1. Read model: who can inspect checkpoint references or checkpoint content.
2. Write model: which worker actor can save checkpoints.
3. Actor ownership: worker runtime.
4. Review path: security review required if checkpoint data could contain sensitive content.
5. Audit implications: checkpoint writes may be relevant to recovery and retry decisions.

### 6.6 Artifacts

Policy design must define:

1. Read model: who can see artifact metadata and artifact references.
2. Write model: which actor can register artifacts.
3. Actor ownership: worker runtime and server-side actor.
4. Review path: retention and sensitivity review required before artifact storage.
5. Audit implications: artifact registration, deletion, and retention changes should be auditable.

Use `schemas/automation/artifact.schema.json` as the canonical artifact contract.

### 6.7 Plugin metadata

Policy design must define:

1. Read model: who can see plugin/driver metadata.
2. Write model: who can add, update, disable, or approve plugin/driver metadata.
3. Actor ownership: repository owner/admin reviewer and privileged server-side actor.
4. Review path: ADR and security review required before real plugin/driver execution.
5. Audit implications: plugin metadata changes are sensitive and should be auditable.

## 7. Phase 0 default position

Phase 0 is design-only for RLS/RBAC.

This document does not authorize:

1. Database migrations.
2. Live policy rollout.
3. SQL policy implementation.
4. Runtime worker access.
5. Real external integrations.
6. Browser-side privileged access.
7. Service-role distribution to workers.

Before any automation data migration, the project must have:

1. Table design.
2. RLS/RBAC design.
3. Audit plan.
4. Migration/rollback plan.
5. Testing plan.
6. Owner approval.

## 8. Policy review triggers

A policy review is required if a future task proposes:

1. New automation table.
2. New automation column containing operational data.
3. New worker authentication method.
4. New job command.
5. New artifact storage behavior.
6. New checkpoint storage behavior.
7. New log storage behavior.
8. New plugin/driver registry behavior.
9. New RLS policy.
10. New RBAC role or permission.
11. New server-side privileged action.
12. New browser-visible automation data.
13. New migration affecting automation data.
14. Any change to service-role usage.

## 9. Forbidden patterns

The following are forbidden:

1. Browser-side use of privileged keys.
2. Copy-paste production SQL policies into Phase 0 docs as implementation.
3. Unapproved migrations.
4. Runtime automation bypassing the Control Plane/Core.
5. Worker direct writes without approved contract and access design.
6. Logs or checkpoints containing secrets.
7. Artifacts containing private data without approved policy.
8. Parallel API or database access path.
9. Frontend-only authorization for sensitive actions.
10. Service role keys in worker examples.

## 10. Review checklist

Before approving automation data design, reviewers must confirm:

1. Actor categories are identified.
2. Read model is defined.
3. Write model is defined.
4. Actor ownership is defined.
5. Review path is defined.
6. Audit implications are defined.
7. RLS/RBAC impact is documented.
8. Migration/rollback impact is documented.
9. Browser exposure risk is addressed.
10. Worker access risk is addressed.
11. Secret exposure risk is addressed.
12. Source-of-truth discipline is preserved.

## 11. Final rule

No automation data change may be implemented before access control is designed.

If a task cannot explain who may read, who may write, who owns the action, how it is audited, and how it avoids browser-side privileged access, the task is not ready.
