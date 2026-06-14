# AfraKala 49 Fixes — Task Packet Template

Phase Label: PHASE-0 / GOVERNANCE  
Status: Active  
Owner: Mohammadreza / Mahdi Heydari  
Source of Truth: GitHub  
Applies to: AfraKala 49 Fixes Package  
Scope: All 49-fixes groups, with current execution limited to Group 1 only

---

## 1. Purpose

Every correction in the AfraKala 49-fixes package must start from a Task Packet.

No raw request, chat instruction, Lovable prompt, Cursor prompt, or direct implementation is allowed unless the task has a reviewed Task Packet.

This template extends the existing DoR/DoD rules for the 49-fixes package.

---

## 2. Non-negotiable Rules

- GitHub is the source of truth.
- No direct work on `main`.
- No Laravel or parallel backend.
- No parallel database, ORM, schema, or API.
- Supabase/PostgreSQL remains the source of truth for data.
- Lovable is UI-only by default.
- Cursor is engineering/core/contracts/db/worker/test/governance only.
- API work must be contract-first.
- No migration or database change without explicit approval.
- No real bot, external integration, scraping, OCR, AI automation, or production connector unless a reviewed Task Packet explicitly allows it.
- Every PR must include evidence, test plan, and rollback plan.

---

## 3. Required Task Packet Fields

```yaml
task_id:
title:
group:
backlog_item:
phase_label:
task_type: governance_only | ui_only | engineering_only | split
owner:
reviewer:

business_goal:
current_problem:
desired_outcome:

in_scope:
  - 
out_of_scope:
  - 

allowed_paths:
  - 
forbidden_paths:
  - 

data_impact: none | read_only | write | schema_change
api_contract_impact: none | uses_existing_contract | new_contract_required | contract_change_required
ui_impact: none | copy_only | component_change | page_change
migration_impact: none | required_with_approval | forbidden

dependencies:
  - 

acceptance_criteria:
  - 

test_evidence:
  - 

risk_level: low | medium | high
rollback_plan:
  - 

stop_conditions:
  - 

related_docs:
  - 

pr_target: staging | main
branch_name:
```

---

## 4. Group 1 Defaults

For Group 1 — Safety, Governance, API, and Backup — default settings are:

```yaml
group: 1
allowed_backlog_items: [2, 3, 5, 6, 9]
default_task_type: governance_only
default_pr_target: main
```

Group 1 must not implement product features.

Group 1 must not touch product UI, business workflows, real bots, scraping, OCR, AI automation, production connectors, or unapproved migrations.

---

## 5. Classification Rules

### governance_only

Use for:
- process docs
- branch protection evidence
- PR template
- prompt governance
- task packet templates
- backup/local update checklists
- API/contract discipline docs

### ui_only

Use only when the task is explicitly a UI presentation task and does not need new data, new API, database changes, worker changes, or business logic.

Lovable may be used only for approved UI-only tasks.

### engineering_only

Use for:
- contracts
- API implementation
- tests
- worker boundaries
- DB review
- CI/boundary checks
- governance automation

Cursor may be used only inside approved scope.

### split

Use when the task needs both engineering and UI.

Execution order is always:

```text
contract/backend/data first
UI second
final boundary review last
```

---

## 6. Rejection Rules

Reject the Task Packet before execution if:

- backlog item is outside the approved group
- scope is vague
- allowed paths are missing
- forbidden paths are missing
- acceptance criteria are not testable
- rollback plan is missing
- migration impact is unclear
- API contract impact is unclear
- task mixes unrelated feature/refactor/governance work
- Lovable is asked to create backend/database/API logic
- Cursor is asked to rewrite broad UI without explicit approval

---

## 7. Minimal PR Evidence Required

Every PR created from a Task Packet must include:

- Task Packet link or copied Task Packet summary
- exact changed files
- Boundary Guard result
- test/build/lint result or explicit reason why not applicable
- screenshots if UI changed
- logs if backend/worker/process changed
- migration review if migration changed
- rollback plan
- remaining risks

---

## 8. Stop Rule

If a task cannot be represented clearly with this template, do not execute it.

Create a smaller Task Packet, ask for missing information, or escalate to ADR if the change affects architecture, source of truth, data model, security, or tool boundaries.
