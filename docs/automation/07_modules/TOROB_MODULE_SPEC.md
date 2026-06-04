# Torob Module Specification — Phase 1 Candidate

Phase label: `PHASE-1 CANDIDATE AFTER PHASE 0 ACCEPTANCE`

This document defines a future limited Torob module specification for Afra Automation.

Torob is not implemented in Phase 0. This document is a future module specification only. It does not authorize real Torob scraping, browser automation, proxy/account automation, production price extraction, external platform calls, API keys, credentials, pricing actions, migrations, or runtime implementation.

## 1. Purpose

The future Torob module may support controlled public market and pricing intelligence.

The module, if approved in a later phase, would observe public market offer information for AfraKala products and produce structured pricing intelligence for review. It must not make automatic production pricing decisions without later explicit approval and human review.

## 2. Phase 0 status

Torob is not implemented in Phase 0.

Phase 0 allows only:

1. Documentation.
2. Contract design.
3. Schema placeholders.
4. Worker skeleton.
5. Dummy-worker preparation.
6. Safe dummy E2E flow design.

Phase 0 does not allow real Torob extraction or external platform access.

## 3. Future scope

A later approved Torob module may include:

1. Controlled public market observation.
2. AfraKala product input handling.
3. Product candidate matching.
4. Public seller/offer normalization.
5. Public price observation.
6. Availability status observation.
7. Match confidence scoring.
8. Pricing comparison status.
9. Checkpointed job execution.
10. Structured logs.
11. Artifact registration.
12. Human-review handoff for any pricing action.

This future scope is not implementation permission.

## 4. Expected future inputs

A future Torob job may accept:

1. AfraKala product ID.
2. Product name.
3. Brand.
4. Model.
5. Optional Torob URL if already known.
6. Run limit.
7. Operator request metadata.

Operator request metadata may include safe non-sensitive information such as request id, requester role, created timestamp, purpose label, and review target.

Inputs must not include secrets, API keys, private account data, proxy credentials, production-only private values, or credentials of any kind.

## 5. Expected future outputs

A future Torob job may produce public market/pricing intelligence records with:

1. Matched product candidate.
2. Seller name.
3. Public offer price.
4. Public offer URL.
5. Availability status.
6. Normalized product match confidence.
7. Extraction status.
8. Pricing comparison status.

Outputs must be limited to public market/pricing information.

No private user data, hidden contact data, account data, session data, credentials, or non-public data may be included.

## 6. Required future contracts

Before implementation, the module must have approved contracts for:

1. Job lifecycle.
2. Worker heartbeat.
3. Checkpoint.
4. Logs.
5. Artifact schema.
6. Product matching contract.
7. Pricing output contract.
8. Input validation.
9. Error reporting.
10. Disable/rollback behavior.

The module may later use the Automation Job Lifecycle and Worker Runtime contracts.

## 7. Phase 0 boundary

The following are forbidden in Phase 0:

1. Real Torob scraping.
2. Production price extraction.
3. Browser automation.
4. Proxy/account automation.
5. Pricing decisions affecting production.
6. External platform calls.
7. API keys or credentials.
8. Runtime implementation.
9. Database migration.
10. Real Torob extraction workflow.
11. Price manipulation.
12. Production pricing action.

If any task attempts to implement these items, it must be blocked or reclassified as future work.

## 8. Future safety requirements

Before any later implementation, the team must approve:

1. Source-change detection.
2. Rate limit policy.
3. Manual disable switch.
4. Confidence scoring before use in pricing.
5. Human review before production price action.
6. Checkpoint and resume behavior.
7. Stale worker handling.
8. Product matching confidence thresholds.
9. Pricing output review workflow.
10. Output/artifact retention rules.
11. Logging and redaction rules.
12. Operator access rules.
13. Test cases.

Logs must not contain secrets, credentials, cookies, tokens, private account data, private operational values, or non-public market data.

## 9. Future pricing-action boundary

A future Torob module may produce pricing intelligence, but it must not directly change production prices unless a later approved phase explicitly allows it.

Any production pricing action requires:

1. Approved pricing output contract.
2. Approved confidence scoring policy.
3. Human review requirement.
4. Clear rollback or correction path.
5. Auditability.
6. Owner approval.
7. Test evidence.

This section is conceptual only and does not define production pricing workflow.

## 10. Future disable / rollback expectation

A future Torob module must have a safe disable path before implementation.

A disable path should conceptually support:

1. Stop accepting new Torob jobs.
2. Preserve current job state.
3. Mark affected jobs according to the lifecycle.
4. Preserve safe checkpoint context.
5. Keep logs non-sensitive.
6. Avoid duplicate artifacts.
7. Prevent stale pricing intelligence from affecting decisions.

This section is conceptual only and does not define production operations.

## 11. Dependencies

This future module depends on:

1. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
2. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
3. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
4. `schemas/automation/artifact.schema.json`
5. `docs/automation/05_security_ops/SECRETS_POLICY.md`
6. `docs/automation/05_security_ops/RUNBOOK.md`
7. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md` if future database tables are added.

## 12. Acceptance for this specification

This specification is acceptable only if:

1. It clearly says Torob is not implemented in Phase 0.
2. It treats Torob as a Phase 1 candidate after Phase 0 acceptance.
3. It focuses on future public market/pricing intelligence.
4. It does not describe real scraping steps.
5. It forbids production pricing action without later approval.
6. It contains no runtime code.
7. It contains no migration content.
8. It contains no secrets.
9. It contains no external execution instructions.
10. It contains no Playwright, Selenium, proxy, account, API-key, or real extraction workflow instructions.

## 13. Final rule

This document is a future module specification only.

It must not be used to justify Torob implementation in Phase 0. Real Torob work requires Phase 0 acceptance, a later approved ADR or task packet, approved contracts, approved safety design, approved test cases, and human-review rules for any pricing action.
