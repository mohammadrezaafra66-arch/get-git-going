# Phase 0 Acceptance Criteria — Afra Automation

Phase 0 is not complete until every acceptance criterion in this document is met.

These criteria are mandatory pass/fail gates. A criterion is not accepted if it is unclear, partially complete, undocumented, or contradicted by repository changes.

## 1. Repository structure readiness

### AC-01 — Phase 0 branch exists

Pass if:

1. Phase 0 work is performed on an approved branch.
2. The branch targets `main` through a pull request.
3. The pull request is reviewable and scoped to Phase 0.

Fail if:

1. Phase 0 files are committed directly to `main` without approval.
2. The branch includes unrelated runtime implementation.

### AC-02 — Automation documentation structure exists

Pass if `docs/automation/` contains the approved Phase 0 folder structure:

1. `00_master/`
2. `01_product_scope/`
3. `02_phases/`
4. `03_architecture/`
5. `04_contracts/`
6. `05_security_ops/`
7. `06_team_delivery/`
8. `07_modules/`

Fail if:

1. Required folders are missing.
2. Documentation is scattered without a clear canonical location.
3. Real runtime code is mixed into documentation folders.

### AC-03 — Existing repository architecture is preserved

Pass if:

1. The existing `get-git-going` repository remains the Control Plane/Core.
2. Existing production modules are not rewritten.
3. Existing routes, tables, services, and modules are not duplicated.

Fail if:

1. A parallel core is created.
2. A parallel admin panel is created.
3. A parallel database or API layer is created.
4. Existing architecture is bypassed without an approved ADR.

## 2. Documentation readiness

### AC-04 — Required baseline documents are present

Pass if these files exist and are referenced by Phase 0 documents:

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/AUTOMATION_GAP_ANALYSIS.md`
6. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
7. `docs/automation/README.md`
8. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`

Fail if:

1. Phase 0 documents contradict baseline repository documents.
2. Phase 0 documents duplicate inventory instead of referencing canonical files.

### AC-05 — Phase 0 requirements are complete

Pass if `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md` defines:

1. Functional requirements.
2. Non-functional requirements.
3. Documentation requirements.
4. Data and contract requirements.
5. Worker and dummy requirements.
6. Security requirements.
7. Testing requirements.
8. Forbidden scope.
9. Requirement dependencies.
10. Definition of ready to implement the dummy flow.

Fail if:

1. Requirements are vague.
2. Requirements imply real bot implementation.
3. Requirements skip security, testing, or contract readiness.

## 3. Scope and phase control readiness

### AC-06 — Project scope is explicit

Pass if `docs/automation/01_product_scope/PROJECT_SCOPE.md` clearly states:

1. Phase 0 is foundation-only.
2. The existing repository remains the Control Plane/Core.
3. Lovable/React/TanStack is UI/operator layer only.
4. Supabase/PostgreSQL remains the source of truth.
5. Worker Runtime is separate and dummy-only in Phase 0.
6. Real automation is out of scope.

Fail if:

1. Scope allows real bots in Phase 0.
2. Scope allows parallel systems in Phase 0.
3. Scope is ambiguous about UI, database, or worker boundaries.

### AC-07 — Phase label policy is enforced

Pass if `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md` defines and explains:

1. `BASELINE`
2. `PHASE-0`
3. `PHASE-1`
4. `FUTURE`

Pass only if every Task Packet and pull request must include a phase label.

Fail if:

1. Phase labels are optional.
2. Unclear work can proceed without classification.
3. Real automation is not defaulted to `FUTURE` or `BLOCKED`.

## 4. ADR readiness

### AC-08 — Required ADRs exist

Pass if Phase 0 architecture decisions exist for:

1. Existing `get-git-going` repository as Control Plane/Core.
2. No Laravel core in Phase 0.
3. Supabase/PostgreSQL as source of truth.
4. Separate Python Worker Runtime.
5. No real bots in Phase 0.

Fail if:

