# WPC-0-006 Branch Protection Evidence

Status: Draft evidence
Owner: Ali Talebi Zadeh
Governance Owner: Mehdi Heydari
Final Approver: Afra
Branch: cursor/docs/WPC-0-006-branch-protection-evidence
Base: staging

---

## 1. Purpose

This file records the branch-protection evidence that can be proven from the repository workflow and recent PR behavior.

This is not a policy redesign.

This evidence separates:

- verified behavior,
- inferred behavior,
- and settings that still require direct GitHub Settings verification.

---

## 2. Evidence Sources

Recent WPC enforcement PRs used for evidence:

| PR | Purpose | Result |
|---|---|---|
| PR #184 | Boundary Inventory | Approved and merged to `staging` |
| PR #185 | PR Template Enforcement Alignment | Approved and merged to `staging` |
| PR #187 | CODEOWNERS Alignment | Approved and merged to `staging` |
| PR #192 | Boundary Guard Alignment | Approved and merged to `staging` |
| PR #194 | Enforcement Evidence File | Approved and merged to `staging` |

Workflow checks observed on these PRs:

- Boundary Guard
- Staging Check

---

## 3. Verified Branch Protection Behavior

### 3.1 PR approval is required before merge

Status: Verified by behavior.

Evidence:

- Earlier merge attempts before reviewer approval were blocked by GitHub.
- After reviewer approval from an account other than the last pusher, PRs became mergeable and were merged.
- Reviewer approval was recorded on WPC PRs before merge.

What this proves:

- At least one reviewer approval is required for normal merge flow into `staging`.

What this does not prove:

- It does not prove whether Code Owner review is required.
- It does not prove the exact number of required approvals from repository settings.

---

### 3.2 Required status checks are part of the practical merge gate

Status: Verified by workflow behavior and review flow.

Evidence:

- WPC PRs waited for GitHub checks before final review/merge decisions.
- Boundary Guard and Staging Check ran on PRs to `staging`.
- The checks completed successfully before merge.

Observed checks:

- Boundary Guard
- Staging Check

What this proves:

- These checks are active on PRs targeting `staging`.

What this does not prove:

- It does not prove, from settings alone, that GitHub Branch Protection marks these checks as strictly required.
- Direct repository settings verification is still needed for a complete branch protection audit.

---

### 3.3 Direct merge/push bypass was not used in WPC work

Status: Verified by process behavior.

Evidence:

- WPC-0-001 through WPC-0-005 were performed through branches and PRs.
- Changes were merged to `staging` through PRs.
- No WPC enforcement task was directly pushed to `staging` as a normal working method.

What this proves:

- The team followed the PR-based flow.

What this does not prove:

- It does not prove that direct push to `staging` is technically blocked for all users.
- Direct branch protection settings must be checked in GitHub UI or API with sufficient permissions.

---

## 4. Not Directly Verified Yet

The following branch protection settings still need direct verification from GitHub repository settings:

1. Whether `Require a pull request before merging` is enabled on `staging`.
2. Whether `Require approvals` is enabled and how many approvals are required.
3. Whether `Require review from Code Owners` is enabled.
4. Whether `Dismiss stale pull request approvals when new commits are pushed` is enabled.
5. Whether `Require status checks to pass before merging` is enabled.
6. Which exact status checks are required.
7. Whether conversation resolution is required before merge.
8. Whether force pushes are blocked.
9. Whether branch deletion is restricted.
10. Whether administrators can bypass branch protection.

---

## 5. Current Conclusion

Branch protection is partially evidenced by real PR behavior.

Verified:

- PR approval behavior is active in practice.
- Boundary Guard runs on PRs.
- Staging Check runs on PRs.
- Recent WPC changes used branch -> PR -> approval -> checks -> merge flow.

Not fully verified:

- Exact GitHub Branch Protection settings.
- Code Owner review enforcement.
- Direct push restriction.
- Admin bypass settings.

---

## 6. Decision

WPC-0-006 should be treated as:

Branch Protection Evidence — Partial / behavior-based evidence complete.

This is enough to document what has been observed.

A later task should capture direct settings evidence from GitHub UI/API, especially for:

- Code Owner review requirement,
- required status checks,
- direct push restrictions,
- and admin bypass policy.

---

## 7. Follow-up Recommendation

Create a later task:

WPC-0-009 — Branch Protection Settings Verification

Scope:

- capture screenshots or API output from GitHub branch protection settings,
- verify required checks,
- verify Code Owner review requirement,
- verify direct push and force-push restrictions,
- attach evidence to `docs/evidence/**`.
