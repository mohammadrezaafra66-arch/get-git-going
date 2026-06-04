# Definition of Ready — Phase 0

This is a Phase 0 placeholder/control document. It exists to decide whether a task may start. It does not authorize runtime implementation.

## Purpose

Definition of Ready means a Phase 0 task has enough context, boundaries, ownership, and review path to begin safely.

This document is a local repository execution-control agreement for Phase 0 work. It is intentionally lightweight and placeholder-style.

## Scope and Phase 0 boundary

This document applies only to Phase 0 repository work.

Phase 0 remains docs/structure-only unless a task is explicitly approved as dummy-worker preparation.

This document does not authorize:

- runtime code
- real bots
- real scraping
- real sending
- AI/OCR/STT implementation
- browser automation
- Laravel/backend build work
- database migration
- production procedures
- secrets or sample credentials

## How this document is used

Before starting a task, the assignee and reviewer check the table below.

If any required item is missing, the task is not ready and must be clarified before work starts.

## Ready checklist

| Check ID | Criterion | Evidence or linked document | Pass/Fail | Notes |
|---|---|---|---|---|
| DOR-001 | Clear task title exists. | [TBD] | [TBD] | [TBD] |
| DOR-002 | Explicit phase label is present. | [link here] | [TBD] | Must follow `PHASE-0`, `BASELINE`, `PHASE-1`, or `FUTURE`. |
| DOR-003 | Scope statement is clear. | [TBD] | [TBD] | [TBD] |
| DOR-004 | Allowed files to inspect are listed. | [TBD] | [TBD] | [TBD] |
| DOR-005 | Allowed files to change are listed. | [TBD] | [TBD] | [TBD] |
| DOR-006 | Explicit non-goals are listed. | [TBD] | [TBD] | [TBD] |
| DOR-007 | Acceptance criteria are defined. | [TBD] | [TBD] | [TBD] |
| DOR-008 | Test case linkage is defined. | [link here] | [TBD] | Use test registry when applicable. |
| DOR-009 | Owner role is defined. | [team-defined] | [TBD] | [TBD] |
| DOR-010 | Reviewer role is defined. | [team-defined] | [TBD] | [TBD] |
| DOR-011 | Security impact is checked. | [TBD] | [TBD] | [TBD] |
| DOR-012 | Migration impact is checked. | [TBD] | [TBD] | Must remain no-migration unless separately approved. |
| DOR-013 | RLS/RBAC impact is checked. | [TBD] | [TBD] | [TBD] |
| DOR-014 | Task is confirmed as still PHASE-0 safe. | [TBD] | [TBD] | No runtime, real bot, migration, or secret scope. |

## Not-ready / stop conditions

| Condition | Why blocked | Escalate to |
|---|---|---|
| Unclear phase label | Work may cross Phase 0 boundaries. | Owner/reviewer |
| Possible real bot behavior | Real automation is not allowed in Phase 0. | Owner/reviewer |
| Possible real scraping or sending | Real external automation is `FUTURE` unless later approved. | Owner/reviewer |
| Possible runtime code | This DoR does not authorize implementation. | Technical reviewer |
| Possible migration | Phase 0 default is no automation migration. | Owner/security reviewer |
| Possible secret exposure | Secrets must never enter GitHub or docs. | Owner/security reviewer |
| Possible parallel core/API/database/panel work | Architectural duplication is blocked by ADRs. | Owner/architecture reviewer |
| Ambiguous ownership or review path | Task cannot start without accountable review. | Team lead / owner |

## Required references

- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
- `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
- `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
- `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`

## Change control note

Changes to this document should stay lightweight and governance-oriented.

Do not turn this file into a production process manual. Detailed procedures belong in the relevant Phase 0 runbook, testing, security, or task-packet documents.
