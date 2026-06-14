# AfraKala 49 Fixes — Group 1 Closure Report

Phase Label: PHASE-0 / GOVERNANCE  
Status: CLOSED  
Owner: Mohammadreza / Mahdi Heydari  
Source of Truth: GitHub  
Scope: Group 1 only — Safety, Governance, API, and Backup  
Allowed backlog items: 2, 3, 5, 6, 9

---

## 1. Purpose

This document closes Group 1 of the AfraKala 49-fixes package.

Group 1 was limited to safety, governance, branch protection, PR discipline, Task Packet discipline, Prompt Library discipline, API / contract-first discipline, and backup / local update discipline.

No product feature, product UI change, real bot, scraping, OCR, AI automation, unapproved migration, Laravel, parallel backend, parallel database, or parallel API was implemented in Group 1.

---

## 2. Final Status

Group 1 status: CLOSED  
Ready for next groups: YES, with guardrails active

---

## 3. Completed Stages

| Stage | Title | Status | Evidence |
|---|---|---|---|
| 1 | Verify Phase-0 Safety Baseline | DONE | PR #186 |
| 2 | Operational Task Packet System | DONE | PR #188 |
| 3 | Prompt Library Canonical | DONE | PR #190 |
| 4 | API / Contract Discipline | DONE BY EXISTING POLICY | docs/process/OPENAPI_CONTRACT_STRATEGY.md |
| 5 | Backup and Local Update Discipline | DONE BY EXISTING POLICY | docs/LOCAL_UPDATE_PROTOCOL.md |
| 6 | Closure Report | DONE BY THIS DOCUMENT | docs/process/GROUP1_CLOSURE_REPORT_49_FIXES.md |

---

## 4. New or Updated Files from Group 1

### PR #186

File:

- .github/pull_request_template.md

Purpose:

- Added explicit Evidence section.
- Added explicit Rollback Plan section.
- Strengthened PR review discipline.

### PR #188

File:

- docs/process/TASK_PACKET_TEMPLATE_49_FIXES.md

Purpose:

- Added official Task Packet template for the AfraKala 49-fixes package.
- Required backlog item, group, allowed paths, forbidden paths, impacts, acceptance criteria, evidence, risk, and rollback.

### PR #190

File:

- docs/process/PROMPT_LIBRARY_49_FIXES.md

Purpose:

- Added canonical prompt templates for Coordinator / Prompt Compiler, Cursor, and Lovable.
- Added split-task handoff JSON.
- Added prompt selection rules, rejection rules, Group 1 usage, and stop rules.

---

## 5. Existing Policies Confirmed During Group 1

### API / Contract Discipline

Existing file:

- docs/process/OPENAPI_CONTRACT_STRATEGY.md

Confirmed:

- API contract comes before implementation.
- Lovable must not invent API endpoints.
- Cursor must not implement API endpoints outside approved contracts.
- Canonical automation contract is automation/openapi/automation-v1.yaml.
- Root openapi/ is deprecated pointer-only unless a future ADR changes it.
- Contract first, implementation second, UI consumption third, production last.

### Backup / Local Update Discipline

Existing files include:

- docs/LOCAL_UPDATE_PROTOCOL.md
- docs/SELF_HOST_UPDATE_RUNBOOK.md
- docs/MIGRATION_SAFETY_POLICY.md
- docs/self-host-governance/
- deploy/backups/
- deploy/migration/

Confirmed:

- Backup is required before local updates.
- Full Lovable database export must not be restored directly onto Local.
- Migration review is required before database updates.
- Destructive migrations require manual review.
- Smoke tests are defined for app, health check, assets, Supabase REST, and key pages.
- Rollback path is documented.

---

## 6. Guardrails Confirmed

Group 1 confirms the following guardrails as active or documented:

- GitHub is the source of truth.
- get-git-going remains the Control Plane / Core.
- Supabase/PostgreSQL remains the data source of truth.
- No Laravel or parallel backend is allowed.
- No parallel database, ORM, schema, or API is allowed.
- Lovable is UI-only by default.
- Cursor is engineering/core/contracts/db/worker/test/governance only.
- API changes must be contract-first.
- PRs require evidence, test plan, and rollback plan.
- Branch protection exists for main and staging.
- Boundary Guard exists and must remain required on PRs.
- No direct work on main.

---

## 7. Remaining Manual Confirmations

The following items must remain manually monitored by repository admins:

- Branch protection rules for main and staging must not be weakened.
- Boundary Guard must remain a required check.
- Required check names must match the actual GitHub Actions check names.
- Admin bypass should not be used for routine merges.
- Any future migration must include backup/recovery evidence.
- Any future API change must reference the approved contract path.

---

## 8. Stop Conditions for Future Groups

Future groups must stop if:

- Task Packet is missing.
- Prompt is not derived from an approved Task Packet.
- Lovable attempts backend, database, migration, RLS/RBAC, worker, deployment, or secret changes.
- Cursor attempts broad UI rewrite without explicit approval.
- API endpoint is invented without contract.
- Migration is introduced without approval and rollback/recovery note.
- Backup/local update impact is unclear.
- PR lacks evidence, test plan, or rollback plan.

---

## 9. Handoff to Next Groups

Group 1 is ready to hand off to later groups.

Before starting any item from groups 2 to 7:

1. Create a Task Packet using docs/process/TASK_PACKET_TEMPLATE_49_FIXES.md.
2. Generate prompts using docs/process/PROMPT_LIBRARY_49_FIXES.md.
3. Follow docs/process/OPENAPI_CONTRACT_STRATEGY.md for API or contract work.
4. Follow docs/LOCAL_UPDATE_PROTOCOL.md for local/self-host updates.
5. Open PRs only with evidence, test plan, and rollback plan.
6. Keep changes scoped to the approved group and backlog item.

---

## 10. Final Decision

Group 1 is CLOSED.

The AfraKala 49-fixes package now has the minimum governance foundation required to start later groups safely.

Do not start implementation work from groups 2 to 7 without a reviewed Task Packet.
