# Task Packet System — Phase 0

This is a Phase 0 control document. It defines the minimal structure of a Task Packet. It does not authorize runtime implementation.

## Purpose

A Task Packet is the smallest controlled unit of Phase 0 work.

It is used to keep work small, reviewable, testable, and traceable. It prevents broad prompts, vague scope, hidden file changes, and accidental movement into real automation.

## When a Task Packet is required

A Task Packet is required when a task:

- changes approved Phase 0 documentation
- changes contracts or schemas
- changes worker skeleton documentation
- changes security, testing, runbook, or delivery controls
- needs Cursor, Lovable, or another builder tool to edit files
- needs review evidence
- could be misunderstood as runtime or automation work

If a task is unclear, create or clarify the Task Packet before editing files.

## Naming and storage convention

Sample or example packets must be stored under:

`docs/automation/06_team_delivery/task_packets/`

Use a consistent pattern for Phase 0 examples:

`WPC-0-001`

Where:

- `WPC` means Work Packet Control
- `0` means Phase 0
- `001` is the sequential packet number

## Required fields matrix

| Field | Why required | Example placeholder |
|---|---|---|
| Task ID | Provides stable traceability. | `[WPC-0-001]` |
| Title | Makes the task understandable. | `[short task title]` |
| Phase label | Prevents phase confusion. | `[PHASE-0]` |
| Owner role | Identifies who is responsible. | `[owner role]` |
| Reviewer role | Identifies who reviews the work. | `[reviewer role]` |
| Goal | Defines the intended outcome. | `[goal statement]` |
| In-scope | Defines what may be done. | `[allowed work]` |
| Out-of-scope | Defines what must not be done. | `[non-goals]` |
| Allowed files to inspect | Prevents random repository exploration. | `[file path list]` |
| Allowed files to change | Prevents hidden file changes. | `[file path list]` |
| Acceptance criteria | Defines what success means. | `[checkable criteria]` |
| Linked test case IDs | Connects work to test registry. | `[TC-0-###]` |
| Security impact | Makes safety review explicit. | `[none / describe]` |
| Migration impact | Blocks unapproved database changes. | `[none / describe]` |
| RLS/RBAC impact | Blocks access-control surprises. | `[none / describe]` |
| Delivery report requirements | Defines evidence required at completion. | `[files inspected, files changed, risks]` |

## Lifecycle / gate sequence

| Step | Required artifact or check | Exit condition |
|---|---|---|
| Draft packet | Task Packet draft | Packet has ID, title, phase label, scope, files, owner, reviewer, and acceptance criteria. |
| Ready check against DoR | `DEFINITION_OF_READY.md` | All ready checks pass or the task is blocked. |
| Execution within approved scope | Approved Task Packet | Only approved files are inspected or changed. |
| Evidence capture | Delivery notes, linked tests, reviewer notes | Files inspected, files changed, impacts, and risks are recorded. |
| Done check against DoD | `DEFINITION_OF_DONE.md` | All done checks pass or the task is rejected. |
| PR submission / review | Pull request and reviewer checklist | PR is reviewed against phase label, scope, security, testing, and release gates. |

## Linkage to DoR / DoD / phase labels

Every Task Packet must carry a phase label.

Every Task Packet must stay consistent with:

- `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`
- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`

Packets that imply real automation default to `FUTURE` or `BLOCKED` until clarified.

Phase 0 packets must remain docs/structure/contracts/schemas/dummy-worker preparation only.

## Required references

- `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`
- `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
- `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
- `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
- `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
- `docs/automation/03_architecture/adr/ADR-005-no-real-bots-in-phase-0.md`

## Non-goals

A Phase 0 Task Packet must not request or authorize:

- real bots
- real scraping
- real sending
- migrations
- secrets
- runtime plugins/drivers
- external integrations
- browser automation
- OCR/STT implementation
- AI pipeline implementation
- Laravel/backend build work
- production procedures

## Final note

This document is not a full production SOP. It is a lightweight Phase 0 control document for safe repository work and review discipline.
