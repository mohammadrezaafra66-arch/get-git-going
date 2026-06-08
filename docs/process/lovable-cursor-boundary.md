# Lovable / Cursor Boundary Policy

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Proposed for Phase-0 Source-of-Truth hardening  
Source of Truth: GitHub  
Related policy: `docs/process/SOURCE_OF_TRUTH.md`

---

## 1. Purpose

This document defines the boundary between Lovable, Cursor, GitHub, Supabase/PostgreSQL, and Google Drive for the AfraKala Automation Platform.

The goal is to prevent tool drift, duplicated logic, accidental production changes, and uncontrolled cross-editing between UI work and worker/runtime work.

---

## 2. Final Decision

```text
GitHub is the only official source of truth for code, versioned docs, ADRs, contracts, and implementation decisions.
Lovable is not a source of truth.
Cursor is not a source of truth.
Google Drive is not a source of truth.
Supabase/PostgreSQL is the source of truth only for runtime/operational data.
```

No change is official until it exists in GitHub through branch, commit, pull request, review, and merge.

---

## 3. Tool Responsibilities

| Tool / System | Role | Source-of-truth status |
|---|---|---|
| GitHub | Code, versioned docs, ADRs, contracts, PR history | Official source of truth |
| Supabase/PostgreSQL | Runtime data, operational state, database schema after approved migrations | Runtime data source of truth |
| Lovable | UI generation/editing for React/TanStack screens | Execution tool only |
| Cursor | Engineering assistant for code, docs, tests, workers, contracts, and refactors | Execution tool only |
| Google Drive | Human review packs, exported PDFs, management mirrors | Mirror only |
| Google Sheets / Excel | Temporary imports, exports, manual review files | Not system database |

---

## 4. Lovable Boundary

Lovable may work on UI only by default.

Allowed Lovable work:

```text
React/TanStack UI pages
UI components
Persian/RTL layout improvements
Forms, tables, dashboards, and user-facing workflows
Client-side display wiring to approved APIs
Copy, labels, empty states, loading states, and visual polish
```

Lovable must not change without explicit ADR / task-packet approval:

```text
Supabase migrations
RLS/RBAC policies
Worker runtime
Python automation code
Secrets or environment files
Business-critical pricing logic
Credit decision logic
Automation driver logic
OpenAPI contracts
Server-side API contracts
Production deployment configuration
Database schema ownership decisions
```

Lovable must not invent API routes. If a UI needs new data or a new action, the API must first be defined in an approved contract or task packet.

---

## 5. Cursor Boundary

Cursor may work on engineering tasks only inside an approved task scope.

Allowed Cursor work:

```text
Worker runtime
Automation drivers
OpenAPI / JSON Schema contracts
Server-side functions and API implementations
Supabase migrations after approval
Tests and evidence files
CI / GitHub Actions
Self-host deployment scripts and runbooks
Code review, refactor, and safety checks
```

Cursor must not change without explicit UI task approval:

```text
Large UI redesigns
User-facing flow changes
Navigation structure
Branding or visual hierarchy
Customer-facing text
Lovable-generated UI areas outside the approved task
```

Cursor must not bypass PR review, merge directly into main, or introduce production behavior outside the accepted packet scope.

---

## 6. Branch Rules

Default branch roles:

```text
main = production-approved source of truth
staging = human-test candidate branch
lovable/* = UI work branch
cursor/worker-* = worker/runtime work branch
cursor/api-* = API/contract work branch
cursor/db-* = database/migration work branch
docs/* = documentation/governance branch
```

Required flow:

```text
feature branch
→ Pull Request
→ review against this boundary
→ staging when human testing is needed
→ main only after acceptance
```

No tool may treat its local state, generated preview, or chat output as final truth.

---

## 7. Environment Boundary

Production and staging must remain separate.

```text
Production:
branch = main
database = production database
host = server laptop / production host
purpose = real company work

Staging:
branch = staging or approved test branch
database = staging/test database
host = personal/test computer
purpose = human testing only
```

The staging UI must show a visible warning that the environment is not production.

Production data must not be copied into staging unless a separate approved anonymization/import task exists.

---

## 8. API / Contract Boundary

UI and automation must communicate through approved contracts.

Required rule:

```text
If Lovable needs an API, define or update the contract first.
If Cursor changes an API, update the contract first.
If the contract changes, UI and server changes must reference that contract in the PR.
```

Approved contract locations may include:

```text
openapi/
automation/openapi/
automation/schemas/
docs/automation/task-packets/
docs/adr/
```

No guessed endpoint, hidden database write, or direct browser-side secret usage is allowed.

---

## 9. PR Review Checklist

Every PR that touches Lovable/Cursor boundaries must answer:

```text
Does this PR change UI only?
Does this PR change worker/runtime only?
Does this PR change API/contract?
Does this PR change database schema, RLS, or RBAC?
Does this PR introduce production behavior?
Does this PR require staging human testing?
Does this PR keep GitHub as the source of truth?
```

If the answer crosses more than one boundary, the PR should be split unless an ADR explicitly approves the combined change.

---

## 10. Stop Conditions

Stop immediately and create a new ADR or task packet if:

```text
Lovable modifies database, worker, server contracts, or production deployment files.
Cursor modifies broad UI flows without a UI task.
A tool introduces an API route not defined in a contract.
A migration is added without migration review.
A secret or service key appears in client-visible code.
Staging points to production database by mistake.
Production behavior changes without acceptance evidence.
```

---

## 11. Prompt Rules for Lovable

Every Lovable prompt should include:

```text
You are working on UI only.
GitHub is the source of truth.
Do not change database schema, migrations, RLS, worker runtime, secrets, or deployment files.
Do not invent API endpoints.
Use the approved contract/task packet only.
Keep Persian RTL UX consistent.
Return a summary of changed files and risks.
```

---

## 12. Prompt Rules for Cursor

Every Cursor prompt should include:

```text
Read docs/process/SOURCE_OF_TRUTH.md and docs/process/lovable-cursor-boundary.md first.
Work only inside the approved task scope.
Do not change UI unless the task explicitly says UI.
Do not change database/migrations unless the task explicitly says migration.
Do not add real source integration unless the task packet allows it.
Create tests/evidence for the change.
Use branch + PR; do not push directly to main.
```

---

## 13. Acceptance Criteria

This boundary is accepted when:

```text
Lovable is clearly limited to UI by default.
Cursor is clearly limited to task-scoped engineering by default.
GitHub remains the only official source of truth.
Drive remains mirror only.
Production and staging are explicitly separated.
API changes require approved contracts.
Stop conditions are documented.
```

---

## 14. Final Rule

```text
Tools may generate work.
GitHub approves work.
Production only runs approved work.
```
