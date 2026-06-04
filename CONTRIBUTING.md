# Contributing to AfraKala

This repository is the control plane and core application for the AfraKala smart assistant. Contributions must preserve the existing architecture, remain self-host safe, and avoid creating parallel systems.

## Required reading

Before any change, read:

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. The target file being changed

For changes related to migrations, deployment, RLS/RBAC, self-hosting, or sensitive access, also read the relevant policy documents under `docs/` and `docs/automation/`.

## Branch strategy

Use small focused branches. One branch should represent one coherent task.

Recommended branch names:

- `docs/<short-topic>` for documentation-only changes
- `phase0/<short-topic>` for Phase 0 automation documentation or structure changes
- `fix/<short-topic>` for safe fixes
- `chore/<short-topic>` for maintenance-only work
- `feature/<short-topic>` only for explicitly approved feature work

Do not commit directly to `main` unless the repository owner explicitly approves it.

## Pull request workflow

Every pull request must be small, reviewable, and phase-scoped.

Each PR must include:

1. Summary of changes
2. Phase or scope: `BASELINE`, `PHASE-0`, `PHASE-1`, or `FUTURE`
3. Files inspected before the change
4. Files changed and why
5. Migration impact
6. RLS/RBAC impact
7. Audit-log impact
8. Build, lint, typecheck, test, or documentation-only status
9. Manual test path if UI changed
10. Self-host acceptance check
11. Remaining risks

Use `.github/pull_request_template.md`. Do not remove checklist sections. If a section is not applicable, mark it as not applicable and explain why.

## Documentation standards

Documentation must be direct, operational, and useful for execution.

For Markdown files:

- Use clear headings.
- Prefer numbered steps for procedures.
- Keep phase boundaries explicit.
- Link to existing canonical documents instead of duplicating them.
- Avoid vague promises without an owner, phase, or condition.
- Do not include credentials, cookies, tokens, customer data, or private operational data.
- Keep GitHub documentation non-sensitive.

For schema, OpenAPI, YAML, JSON, and environment example files:

- Keep the file syntactically valid.
- Use empty or fake placeholder values only.
- Do not include production credentials or private endpoints.
- Keep `schemas/automation/artifact.schema.json` as the canonical artifact contract.

## Phase 0 constraints

Phase 0 is documentation, structure, contract design, and dummy-worker preparation only.

Allowed in Phase 0:

1. Documentation structure
2. Governance documents
3. ADRs
4. API contract placeholders
5. JSON schema placeholders
6. Worker runtime documentation
7. Dummy-worker-only design
8. Runbooks, incident templates, release checklists, DoR, DoD, RACI, and task-packet templates
9. Safe end-to-end dummy-flow design

Forbidden in Phase 0:

1. Real Divar crawler
2. Real WhatsApp sender or messaging automation
3. Real Instagram extractor
4. Real Torob scraper
5. Real OCR/STT pipeline
6. Real AI/LLM pipeline
7. Browser automation
8. Proxy or account automation
9. Production scraping
10. Production message sending
11. Laravel core
12. Parallel database
13. Parallel API layer
14. Parallel admin panel
15. Unapproved migration
16. Real production credential

If a task looks like real automation, label it `FUTURE` unless an approved ADR moves it into a later phase.

## Architecture constraints

The current `get-git-going` repository remains the control plane and core application.

Supabase/PostgreSQL remains the source of truth.

React, TanStack, and Lovable-generated UI remain the operator UI layer. Lovable is not the runtime brain of workers, bots, scraping, or messaging.

Python Worker Runtime stays separate from UI code. Plugin and driver logic stays outside the UI and outside Phase 0 runtime work.

Do not create a second core, second database, second admin panel, second API layer, or duplicate module without a new approved ADR.

## Database and migration discipline

Do not add or modify database migrations unless the task explicitly asks for it and the migration safety policy has been followed.

Any future migration must document:

1. Purpose
2. Affected tables
3. RLS/RBAC impact
4. Audit impact
5. Index impact
6. Rollback plan
7. Staging test plan
8. Backup requirement

Destructive migration without backup and explicit approval is forbidden.

## Review expectations

Reviewers should check:

1. Scope matches the phase.
2. No forbidden Phase 0 work is included.
3. No duplicate system or parallel module is introduced.
4. Existing architecture is respected.
5. Documentation is operational and clear.
6. Self-host requirements are preserved.
7. RLS/RBAC, audit, and migration impacts are honestly reported.

## Delivery discipline

Keep every change small, incremental, low-risk, and testable.

If you are unsure whether a change is allowed, stop and ask for an ADR or explicit owner approval before editing files.
