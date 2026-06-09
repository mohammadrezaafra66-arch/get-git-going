# OpenAPI / Contract Strategy Policy

Phase Label: PHASE-1  
Owner: محمدرضا افرا  
Status: Active governance for API-contract work  
Source of Truth: GitHub  
Branch: `cursor/api-contract`

Related policies and contract files:

```text
docs/process/SOURCE_OF_TRUTH.md
docs/process/lovable-cursor-boundary.md
docs/process/BRANCH_STRATEGY.md
docs/process/ENVIRONMENT_STRATEGY.md
docs/automation/OPENAPI_CANONICAL_RESOLUTION.md
automation/openapi/automation-v1.yaml
```

---

## 1. Purpose

This document defines how AfraKala Automation Platform must manage API contracts between Lovable UI, Cursor engineering work, Worker Runtime, server routes, and Supabase/PostgreSQL.

The goal is to prevent guessed endpoints, duplicate contracts, direct browser database writes, contract drift, and mismatched UI/backend expectations.

---

## 2. Final Decision

```text
API contract comes before implementation.
Lovable must not invent API endpoints.
Cursor must not implement API endpoints outside an approved contract.
The canonical automation contract is automation/openapi/automation-v1.yaml.
Root openapi/ is deprecated pointer-only unless a future ADR changes it.
```

No API behavior is official until it is defined in GitHub through an approved contract, reviewed in PR, and implemented against that contract.

---

## 3. Canonical Contract Location

The canonical automation OpenAPI contract is:

```text
automation/openapi/automation-v1.yaml
```

Its JSON Schemas are:

```text
automation/schemas/heartbeat.schema.json
automation/schemas/job.schema.json
```

The root path below is not an implementation target:

```text
openapi/
```

It is a deprecated pointer path unless a future ADR explicitly changes the canonical location.

---

## 4. Contract Ownership

| Contract area | Canonical location | Owner / reviewer | Default tool |
|---|---|---|---|
| Automation worker API | `automation/openapi/automation-v1.yaml` | Platform / engineering review | Cursor |
| Worker payload schemas | `automation/schemas/` | Platform / engineering review | Cursor |
| API governance docs | `docs/automation/`, `docs/process/`, `docs/adr/` | Human review | Cursor / human |
| UI consumption rules | `docs/process/lovable-cursor-boundary.md` | UI + platform review | Lovable / Cursor |
| Legacy root OpenAPI pointer | `openapi/README.md` | Platform review | Human / Cursor |

---

## 5. Required Order of Work

Any API change must follow this order:

```text
1. Define the need.
2. Check existing contract and schemas.
3. Update or create the approved contract.
4. Review contract in PR.
5. Implement server/worker behavior only after contract approval.
6. Update Lovable UI only against the approved contract.
7. Add tests/evidence.
8. Test in staging when human testing is needed.
9. Merge to main only after acceptance.
```

Implementation before contract approval is forbidden.

---

## 6. Lovable API Rules

Lovable may consume approved APIs only.

Lovable may:

```text
Build UI screens against an approved OpenAPI/task packet.
Display data returned by an approved API.
Submit forms to an approved API.
Show loading, empty, error, and success states.
Ask for a new endpoint requirement in the PR/task note.
```

Lovable must not:

```text
Invent endpoint URLs.
Directly write sensitive tables from browser code.
Create Supabase migrations.
Create RLS/RBAC policies.
Use service role keys.
Expose server secrets through VITE_ variables.
Change automation worker contracts.
Change database schema ownership.
```

If Lovable needs a new endpoint, the correct output is a contract request, not hidden implementation.

---

## 7. Cursor API Rules

Cursor may define and implement contracts only inside approved scope.

Cursor may:

```text
Update OpenAPI contracts.
Update JSON Schemas.
Add server-side API implementations after contract approval.
Add Worker Runtime adapters after contract approval.
Add tests and evidence.
Add migration only through cursor/db-* or approved migration task.
```

Cursor must not:

```text
Add endpoints that are not in the contract.
Change UI flows while implementing API unless the task explicitly includes UI.
Use production secrets in tests.
Introduce real external execution unless a task packet allows it.
Create a second competing OpenAPI file.
Implement against the deprecated root openapi path.
```

---

## 8. Contract Change Types

Contract changes must be classified before implementation.

| Change type | Example | Required review |
|---|---|---|
| Additive | New optional response field | Contract review |
| Breaking | Rename field, remove field, change enum | ADR or task packet approval |
| Security-sensitive | Auth, token, secret, role change | Security + platform review |
| Database-affecting | New persistence requirement | DB/migration review |
| UI-affecting | New UI flow needs endpoint | UI + contract review |
| Worker-affecting | New job type or status | Worker runtime review |

Breaking changes must not be hidden inside implementation PRs.

---

## 9. Versioning Rules

Current automation contract version is:

```text
1.0.0-phase0
```

Rules:

```text
Patch-level docs clarifications may keep the same version.
Additive compatible changes may increment patch/minor after approval.
Breaking changes require explicit ADR and version note.
Deprecated fields must be documented before removal.
No silent contract change is allowed.
```

---

## 10. Database / API Boundary

Database schema and API contract are related but not identical.

Rules:

```text
Database changes require migration review.
API changes require contract review.
A DB migration does not automatically approve a public API.
A UI need does not automatically approve a DB migration.
Worker output persistence must be mapped explicitly from API contract to DB tables.
```

Direct browser writes to sensitive operational, accounting, automation, pricing, or security tables are forbidden unless explicitly approved by architecture/governance documents.

---

## 11. Worker Contract Rules

Worker Runtime must communicate through approved automation contracts.

Allowed worker concepts:

```text
worker heartbeat
job claim
job status update
approved JSON schemas
mock/test evidence
```

Forbidden without task packet approval:

```text
real marketplace execution
real WhatsApp/Telegram sending
browser automation
external website calls
new production automation endpoint
hidden worker endpoint
second worker contract vocabulary
```

---

## 12. Pull Request Requirements

Any PR that changes API/contract must include:

```text
Contract path changed.
Reason for change.
Change type: additive / breaking / security-sensitive / DB-affecting / UI-affecting / worker-affecting.
Affected UI or Worker behavior.
Test/evidence plan.
Staging test requirement.
Rollback or compatibility note for risky changes.
```

If implementation is included, the PR must explain why contract and implementation are safe to review together. Otherwise, split contract and implementation into separate PRs.

---

## 13. Stop Conditions

Stop and create a new ADR or task packet if:

```text
Lovable invents an endpoint.
Cursor implements an endpoint not in contract.
A second OpenAPI contract is created without ADR.
Root openapi/ is used as implementation source.
A service role key appears in browser/client code.
A VITE_ variable contains a secret.
A migration is added because UI needs data but no contract exists.
Worker status/job vocabulary conflicts with canonical contract.
Real source execution is added during contract-only work.
```

---

## 14. Acceptance Criteria

This strategy is accepted when:

```text
automation/openapi/automation-v1.yaml is treated as canonical for automation.
openapi/ remains deprecated pointer-only.
Lovable consumes approved APIs only.
Cursor implements approved contracts only.
Contract changes happen before implementation.
API PRs classify change type.
Breaking changes require explicit approval.
Worker and UI do not invent separate vocabularies.
```

---

## 15. Final Rule

```text
Contract first.
Implementation second.
UI consumption third.
Production last.
```
