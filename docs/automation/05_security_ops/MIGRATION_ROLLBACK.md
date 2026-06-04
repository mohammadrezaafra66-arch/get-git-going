# Migration and Rollback Policy — Afra Automation Phase 0

This document defines the rollback-first policy for any future automation-related database or access-control change.

It is a policy document only. It does not authorize migrations, SQL implementation, runtime code, real bots, real external integrations, or production data-path changes.

## 1. Hard rule

Rollback or recovery must be known before a migration is approved.

No automation-related database change may be merged unless the team can explain, before merge:

1. What changes.
2. What can fail.
3. How failure is detected.
4. How the system is restored or recovered.
5. Who approves the recovery path.
6. How the result is validated.

If rollback or recovery is unknown, the migration is not ready.

## 2. Phase 0 default position

Phase 0 should not ship automation migrations.

Automation migrations are not allowed in Phase 0 unless all of the following are already approved:

1. Table design.
2. Access-control policy.
3. RLS/RBAC impact review.
4. Audit impact review.
5. Test plan.
6. Rollback or recovery plan.
7. Backup requirement.
8. Owner approval.
9. Acceptance criteria.

Phase 0 may document future database design. Documentation is not permission to migrate.

## 3. Canonical references

Before approving any future automation migration, review:

1. `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`
2. `docs/automation/05_security_ops/RUNBOOK.md`
3. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
4. `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`
5. `docs/automation/05_security_ops/RELEASE_CHECKLIST.md`
6. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`
7. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

If these documents disagree, follow the stricter safety rule.

## 4. Mandatory pre-migration checklist

Before any automation migration can be approved, the task must document all items below.

### 4.1 Purpose

- What problem does the migration solve?
- Why is a migration required instead of documentation-only design?
- Why is this safe for the current phase?

### 4.2 Affected objects

Identify every affected object conceptually:

1. Tables.
2. Columns.
3. Indexes.
4. Functions.
5. Triggers.
6. Policies.
7. Views.
8. RPCs.
9. Storage references.
10. Existing application modules.

### 4.3 RLS/RBAC impact

Document:

1. Which actors can read.
2. Which actors can write.
3. Which actions require server-side mediation.
4. Which access paths must be forbidden.
5. Whether browser access changes.
6. Whether worker access changes.
7. Whether service-role usage changes.

### 4.4 Audit impact

Document:

1. Which actions must be auditable.
2. Which actor performs the action.
3. What metadata is needed for audit.
4. Whether existing audit behavior is reused.
5. Whether new audit design is required.

### 4.5 Index / function / trigger impact

Document:

1. Whether new indexes are needed.
2. Whether existing query paths are affected.
3. Whether new functions are proposed.
4. Whether new triggers are proposed.
5. Whether any existing function or trigger behavior changes.

### 4.6 Data risk

Document:

1. Whether existing data is changed.
2. Whether data can be lost.
3. Whether data can be duplicated.
4. Whether data can become inconsistent.
5. Whether private or sensitive data is affected.
6. Whether performance can be affected.

### 4.7 Backup requirement

Document:

1. Whether backup is required.
2. What must be backed up.
3. Who confirms backup readiness.
4. Whether restore has been verified for the target environment.

### 4.8 Rollback strategy

Document one approved rollback or recovery pattern:

1. Reversible down path.
2. Restore from backup.
3. Forward-fix with explicit approval.

### 4.9 Validation plan

Document how success is checked:

1. Schema validation.
2. RLS/RBAC validation.
3. Audit validation.
4. Application smoke checks.
5. Dummy-flow checks when relevant.
6. Test case IDs from the registry.

### 4.10 Owner approval

Document:

1. Author.
2. Reviewer.
3. Owner/admin approval.
4. Security review if relevant.
5. Date of approval.

## 5. Migration risk classes

### 5.1 Low-risk additive

A low-risk additive migration introduces new structures without changing or deleting existing behavior.

Examples at policy level:

1. New table design after approval.
2. New nullable column after approval.
3. New non-destructive index after approval.
4. New metadata-only structure after approval.

Requirements:

1. RLS/RBAC design.
2. Audit impact review.
3. Rollback or forward-fix plan.
4. Test plan.
5. Owner approval.

### 5.2 Review-required structural

A review-required structural migration affects how existing or future automation data is organized.

Examples at policy level:

1. Changing relationships.
2. Changing constraints.
3. Changing policy behavior.
4. Changing function or trigger behavior.
5. Changing access paths.

Requirements:

1. Owner approval.
2. Security review.
3. RLS/RBAC review.
4. Backup decision.
5. Rollback/recovery plan.
6. Test evidence.

### 5.3 Destructive / high-risk

A destructive or high-risk migration can remove, rewrite, expose, or corrupt data or access boundaries.

Examples include:

1. Dropping tables.
2. Dropping columns.
3. Truncation.
4. Enum changes.
5. Auth/RLS/RBAC changes.
6. Service access changes.
7. Production data-path changes.
8. Changes affecting sensitive or financial data.

Requirements:

1. Explicit owner approval.
2. Verified backup requirement.
3. Recovery plan.
4. Security review.
5. Staging or safe-environment validation.
6. Incident response readiness.
7. Release checklist completion.

Destructive/high-risk changes are not allowed in Phase 0 unless explicitly approved outside the normal documentation-only flow.

## 6. Approved rollback / recovery patterns

### 6.1 Reversible down path

Use when the change can be safely undone through a documented reverse path.

Must define:

1. What is reversed.
2. What data is preserved.
3. What data may be lost.
4. How success is validated.

### 6.2 Restore from backup

Use when reversal is unsafe or impossible.

Must define:

1. Required backup.
2. Restore target.
3. Data loss window.
4. Validation plan.
5. Owner approval.

### 6.3 Forward-fix with explicit approval

Use only when rollback is riskier than a controlled forward fix.

Must define:

1. Why rollback is unsafe.
2. What forward fix will do.
3. What risk remains.
4. Who approved it.
5. How it will be verified.

Forward-fix is not a shortcut. It requires explicit approval.

## 7. Forbidden without explicit owner approval

The following are forbidden without explicit owner approval:

1. Destructive changes.
2. Dropping tables.
3. Dropping columns.
4. Truncation.
5. Enum changes.
6. Auth changes.
7. RLS changes.
8. RBAC changes.
9. Service access changes.
10. Production data-path changes.
11. Changes affecting sensitive data visibility.
12. Changes affecting service-role behavior.
13. Changes that weaken auditability.
14. Changes that bypass the existing Control Plane/Core.

## 8. Failure procedure

If a migration fails or appears unsafe:

1. Stop further database changes.
2. Do not retry blindly.
3. Do not improvise manual SQL edits.
4. Record the failure without exposing secrets or private data.
5. Identify affected objects.
6. Check backup or recovery readiness.
7. Escalate to the owner/admin reviewer.
8. Use `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md` when the issue affects acceptance, safety, or shared environments.
9. Use `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md` for repeated, high-severity, security-related, or process-impacting failures.
10. Apply only an approved rollback, restore, or forward-fix path.
11. Validate the final state.
12. Document follow-up actions.

## 9. Undocumented retry prohibition

Do not run another migration attempt just because the first attempt failed.

A retry requires:

1. Root cause or safe hypothesis.
2. Owner approval.
3. Backup/recovery confidence.
4. Updated validation plan.
5. Documented reason.

If these are missing, the retry is blocked.

## 10. Documentation required before approval

Before approval, the migration task must link to or include:

1. Table/design document.
2. RLS/RBAC policy review.
3. Audit impact review.
4. Migration risk class.
5. Rollback/recovery pattern.
6. Validation plan.
7. Test case IDs.
8. Release checklist.
9. Environment boundary assessment.
10. Owner approval.

## 11. Environment boundary

Migration risk depends on environment.

The environment must be identified using `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`.

Phase 0 default:

1. Documentation-only by default.
2. No automation migration by default.
3. No production-like migration unless separately approved.
4. No real credentials in migration tasks.
5. No hidden database path outside the existing source-of-truth model.

## 12. Final rule

If rollback or recovery is not known, the migration is not ready.

If RLS/RBAC impact is not known, the migration is not ready.

If audit impact is not known, the migration is not ready.

If owner approval is missing, the migration is not ready.

Phase 0 must remain rollback-first, design-first, and migration-safe.
