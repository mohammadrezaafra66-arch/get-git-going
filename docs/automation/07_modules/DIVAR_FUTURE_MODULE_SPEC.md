# Divar Future Module Specification

Phase label: `FUTURE ONLY`

Divar is future-only. Divar is not Phase 0 and not Phase 1 unless a later accepted ADR explicitly changes its phase.

This document is a future risk/specification placeholder only. It does not approve implementation, crawling, sending, scraping, browser automation, account automation, proxy management, production lead extraction, or external execution.

## 1. Purpose

The possible future Divar module may be considered as a public lead acquisition capability.

This document only records conceptual boundaries and unresolved risks. It is not an implementation plan.

Any future Divar work must remain limited to lawful, approved, public-data use and must pass additional architecture, legal, safety, security, and owner review before implementation.

## 2. Phase status

Divar is not implemented in Phase 0.

Divar is not approved for Phase 1.

Divar remains `FUTURE ONLY` until a later ADR explicitly moves it into a later approved implementation phase.

No Task Packet, PR, prompt, Cursor instruction, or Lovable instruction may use this document as permission to build Divar functionality.

## 3. Required unresolved decisions before any future implementation

Before any future Divar implementation can be considered, the following must be resolved and approved:

1. Legal/public-data scope.
2. Platform risk review.
3. Account safety policy.
4. Rate limit policy.
5. Consent/communication policy if messaging is ever considered.
6. Driver contract.
7. Audit/logging policy.
8. Manual kill switch.
9. Owner approval.
10. New ADR.
11. Test case registry updates.
12. Runbook updates.
13. Security review.
14. RLS/RBAC review if data storage is involved.
15. Migration/rollback review if new tables are involved.

If any item above is missing, Divar implementation is blocked.

## 4. Possible future inputs — conceptual only

A future Divar module might define conceptual inputs such as:

1. Search/category URL.
2. City/province.
3. Category.
4. Run limit.
5. Operator request metadata.

These inputs are conceptual only.

They must not include secrets, account credentials, cookies, tokens, proxy credentials, browser profiles, private endpoints, or non-public data.

## 5. Possible future outputs — conceptual only

A future Divar module might define conceptual public-data-oriented outputs such as:

1. Public listing title.
2. Public listing URL.
3. Public city/location.
4. Public seller/display information if available.
5. Extraction status.
6. Deduplication status.
7. Risk status.

Outputs must not include private or non-public data.

Outputs must not include credentials, cookies, account data, hidden contact data, session data, bypassed data, or restricted data.

## 6. Strict forbidden scope

The following are forbidden by this document:

1. Real Divar crawling.
2. Real Divar scraping.
3. Real message sending.
4. Account automation.
5. Browser automation.
6. Proxy management.
7. Production lead extraction.
8. Private/non-public data collection.
9. Bypassing access controls.
10. Automation that violates platform terms.
11. Anti-detection or evasion guidance.
12. Credential usage.
13. Cookie or session usage.
14. Runtime implementation.
15. Database migration.
16. Production workflow.

If a proposed task includes any item above, it must be rejected or escalated for a new ADR.

## 7. Messaging boundary

Divar messaging is not approved.

If messaging is ever considered in a future phase, it requires:

1. Consent/communication policy.
2. Legal review.
3. Platform risk review.
4. Account safety policy.
5. Rate limits.
6. Manual stop/kill switch.
7. Audit/logging policy.
8. Owner approval.
9. New ADR.

This document does not provide a messaging workflow.

## 8. Safety requirements for any future proposal

Any future Divar proposal must define:

1. Public-data boundary.
2. Forbidden-data boundary.
3. Platform risk model.
4. Rate limit model.
5. Account safety model.
6. Disable/kill-switch model.
7. Logging and redaction rules.
8. Deduplication rules.
9. Risk status rules.
10. Human review points.
11. Test cases.
12. Rollback/disable plan.

The proposal must not include bypassing, evasion, anti-detection, or access-control circumvention.

## 9. Dependencies

This future module depends on:

1. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
2. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
3. `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
4. `docs/automation/05_security_ops/SECRETS_POLICY.md`
5. `docs/automation/05_security_ops/RUNBOOK.md`

## 10. Acceptance for this specification

This specification is acceptable only if:

1. Divar remains explicitly `FUTURE ONLY`.
2. It states that Divar cannot move into implementation without a later accepted ADR.
3. It contains no real crawling guidance.
4. It contains no messaging workflow.
5. It contains no scraping steps.
6. It contains no bypassing or evasion guidance.
7. It contains no account automation guidance.
8. It contains no proxy operation steps.
9. It contains no runtime code.
10. It contains no migration content.
11. It contains no secrets.
12. It contains no external execution instructions.

## 11. Final rule

This file is a future risk/spec placeholder, not an implementation plan.

Divar must remain `FUTURE ONLY` until a later accepted ADR explicitly changes the phase and defines a safe, legal, public-data, reviewed implementation boundary.
