# Test Case Registry — Afra Automation Phase 0

This is the canonical Phase 0 test case registry.

It tracks tests for scope safety, documentation readiness, contracts, schemas, job lifecycle, security, operations, and safe dummy-flow readiness.

The registry is for Phase 0 dummy-only validation. It must not contain real execution logs, production data, secrets, real bot results, real scraping evidence, real sending evidence, or sensitive operational data.

Related references:

1. `docs/automation/05_security_ops/TESTING_STRATEGY.md`
2. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
3. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
4. `docs/automation/05_security_ops/RUNBOOK.md`
5. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
6. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`
7. `schemas/automation/artifact.schema.json`

## Status vocabulary

Allowed status values:

| Status | Meaning |
|---|---|
| `TODO` | Test case is defined but not ready to execute. |
| `READY` | Test case is ready to execute or review. |
| `PASS` | Test passed with recorded evidence. |
| `FAIL` | Test was performed and failed. Evidence and follow-up are required. |
| `BLOCKED` | Test cannot proceed because a prerequisite is missing. |
| `NOT_APPLICABLE` | Test does not apply to a specific PR or task; reason must be recorded. |

Do not mark a test `PASS` without evidence.

## Registry

| ID | Area | Title | Expected result | Status | Evidence / notes |
|---|---|---|---|---|---|
| TC-0-001 | Scope | Phase label correctness | Task Packet and PR use a valid label: `BASELINE`, `PHASE-0`, `PHASE-1`, or `FUTURE`; unclear tasks are `BLOCKED` or `FUTURE`. | TODO | Link PR/task packet. |
| TC-0-002 | Scope | Phase 0 scope guard | Phase 0 task is documentation, contract, schema, worker skeleton, or dummy-flow only. | TODO | Confirm against project scope and phase label policy. |
| TC-0-003 | Scope | No real automation in Phase 0 | No real bot, scraping, sending, OCR/STT, AI, browser automation, proxy/account automation, or production integration is present. | TODO | Reference PR diff review. |
| TC-0-004 | Secrets | No-secret repository check | No API key, password, service key, service role key, JWT secret, cookie, token, certificate, dump, backup, production `.env`, browser profile, or proxy credential is present. | TODO | Link security review notes. |
| TC-0-005 | Secrets | `.env.example` placeholder-only check | `.env.example` files contain only empty or obvious fake placeholder values. | TODO | Link file paths checked. |
| TC-0-006 | Contracts | Worker Runtime spec completeness | `WORKER_RUNTIME_SPEC.md` defines actor model, dummy-only scope, required behavior, non-goals, artifact terminology, and canonical references. | TODO | Link doc review. |
| TC-0-007 | Contracts | OpenAPI placeholder readiness | `openapi/automation-v1.yaml` exists, is safe, and does not imply production automation. | TODO | Link OpenAPI review. |
| TC-0-008 | Schemas | Job schema availability | `schemas/automation/job.schema.json` exists and aligns with Phase 0 dummy-job contract. | TODO | Link schema review. |
| TC-0-009 | Schemas | Worker heartbeat schema availability | `schemas/automation/worker-heartbeat.schema.json` exists and aligns with heartbeat expectations. | TODO | Link schema review. |
| TC-0-010 | Schemas | Artifact schema canonical check | `schemas/automation/artifact.schema.json` exists and is treated as the canonical artifact contract. | TODO | Link schema review. |
| TC-0-011 | Schemas | Plugin manifest schema availability | `schemas/automation/plugin-manifest.schema.json` exists and remains planning-only in Phase 0. | TODO | Link schema review. |
| TC-0-012 | Lifecycle | Canonical lifecycle statuses | `JOB_LIFECYCLE.md` defines all canonical statuses: `PENDING`, `CLAIMED`, `RUNNING`, `PAUSED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `RETRY_WAITING`. | TODO | Link lifecycle review. |
| TC-0-013 | Lifecycle | Allowed transition validity | Allowed transitions are documented and illegal transitions are rejected or escalated. | TODO | Link transition table review. |
| TC-0-014 | Lifecycle | Terminal state distinction | `SUCCEEDED`, `FAILED`, and `CANCELLED` are clearly terminal; `PAUSED` and `RETRY_WAITING` are recoverable. | TODO | Link lifecycle review. |
| TC-0-015 | Heartbeat | Heartbeat contract expectation | Heartbeat behavior is documented and aligned with worker runtime spec and heartbeat schema. | TODO | Link contract review. |
| TC-0-016 | Heartbeat | Stale-worker recovery assumption | Stale-heartbeat handling is documented as an assumption and does not invent production automation. | TODO | Link runbook/lifecycle review. |
| TC-0-017 | Logs | Log-safety expectation | Logs are expected to be structured, non-sensitive, and free of secrets or private data. | TODO | Link security review. |
| TC-0-018 | Checkpoints | Checkpoint expectation | Checkpoint save/read behavior is documented as safe, idempotent, and dummy-only. | TODO | Link worker runtime and runbook review. |
| TC-0-019 | Artifacts | Artifact registration expectation | Artifact registration is documented using `artifact` as canonical term and references `artifact.schema.json`. | TODO | Link artifact contract review. |
| TC-0-020 | Recovery | Pause behavior | Pause semantics are documented and recoverable only through allowed lifecycle transitions. | TODO | Link lifecycle/runbook review. |
| TC-0-021 | Recovery | Cancel behavior | Cancel semantics are documented as terminal and reason-recorded. | TODO | Link lifecycle/runbook review. |
| TC-0-022 | Recovery | Retry-wait behavior | `RETRY_WAITING` behavior records reason, retry count, checkpoint reference, and avoids duplicate artifacts. | TODO | Link lifecycle/runbook review. |
| TC-0-023 | Operations | Runbook availability | `docs/automation/05_security_ops/RUNBOOK.md` exists and covers dummy-worker-only operational scenarios. | TODO | Link runbook review. |
| TC-0-024 | Operations | Incident template availability | `INCIDENT_STATE_TEMPLATE.md` exists and covers security, secrets, migration/RLS impact, and escalation fields. | TODO | Link template review. |
| TC-0-025 | Operations | Postmortem template availability | `POSTMORTEM_TEMPLATE.md` exists and is blameless, learning-focused, and action-oriented. | TODO | Link template review. |
| TC-0-026 | Migration | Migration/rollback gate | `MIGRATION_ROLLBACK.md` exists and Phase 0 changes do not include unapproved migrations. | TODO | Link migration review. |
| TC-0-027 | Environment | Environment matrix clarity | `ENVIRONMENT_MATRIX.md` clearly separates local, LAN, and production boundaries for Phase 0. | TODO | Link environment review. |
| TC-0-028 | Review | PR template gate | `.github/pull_request_template.md` includes Phase 0 scope, no-runtime, no-secret, no-migration, testing, and reviewer gates. | TODO | Link PR template review. |
| TC-0-029 | Release | Release checklist gate | `RELEASE_CHECKLIST.md` includes scope, contract, security, RLS/RBAC, migration, testing, environment, reviewer, and forbidden-work gates. | TODO | Link release checklist review. |
| TC-0-030 | Worker | Worker skeleton readiness | `afrakala-worker/` has README, `.env.example`, `src/`, and `tests` placeholders without runtime automation. | TODO | Link worker folder review. |
| TC-0-031 | Worker | Dummy Worker spec readiness | `DUMMY_WORKER_SPEC.md` defines only simulated dummy behavior and forbids real external calls. | TODO | Link module spec review. |
| TC-0-032 | E2E | Safe dummy E2E readiness | Safe dummy E2E flow is defined as create/claim/heartbeat/log/progress/checkpoint/artifact/final-status only. | TODO | Link requirements and acceptance review. |
| TC-0-033 | Forbidden work | Real bot exclusion | PR contains no real Divar, WhatsApp, Instagram, Torob, Google Maps, Telegram, Rubika, Bale, or SMS runtime integration. | TODO | Link PR diff review. |
| TC-0-034 | Forbidden work | Runtime code exclusion | Phase 0 PR contains no runtime code unless separately approved for dummy-only implementation. | TODO | Link PR diff review. |
| TC-0-035 | Source of truth | Source-of-truth discipline | Supabase/PostgreSQL remains source of truth; local files, Excel, Google Sheets, SQLite, and JSON are not promoted to platform authority. | TODO | Link ADR-003 review. |

## Evidence rules

Each completed test must include:

1. Test case ID.
2. Date.
3. Tester.
4. Result.
5. Notes.
6. Linked PR.
7. Linked Task Packet.
8. Related document or schema path.

Do not fabricate evidence.

Do not mark `PASS` based on assumption.

If the evidence is missing, use `BLOCKED` or keep the case as `TODO`.

## Traceability rule

Every Phase 0 acceptance area must map to at least one test case in this registry.

If a new Phase 0 requirement, contract, schema, runbook rule, or release gate is added, this registry must be updated or a follow-up Task Packet must be created.

## Final rule

This registry validates Phase 0 foundation readiness only.

If a test requires real bots, real scraping, real sending, OCR/STT, AI/LLM, browser automation, proxy/account automation, production credentials, or production integration, it is not a Phase 0 test and must be blocked or reclassified as future work.
