# RACI Ownership — Phase 0

This is a non-sensitive Phase 0 ownership placeholder. It exists to clarify review and decision roles. Actual review routing is also enforced through CODEOWNERS and PR review.

## Purpose

This document defines role-based ownership for Phase 0 documentation, contract, schema, dummy-worker planning, review, and governance tasks.

It is intentionally lightweight and placeholder-style. It does not include private contact details, production access notes, service-account details, runtime procedures, migration procedures, or platform-automation instructions.

## RACI glossary

| Symbol | Meaning | Expected behavior in this repository |
|---|---|---|
| R | Responsible | Performs the task or prepares the requested documentation/change. |
| A | Accountable | Owns the final decision for the activity; exactly one Accountable role is required per activity. |
| C | Consulted | Provides review, context, or specialist input before completion. |
| I | Informed | Is kept aware of the decision, result, or status after relevant progress. |

## Phase 0 activity matrix

| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Create task packet | Task author role | Product owner role | Technical reviewer role | Team observer role |
| Validate Definition of Ready | Task owner role | Product owner role | Technical reviewer role | Assigned contributor role |
| Write/update approved documentation | Documentation contributor role | Technical reviewer role | Product owner role | Team observer role |
| Review Phase 0 scope alignment | Task owner role | Product owner role | Technical reviewer role | Assigned contributor role |
| Review security/migration/RLS impacts | Security reviewer role | Product owner role | Technical reviewer role | Assigned contributor role |
| Review PR | Technical reviewer role | Product owner role | Security reviewer role when needed | Assigned contributor role |
| Approve merge | Repository owner role | Product owner role | Technical reviewer role and security reviewer role when needed | Team observer role |
| Update incident/postmortem or test-case references if needed | Task owner role | Technical reviewer role | Product owner role | Team observer role |

Rule: every activity must have exactly one Accountable role.

## Escalation rules

| Trigger | Escalate to role | Reason |
|---|---|---|
| Possible secret exposure | Product owner role / security reviewer role | Secrets must never enter GitHub, docs, logs, artifacts, or examples. |
| Possible migration impact | Product owner role / security reviewer role | Phase 0 default is no automation migration without approved design and rollback. |
| Architecture boundary change | Product owner role / architecture reviewer role | Parallel core/API/database/panel work requires ADR-level decision. |
| Real automation risk | Product owner role / technical reviewer role | Real bots, scraping, sending, browser automation, OCR/STT, AI, and proxy/account automation are not Phase 0 work. |

## Sensitive-work note

Sensitive work requires explicit extra approval before merge.

Sensitive work includes:

- secrets
- migrations
- RLS/RBAC
- access-control changes
- architecture boundary changes
- external integrations
- service access changes
- any work that could be interpreted as real automation

If sensitive scope is unclear, stop and escalate before editing files.

## Required references

- `CODEOWNERS`
- `.github/pull_request_template.md`
- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
- `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
- `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`
