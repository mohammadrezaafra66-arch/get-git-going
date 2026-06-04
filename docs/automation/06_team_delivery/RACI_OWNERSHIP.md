# RACI Ownership — Phase 0

This is a non-sensitive Phase 0 ownership document. It exists to clarify review and decision roles for Afra Automation Phase 0. Actual review routing is also enforced through `CODEOWNERS` and pull request review.

This file uses agreed team role names only. It does not include private contact details, phone numbers, emails, credentials, production access notes, service-account details, runtime procedures, migration procedures, or platform-automation instructions.

## 1. Purpose

This document defines ownership for Phase 0 documentation, contracts, schemas, dummy-worker planning, testing, review, and governance work.

It exists to answer:

1. Who does the work?
2. Who owns the final decision?
3. Who must be consulted?
4. Who must be informed?
5. When must sensitive work escalate?

## 2. Team ownership model

| Role | Primary responsibilities | Review / decision responsibilities |
|---|---|---|
| Afra | Final owner, product direction, security approval, sensitive decisions, phase boundary approval | Final approval for secrets, access, architecture, migration, production, real automation risks, and movement beyond Phase 0 |
| Porchista | Main coding owner, technical implementation, technical review | Code quality review, architecture fit review, maintainability review, technical correctness review |
| Heidari | Execution, testing, documentation support, task progress tracking | Evidence collection, first-pass validation, task progress visibility |
| Talebizadeh | Execution, testing, quality control | Acceptance criteria review, test result review, delivery quality gate |

## 3. RACI glossary

| Symbol | Meaning | Expected behavior in this repository |
|---|---|---|
| R | Responsible | Performs the task, prepares the documentation/change, gathers evidence, or executes the assigned review step. |
| A | Accountable | Owns the final decision for that activity. Every activity must have exactly one Accountable owner. |
| C | Consulted | Gives input, technical review, security review, testing review, or context before completion. |
| I | Informed | Is kept aware of the decision, result, status, or risk after relevant progress. |

Hard rule: every activity must have exactly one Accountable owner.

## 4. Phase 0 activity matrix

| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Create Task Packet | Heidari or Talebizadeh | Afra | Porchista | Team |
| Validate Definition of Ready | Heidari | Afra | Porchista, Talebizadeh | Team |
| Update approved documentation | Heidari, Talebizadeh, or Porchista | Porchista | Afra | Team |
| Review Phase 0 scope alignment | Heidari | Afra | Porchista, Talebizadeh | Team |
| Review technical implementation | Porchista | Porchista | Afra | Heidari, Talebizadeh |
| Review security / migration / RLS impacts | Porchista | Afra | Heidari, Talebizadeh | Team |
| Execute testing | Heidari and Talebizadeh | Talebizadeh | Porchista | Afra |
| Review test evidence | Talebizadeh | Talebizadeh | Heidari, Porchista | Afra |
| Prepare PR | Porchista or assigned contributor | Porchista | Heidari, Talebizadeh | Afra |
| Review PR | Porchista | Afra | Heidari, Talebizadeh | Team |
| Approve sensitive work | Afra | Afra | Porchista, Heidari, Talebizadeh | Team |
| Approve merge readiness | Afra | Afra | Porchista, Heidari, Talebizadeh | Team |
| Incident / postmortem follow-up if needed | Heidari or Talebizadeh | Afra | Porchista | Team |

## 5. Escalation rules

| Trigger | Escalate to | Reason |
|---|---|---|
| Possible secret exposure | Afra | Secrets must never enter GitHub, docs, logs, artifacts, examples, PRs, or chats. |
| Possible migration impact | Afra | Phase 0 default is no automation migration without approved design, rollback, RLS/RBAC, and owner approval. |
| RLS/RBAC or access-control uncertainty | Afra | Sensitive access decisions require explicit approval before merge. |
| Architecture boundary change | Afra | Parallel core/API/database/panel work requires ADR-level decision. |
| Real automation risk | Afra | Real bots, scraping, sending, browser automation, OCR/STT, AI, and proxy/account automation are not Phase 0 work. |
| Technical fit or maintainability concern | Porchista | Technical direction must remain consistent with repository architecture. |
| Test evidence gap | Talebizadeh | Acceptance cannot pass without reviewable evidence. |
| Task progress or documentation gap | Heidari | Phase 0 work must remain traceable and documented. |

## 6. Sensitive-work note

Sensitive work requires Afra approval before merge.

Sensitive work includes:

1. Secrets.
2. Migrations.
3. RLS/RBAC.
4. Access-control changes.
5. Architecture boundary changes.
6. External integrations.
7. Service access changes.
8. Production deployment.
9. Any work that could be interpreted as real automation.
10. Any movement beyond Phase 0.

If sensitive scope is unclear, stop and escalate before editing files.

## 7. Phase 0 guardrails

This RACI document does not authorize:

1. Runtime code.
2. Migration.
3. Real bots.
4. Scraping.
5. Sending.
6. OCR/STT.
7. AI pipeline.
8. Browser automation.
9. Proxy/account automation.
10. Parallel core/API/database/panel.
11. Secrets or credentials.

## 8. Required references

- `CODEOWNERS`
- `.github/pull_request_template.md`
- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`
- `docs/automation/06_team_delivery/TASK_PACKET_SYSTEM.md`

## 9. Final rule

Ownership is part of quality control.

A Phase 0 task is not ready to start or merge unless Responsible, Accountable, Consulted, and Informed expectations are clear, with exactly one Accountable owner for the activity.
