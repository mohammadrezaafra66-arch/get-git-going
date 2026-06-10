# GitHub Guardrails / PR Protection Strategy

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Proposed for Phase-0 governance  
Source of Truth: GitHub  
Related policies:

```text
docs/process/SOURCE_OF_TRUTH.md
docs/process/lovable-cursor-boundary.md
docs/process/BRANCH_STRATEGY.md
docs/process/ENVIRONMENT_STRATEGY.md
docs/process/OPENAPI_CONTRACT_STRATEGY.md
.github/workflows/boundary-guard.yml
.github/CODEOWNERS
.github/pull_request_template.md
```

---

## 1. Purpose

This document defines how GitHub must protect AfraKala Automation Platform from unsafe changes by Lovable, Cursor, humans, and emergency hotfixes.

The goal is to make GitHub act as the gatekeeper between generated work and accepted production work.

---

## 2. Final Decision

```text
GitHub must block or flag boundary violations before merge.
main must be protected by process and branch protection.
staging must be protected from accidental production usage.
Lovable must be blocked from database/worker/server/contract changes by default.
Cursor must be blocked from broad UI changes unless scoped.
Docs-only work must stay docs-only.
```

GitHub is not only storage. It is the approval gate.

---

## 3. Guardrail Layers

| Layer | Tool / File | Purpose |
|---|---|---|
| Human review | Pull Request | Review scope, intent, risk |
| Ownership | `.github/CODEOWNERS` | Require owner attention for sensitive paths |
| PR template | `.github/pull_request_template.md` | Force scope/risk/test explanation |
| Automated boundary check | `.github/workflows/boundary-guard.yml` | Detect branch/path violations |
| Branch protection | GitHub repository settings | Prevent direct/unsafe merge |
| Release discipline | `main` only | Production updates only from accepted main |

---

## 4. Required Main Branch Protection

`main` must be configured as the production-approved branch.

Recommended GitHub branch protection settings for `main`:

```text
Require a pull request before merging = enabled
Require approvals = enabled
Require review from Code Owners = enabled
Dismiss stale approvals when new commits are pushed = enabled
Require status checks to pass before merging = enabled
Require branches to be up to date before merging = recommended
Require conversation resolution before merging = enabled
Block force pushes = enabled
Block deletions = enabled
Restrict direct pushes = enabled where possible
Allow bypass = owner only / avoid routine bypass
```

Required status checks should include:

```text
Boundary Guard
Build / lint / test checks when available
Secret scan checks when available
```

---

## 5. Recommended Staging Branch Protection

`staging` is not production, but it still affects human testing.

Recommended GitHub branch protection settings for `staging`:

```text
Require a pull request before merging = enabled
Require status checks to pass before merging = enabled
Require conversation resolution before merging = recommended
Block force pushes = enabled
Block deletions = enabled
```

`staging` must not be used as production.

---

## 6. Boundary Guard Workflow

The Boundary Guard workflow must run on pull requests.

It checks:

```text
Head branch pattern
Changed file paths
Forbidden path changes by branch type
Secret-like files committed by mistake
Docs-only claims crossing into implementation files
Lovable touching worker/db/server/contracts
Cursor touching UI outside approved scope
Deprecated root openapi implementation usage
```

The first version is intentionally conservative and path-based.

It does not replace human review.

---

## 7. Lovable Guardrails

Lovable branches should use:

```text
lovable/*
```

Lovable may change UI paths by default:

```text
src/routes/
src/components/
src/shared/components/
```

Lovable should be blocked or reviewed if it touches:

```text
supabase/migrations/
automation/worker-runtime/
server/
openapi/
automation/openapi/
automation/schemas/
deploy/
.github/workflows/
.env files
```

Reason: Lovable is UI generation/editing by default, not backend/database/worker governance.

---

## 8. Cursor Guardrails

Cursor branches should use:

```text
cursor/worker-*
cursor/api-*
cursor/db-*
```

Cursor must stay inside task scope.

Default restrictions:

```text
cursor/worker-* must not change broad UI paths.
cursor/api-* must not change broad UI components without UI scope.
cursor/db-* must not change UI or worker runtime without explicit task approval.
```

Cursor may change docs/evidence related to its task.

---

## 9. Docs Guardrails

Docs branches should use:

```text
docs/*
```

Docs-only PRs may target `main` directly only when they change:

```text
docs/
.github/pull_request_template.md
.github/CODEOWNERS
.github/workflows/boundary-guard.yml
```

Docs-only PRs must not change:

```text
src/
server/
supabase/migrations/
automation/worker-runtime/src/
automation/worker-runtime/tests/
package.json
lockfiles
production deploy files
```

---

## 10. Secret Guardrails

The workflow should fail when unsafe env/secrets files are added.

Forbidden committed files by default:

```text
.env
.env.production
.env.staging
.env.local
*.pem
*.key
*service-role*
```

Allowed templates:

```text
.env.example
.env.production.example
.env.staging.example
```

Server secrets must never use the `VITE_` prefix.

---

## 11. OpenAPI Guardrails

The canonical automation contract is:

```text
automation/openapi/automation-v1.yaml
```

The root `openapi/` folder is pointer/deprecated unless a future ADR says otherwise.

Guardrails:

```text
Do not implement against root openapi/.
Do not create a second competing OpenAPI contract.
Do not add API implementation before contract approval.
Do not let Lovable invent endpoints.
```

---

## 12. Merge Gate Rules

A PR should not merge if:

```text
Boundary Guard fails.
It changes sensitive paths without the right branch/task scope.
It includes secrets or unsafe env files.
It mixes UI, DB, worker, API, and deploy without ADR/task approval.
It targets main with implementation work that has not passed staging when required.
It has no rollback note for risky production changes.
```

---

## 13. Manual Override Rules

Manual override is allowed only for real emergencies.

If a guardrail is bypassed, the PR must include:

```text
Reason for bypass
Who approved it
Risk accepted
Rollback plan
Follow-up issue/task packet
```

Bypass must not become normal workflow.

---

## 14. Acceptance Criteria

This strategy is accepted when:

```text
Boundary Guard workflow exists.
main protection settings are configured.
staging protection settings are configured when staging is created.
CODEOWNERS remains active.
PR template remains active.
Lovable path violations are detected.
Cursor path violations are detected.
Secret-like committed files are blocked.
```

---

## 15. Final Rule

```text
Lovable and Cursor may propose changes.
GitHub must inspect changes.
Humans must approve changes.
Only approved main may reach production.
```
