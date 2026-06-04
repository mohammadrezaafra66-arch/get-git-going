# Google Maps Module Specification — Phase 1 Candidate

Phase label: `PHASE-1 CANDIDATE AFTER PHASE 0 ACCEPTANCE`

This document defines a future limited Google Maps module specification for Afra Automation.

Google Maps is not implemented in Phase 0. This document is a future module specification only. It does not authorize real scraping, browser automation, proxy/account automation, production lead extraction, external platform calls, API keys, credentials, migrations, or runtime implementation.

## 1. Purpose

The future Google Maps module may support controlled public business lead acquisition.

The module, if approved in a later phase, would collect public business information for lead discovery through the Afra Automation job system. It must remain limited to public business data and must follow approved job lifecycle, worker runtime, artifact, logging, checkpoint, and deduplication contracts.

## 2. Phase 0 status

Google Maps is not implemented in Phase 0.

Phase 0 allows only:

1. Documentation.
2. Contract design.
3. Schema placeholders.
4. Worker skeleton.
5. Dummy-worker preparation.
6. Safe dummy E2E flow design.

Phase 0 does not allow real Google Maps extraction or external platform access.

## 3. Future scope

A later approved Google Maps module may include:

1. Controlled public business lead search.
2. Operator-defined search inputs.
3. Limited run size.
4. Public business result collection.
5. Deduplication status reporting.
6. Checkpointed job execution.
7. Structured logs.
8. Artifact registration.
9. Reviewable extraction status.

This future scope is not implementation permission.

## 4. Expected future inputs

A future Google Maps job may accept:

1. Keywords.
2. City/province.
3. Business category.
4. Run limit.
5. Operator request metadata.

Operator request metadata may include safe non-sensitive information such as request id, requester role, created timestamp, and purpose label.

Inputs must not include secrets, real credentials, private account data, proxy credentials, or production-only private values.

## 5. Expected future outputs

A future Google Maps job may produce public-data-oriented lead records with:

1. Business name.
2. Public address.
3. Public phone if available.
4. Public website if available.
5. Google Maps URL.
6. City/province.
7. Category.
8. Extraction status.
9. Deduplication status.

Outputs must be limited to public business information.

No private user data, hidden contact data, account data, session data, credentials, or non-public data may be included.

## 6. Required future contracts

Before implementation, the module must have approved contracts for:

1. Job lifecycle.
2. Worker heartbeat.
3. Checkpoint.
4. Logs.
5. Artifact schema.
6. Deduplication contract.
7. Input validation.
8. Error reporting.
9. Disable/rollback behavior.

The module may later use the Automation Job Lifecycle and Worker Runtime contracts.

## 7. Phase 0 boundary

The following are forbidden in Phase 0:

1. Real scraping.
2. Browser automation.
3. Proxy/account automation.
4. Production lead extraction.
5. External platform calls.
6. API keys or credentials.
7. Google account usage.
8. Runtime implementation.
9. Database migration.
10. Production extraction workflow.

If any task attempts to implement these items, it must be blocked or reclassified as future work.

## 8. Future safety requirements

Before any later implementation, the team must approve:

1. Rate limit design.
2. Legal/public-data scope confirmation.
3. Disable switch or rollback plan.
4. Checkpoint and resume behavior.
5. Stale worker handling.
6. Deduplication rules.
7. Output/artifact retention rules.
8. Logging and redaction rules.
9. Operator access rules.
10. Test cases.

Logs must not contain secrets, credentials, cookies, tokens, private account data, or private operational values.

## 9. Future disable / rollback expectation

A future Google Maps module must have a safe disable path before implementation.

A disable path should conceptually support:

1. Stop accepting new Google Maps jobs.
2. Preserve current job state.
3. Mark affected jobs according to the lifecycle.
4. Preserve safe checkpoint context.
5. Keep logs non-sensitive.
6. Avoid duplicate artifacts.

This section is conceptual only and does not define production operations.

## 10. Dependencies

This future module depends on:

1. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
4. `schemas/automation/artifact.schema.json`
5. `docs/automation/05_security_ops/SECRETS_POLICY.md`
6. `docs/automation/05_security_ops/RUNBOOK.md`

## 11. Acceptance for this specification

This specification is acceptable only if:

1. It clearly says Google Maps is not implemented in Phase 0.
2. It treats Google Maps as a Phase 1 candidate after Phase 0 acceptance.
3. All expected outputs are public-data-oriented.
4. It does not describe real scraping steps.
5. It contains no runtime code.
6. It contains no migration content.
7. It contains no secrets.
8. It contains no external execution instructions.
9. It contains no Playwright, Selenium, proxy, account, or API-key instructions.

## 12. Final rule

This document is a future module specification only.

It must not be used to justify Google Maps implementation in Phase 0. Real Google Maps work requires Phase 0 acceptance, a later approved ADR or task packet, approved contracts, approved safety design, and approved test cases.
