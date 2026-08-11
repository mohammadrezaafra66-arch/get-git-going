# WPC-0-007 Labels Evidence and Taxonomy

Status: Draft evidence
Owner: Ali Talebi Zadeh
Governance Owner: Mehdi Heydari
Final Approver: Afra
Branch: cursor/docs/WPC-0-007-labels-evidence
Base: staging

---

## 1. Purpose

This file records the label taxonomy needed for WPC / Phase 3.9 enforcement.

This task does not create product features, UI, backend, Supabase changes, worker logic, or automation runtime.

The purpose is to make PR classification more consistent and easier to review.

---

## 2. Current Tool Limitation

During WPC-0-007, the available GitHub tool access did not expose a safe action for creating new repository labels.

The available label actions were limited to applying or removing existing labels on issues or PRs.

A test attempt to apply a common label was blocked by the tool safety layer.

Therefore, this task records the required label taxonomy and the exact intended use of each label.

Actual label creation must be completed later from GitHub UI or by an API action with explicit label-creation permission.

---

## 3. Required Labels

### 3.1 Source / Tool Labels

| Label | Purpose |
|---|---|
| `source:cursor` | PR created or primarily modified by Cursor. |
| `source:lovable` | PR created or primarily modified by Lovable. |
| `source:human` | PR created or primarily modified manually by a human. |

### 3.2 Scope Labels

| Label | Purpose |
|---|---|
| `scope:ui` | UI, layout, route, component, style, asset, or Lovable-facing change. |
| `scope:core` | Core business logic, `src/lib/**`, `src/integrations/**`, or backend-related app logic. |
| `scope:contract` | OpenAPI, schemas, API contracts, or shared interface changes. |
| `scope:automation` | Worker, automation, robot boundary, or automation schema work. |
| `scope:database` | Supabase, migrations, RLS, RBAC, auth, schema, seed, or database-related work. |
| `scope:governance` | Process docs, evidence, handoffs, CODEOWNERS, PR template, or repository rules. |
| `scope:ci` | GitHub Actions, checks, workflow logic, lint/build/typecheck enforcement. |
| `scope:ops` | Deployment, self-hosting, server, rollback, backup, or operations work. |

### 3.3 Risk Labels

| Label | Purpose |
|---|---|
| `risk:low` | Documentation-only or low-risk governance change. |
| `risk:medium` | Workflow, CODEOWNERS, config, or controlled enforcement change. |
| `risk:high` | Database, auth, security, deployment, or production-sensitive change. |
| `risk:production-critical` | Change that can affect production availability, secrets, data integrity, or release safety. |

### 3.4 Review / Gate Labels

| Label | Purpose |
|---|---|
| `review:afra-required` | Requires Afra approval or direct final review. |
| `review:ali-required` | Requires Ali technical review. |
| `review:mehdi-required` | Requires Mehdi governance/process review. |
| `review:codeowners` | Requires Code Owner review or review of owned sensitive paths. |

### 3.5 Enforcement Labels

| Label | Purpose |
|---|---|
| `evidence:required` | PR must include evidence before merge. |
| `evidence:complete` | Evidence has been attached, checked, or recorded. |
| `handoff:required` | PR crosses Lovable/Cursor or UI/Core boundary and needs handoff. |
| `handoff:complete` | Handoff exists and has been reviewed. |
| `stop-the-line` | PR has a blocking issue and must not be merged until resolved. |
| `blocked` | PR cannot continue until a dependency, access, or decision is resolved. |

### 3.6 Release Flow Labels

| Label | Purpose |
|---|---|
| `target:staging` | PR targets `staging`. |
| `target:main` | PR targets `main`. |
| `release:ready` | PR is ready to be included in release flow. |
| `release:hold` | PR or release should be held. |

---

## 4. Minimum Label Set

If the full taxonomy is too much to create immediately, the minimum useful set is:

1. `source:cursor`
2. `source:lovable`
3. `scope:ui`
4. `scope:core`
5. `scope:contract`
6. `scope:automation`
7. `scope:database`
8. `scope:governance`
9. `scope:ci`
10. `evidence:required`
11. `evidence:complete`
12. `handoff:required`
13. `stop-the-line`
14. `review:afra-required`
15. `blocked`

---

## 5. Labeling Rules

### 5.1 Lovable PRs

Lovable PRs should normally have:

- `source:lovable`
- `scope:ui`
- `target:staging`

If Lovable needs backend, API, database, worker, or contract work:

- add `handoff:required`
- add `evidence:required`
- do not merge until the required Cursor/Core handoff is complete.

### 5.2 Cursor Core PRs

Cursor core PRs should normally have:

- `source:cursor`
- one or more of:
  - `scope:core`
  - `scope:contract`
  - `scope:automation`
  - `scope:database`
  - `scope:ci`
  - `scope:governance`

If the PR touches UI paths, add:

- `handoff:required`
- `evidence:required`

### 5.3 Governance / Evidence PRs

Governance and evidence PRs should normally have:

- `source:cursor`
- `scope:governance`
- `evidence:complete` when the evidence file or PR comment is complete.

### 5.4 High-Risk PRs

PRs touching any of the following areas should receive stricter labels:

- `supabase/**`
- `supabase/migrations/**`
- `openapi/**`
- `automation/**`
- `.github/**`
- `deploy/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `.env*`

Recommended labels:

- `risk:high` or `risk:production-critical`
- `review:afra-required`
- `review:ali-required`
- `evidence:required`

---

## 6. Recommended Label Colors

These colors are suggestions only.

| Label family | Suggested color |
|---|---|
| `source:*` | `5319e7` |
| `scope:*` | `1d76db` |
| `risk:*` | `d93f0b` |
| `review:*` | `fbca04` |
| `evidence:*` | `0e8a16` |
| `handoff:*` | `006b75` |
| `stop-the-line` | `b60205` |
| `blocked` | `b60205` |
| `release:*` | `c5def5` |
| `target:*` | `bfdadc` |

---

## 7. Evidence Status

This task creates repository-level label taxonomy evidence.

Verified:

- Label taxonomy is documented.
- Label purpose and usage rules are defined.
- Minimum label set is defined.
- Current tool limitation is recorded honestly.

Not verified:

- Actual labels were not created through the current tool access.
- Existing repository label list was not retrieved through the current tool access.

---

## 8. Follow-up Recommendation

Create a follow-up task:

WPC-0-010 — Create GitHub Labels

Scope:

- create the minimum label set in GitHub UI or with a safe label-creation API action,
- apply labels to a sample PR,
- record evidence in `docs/evidence/**`,
- avoid using labels as a replacement for CI, CODEOWNERS, PR Template, or Branch Protection.

---

## 9. Final Decision

WPC-0-007 can be closed as label taxonomy and evidence.

Actual label creation remains a follow-up implementation step requiring GitHub label management access.
