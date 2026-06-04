# Definition of Done — Phase 0

This is a Phase 0 placeholder/control document. It exists to decide whether a task may be delivered/reviewed. It does not authorize runtime implementation or release.

## Purpose

Definition of Done means a Phase 0 task has enough evidence, reviewability, and safety confirmation to be considered complete.

This document is a local repository execution-control agreement for Phase 0 work. It is intentionally lightweight and placeholder-style.

## Scope and Phase 0 boundary

This document applies only to Phase 0 repository work.

Phase 0 remains docs/structure-only unless a task is explicitly approved as dummy-worker preparation.

This document does not authorize:

- runtime code
- deployment steps
- real bots
- real scraping
- real sending
- browser automation
- AI/OCR/STT implementation
- database migration
- production release work
- secrets or real values

## Done checklist

| Check ID | Criterion | Evidence required | Pass/Fail | Notes |
|---|---|---|---|---|
| DOD-001 | Task stayed within approved scope. | [attach evidence] | [TBD] | [reviewer notes] |
| DOD-002 | Changed files stayed within allowed paths. | [attach file list] | [TBD] | [reviewer notes] |
| DOD-003 | No runtime code was added. | [attach diff review] | [TBD] | [TBD if applicable] |
| DOD-004 | No real bot behavior was added. | [attach diff review] | [TBD] | [TBD if applicable] |
| DOD-005 | No external integration was added. | [attach diff review] | [TBD] | [TBD if applicable] |
| DOD-006 | No migration was added unless explicitly approved. | [attach migration impact note] | [TBD] | [TBD if applicable] |
| DOD-007 | No secrets were committed. | [attach security check note] | [TBD] | [TBD if applicable] |
| DOD-008 | Documentation or test linkage was updated. | [attach doc/test link] | [TBD] | [TBD if applicable] |
| DOD-009 | Reviewer can inspect result directly. | [attach PR/file link] | [TBD] | [reviewer notes] |
| DOD-010 | Phase 0 acceptance alignment is confirmed. | [attach acceptance reference] | [TBD] | [reviewer notes] |

## Required delivery evidence

Every Phase 0 delivery must include:

- files inspected
- files changed
- reason for change
- security impact
- migration impact
- RLS/RBAC impact
- test or docs-only verification result
- remaining risk

Use placeholder wording when evidence is not yet available:

- [attach evidence]
- [reviewer notes]
- [TBD if applicable]

## Rejection conditions

| Condition | Why rejected | Next action |
|---|---|---|
| Hidden scope expansion | The task no longer matches approved Phase 0 scope. | Stop and clarify scope. |
| Undocumented extra files | Reviewer cannot confirm file boundary. | Update task/PR evidence or revert extra changes. |
| Unclear reviewer verification | Result cannot be independently checked. | Add direct file/PR evidence. |
| Any real automation behavior | Real automation is not allowed in Phase 0. | Reclassify as FUTURE or request ADR. |
| Any secret or credential | Secrets must never enter GitHub or docs. | Stop and escalate through security policy. |
| Any migration without prior approval | Phase 0 default is no automation migration. | Block and require migration review. |
| Any production-facing operational step | This DoD does not authorize production work. | Remove from Phase 0 or create later-phase process. |

## Required references

- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
- `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
- `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
- `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`

## Change control note

Changes to this document should stay lightweight and governance-oriented.

Do not turn this file into a production release checklist. Detailed release, security, testing, or runbook procedures belong in their dedicated Phase 0 documents.