1. Any required ADR is missing.
2. ADRs contradict the project scope.
3. Implementation starts before the relevant ADR exists.

### AC-09 — ADRs prevent duplication

Pass if ADRs block:

1. Parallel core.
2. Parallel database.
3. Parallel API.
4. Parallel admin panel.
5. Runtime automation inside UI.

Fail if:

1. ADRs allow duplicate architecture without review.
2. ADRs are written as vague notes instead of decisions.

## 5. OpenAPI and schema readiness

### AC-10 — OpenAPI placeholder exists

Pass if `openapi/automation-v1.yaml` exists and is reserved for the automation API contract.

Fail if:

1. OpenAPI is missing.
2. OpenAPI contains production credentials.
3. OpenAPI defines real external platform execution in Phase 0.

### AC-11 — Required JSON schemas exist

Pass if these files exist under `schemas/automation/`:

1. `job.schema.json`
2. `worker-heartbeat.schema.json`
3. `artifact.schema.json`
4. `plugin-manifest.schema.json`

Fail if:

1. Required schema files are missing.
2. Schema files are syntactically invalid.
3. Schema files include real secrets or private production values.

### AC-12 — Artifact schema is canonical

Pass if `schemas/automation/artifact.schema.json` is identified as the canonical artifact contract.

Fail if:

1. Another artifact schema is treated as canonical without an ADR.
2. Multiple artifact contracts conflict.

## 6. Database design readiness

### AC-13 — Automation table design is documented before migration

Pass if table design is documented for:

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

Fail if:

1. Migration is added before design approval.
2. Table design omits RLS/RBAC.
3. Table design omits rollback planning.

### AC-14 — No unapproved migration exists

Pass if:

1. No automation migration is included in Phase 0, or
2. Any migration is explicitly approved through migration safety review.

Fail if:

1. Migration SQL is added without approval.
2. Existing migrations are edited without approval.
3. Destructive migration appears in the PR.

## 7. RLS/RBAC and security readiness

### AC-15 — RLS/RBAC plan exists

Pass if future automation tables and sensitive commands have an RLS/RBAC plan before implementation.

Fail if:

1. Automation table design ignores RLS.
2. Worker command design ignores access control.
3. Frontend-only authorization is proposed for sensitive operations.

### AC-16 — Security baseline exists

Pass if Phase 0 security documents cover:

1. No real secrets in GitHub.
2. Placeholder-only `.env.example` values.
3. No service role key in worker config.
4. No production credentials.
5. No private operational data.
6. Feature flags for future external integrations.
7. Manual fallback expectations for future critical integrations.

Fail if:

1. Secrets are committed.
2. Service role keys are distributed to worker machines in Phase 0.
3. Production credentials or private endpoints appear in documentation or examples.

## 8. Worker Runtime skeleton readiness

### AC-17 — Worker skeleton exists

Pass if `afrakala-worker/` exists with:

1. `README.md`
2. `.env.example`
3. `src/`
4. `tests/`

Fail if:

1. The worker folder is missing.
2. Real runtime code is introduced without approval.
3. Worker config contains real secrets.

### AC-18 — Worker README defines Phase 0 boundaries

Pass if `afrakala-worker/README.md` explains:

1. Worker Runtime is future Python worker skeleton.
2. Phase 0 is dummy-only.
3. No real bots or external calls are allowed.
4. `.env.example` is placeholder-only.
5. Contracts and schemas are the source of future implementation rules.

Fail if:

1. README implies real automation already exists.
2. README provides instructions for real bot execution.

## 9. Dummy Worker specification readiness

### AC-19 — Dummy Worker spec exists

Pass if the Dummy Worker spec defines only simulated behavior for:

1. Job claim.
2. Heartbeat.
3. Progress update.
4. Log append.
5. Checkpoint save.
6. Artifact registration.
7. Final status.

Fail if:

1. Dummy Worker spec calls real external services.
2. Dummy Worker spec includes scraping, sending, browser automation, AI, OCR/STT, or proxy/account automation.

