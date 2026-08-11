# WPC-0-008 Staging Check / Typecheck Strengthening Evidence

Status: Draft evidence
Owner: Ali Talebi Zadeh
Governance Owner: Mehdi Heydari
Final Approver: Afra
Branch: cursor/docs/WPC-0-008-staging-check-typecheck
Base: staging

---

## 1. Purpose

This file records the final Ali enforcement task for WPC / Phase 3.9 guardrails.

The goal is to strengthen the staging check by adding a real TypeScript typecheck gate and aligning the workflow with WPC / Phase 3.9 instead of older Phase 6 assumptions.

This task does not create any product feature, UI, backend, database migration, worker runtime, or production behavior.

---

## 2. Changes Made

### 2.1 `package.json`

Added a `typecheck` script:

```json
"typecheck": "tsc --noEmit"
```

Why this is safe:

- `typescript` already exists in `devDependencies`.
- `tsconfig.json` already uses `noEmit: true`.
- No new dependency was added.
- No lockfile update is required for a script-only change.

---

### 2.2 `.github/workflows/staging-check.yml`

Updated Staging Check from older Phase 6 assumptions to WPC / Phase 3.9 enforcement.

Main changes:

- renamed required-file validation to WPC governance files,
- required current `docs/process/**` files,
- required handoff and evidence templates,
- required enforcement evidence files,
- required current PR Template, CODEOWNERS, Boundary Guard, and Staging Check workflow files,
- kept forbidden `.env*` file check,
- added a blocking `npm run typecheck` step,
- kept lint as non-blocking warning for legacy baseline,
- kept `npm run build` as required.

---

## 3. Expected CI Behavior

For PRs to `staging` or `main`, Staging Check should now run:

1. required WPC governance/enforcement file validation,
2. forbidden real environment file check,
3. dependency installation,
4. `npm run typecheck`,
5. lint warning step,
6. `npm run build`.

Typecheck and build are blocking.

Lint remains warning-only because the repository previously documented a legacy lint baseline issue.

---

## 4. Scope Evidence

Expected changed files:

- `package.json`
- `.github/workflows/staging-check.yml`
- `docs/evidence/WPC-0-008-staging-check-typecheck.md`

Expected not changed:

- no application feature code,
- no UI files,
- no backend files,
- no Supabase or migration files,
- no automation runtime files,
- no CODEOWNERS changes,
- no branch protection settings,
- no secrets or real `.env*` files.

---

## 5. Validation Plan

This PR must not be merged unless:

- Boundary Guard passes,
- Staging Check passes,
- the new Typecheck step runs successfully,
- changed-file scope is limited to the expected files,
- reviewer approval is completed,
- the PR is merged to `staging`,
- local `staging` is synced after merge,
- `git status` returns clean.

---

## 6. Remaining Limitations

This task strengthens CI with a blocking typecheck gate.

It does not add unit tests because the current project does not yet define a `test` script in `package.json`.

A later task may add a minimal smoke or unit test script, but that is outside WPC-0-008 scope.

---

## 7. Final Decision

If this PR passes GitHub checks and is merged, WPC-0-008 can be considered complete.

At that point, Ali's original enforcement task list is functionally complete, with known follow-ups documented separately.