## 10. Safe dummy E2E flow readiness

### AC-20 — Dummy E2E flow is defined

Pass if the safe dummy E2E flow proves only:

1. Create or define a dummy job.
2. Claim or simulate claiming the dummy job.
3. Send or simulate heartbeat.
4. Write safe logs.
5. Update progress.
6. Save checkpoint.
7. Register dummy artifact.
8. Mark final status.
9. Read final status through approved contract.

Fail if:

1. The E2E flow requires real external platforms.
2. The E2E flow sends real messages.
3. The E2E flow scrapes real sites.
4. The E2E flow uses production credentials.

### AC-21 — Dummy flow is isolated

Pass if the dummy flow is clearly separated from future real modules.

Fail if:

1. Dummy flow is mixed with real module code.
2. Dummy flow creates reusable hidden runtime paths for real automation without review.

## 11. Testing and Test Case Registry readiness

### AC-22 — Test Case Registry exists

Pass if `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md` exists and can track Phase 0 tests.

Fail if:

1. There is no test case registry.
2. Tests are not traceable to acceptance criteria.

### AC-23 — Required test categories are defined

Pass if testing documentation covers:

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
11. Final status reporting.

Fail if:

1. Testing docs only say “test later.”
2. No pass/fail criteria are defined.

## 12. Runbook and incident/postmortem readiness

### AC-24 — Runbook exists

Pass if a Phase 0 automation runbook exists and covers dummy-worker preparation, safe operation, stop conditions, and recovery planning.

Fail if:

1. No runbook exists.
2. Runbook includes real production bot operations in Phase 0.

### AC-25 — Incident and postmortem templates exist

Pass if both templates exist:

1. Incident state template.
2. Postmortem template.

Fail if:

1. Templates are missing.
2. Templates encourage blame instead of learning and prevention.

## 13. PR and review readiness

### AC-26 — Pull request template enforces Phase 0 gates

Pass if `.github/pull_request_template.md` includes checks for:

1. Scope label.
2. No real bots.
3. No runtime code.
4. No migration.
5. No secrets.
6. No production integrations.
7. Testing or documentation-only verification.
8. Reviewer checklist.

Fail if:

1. PR template does not enforce Phase 0 boundaries.
2. PR template allows missing testing notes.

### AC-27 — CODEOWNERS exists

Pass if `CODEOWNERS` exists and routes review for Phase 0 paths.

Fail if:

1. CODEOWNERS is missing.
2. Sensitive paths have no owner.

### AC-28 — DoR and DoD exist

Pass if Definition of Ready and Definition of Done exist for Phase 0 work.

Fail if:

1. Tasks can start without readiness criteria.
2. Tasks can be delivered without done criteria.

## 14. Forbidden work check

### AC-29 — Hard rejection conditions

Reject Phase 0 if it contains any of the following:

1. Real bots.
2. Real scraping.
3. Real sending.
4. OCR/STT production pipeline.
5. AI/LLM production pipeline.
6. Browser automation.
7. Proxy/account automation.
8. Laravel core.
9. Parallel database.
10. Parallel API.
11. Parallel admin panel.
12. Real secrets.
13. Unapproved migrations.
14. Production worker deployment.
15. Production external integrations.
16. Runtime plugin execution.
17. Service role key distributed to worker machines.
18. Production credentials in examples or docs.

Fail if any item above exists, even if other criteria pass.

## 15. Final acceptance rule

Phase 0 is accepted only when:

1. Every acceptance category passes.
2. Every hard rejection condition is false.
3. The repository remains self-host safe.
4. The existing `get-git-going` repository remains the Control Plane/Core.
5. Supabase/PostgreSQL remains the source of truth.
6. React/TanStack/Lovable remains UI/operator layer only.
7. Worker Runtime remains separate and dummy-only.
8. No real automation has been introduced.

If any criterion fails, Phase 0 is not complete.
