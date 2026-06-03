# Migration and Rollback Policy

## Hard rule

No database change may be merged unless rollback is known before the change.

## Before any migration

The task must define:

- purpose of migration
- affected tables
- affected RLS/RBAC policies
- affected indexes
- affected functions or triggers
- expected data impact
- backup requirement
- rollback strategy
- test cases
- owner approval

## Forbidden without explicit approval

- destructive migration
- dropping tables
- dropping columns
- truncating data
- changing enum values
- changing auth/RBAC/RLS behavior
- changing service access
- changing production data paths

## Rollback requirement

Each migration must include one of these:

1. reversible SQL plan
2. backup and restore plan
3. forward-fix plan with owner approval

## Phase 0 rule

Phase 0 should not add automation database migrations until table design, access policy, rollback plan and acceptance criteria are approved.

## Failure procedure

If a migration fails:

1. stop further database changes
2. record the error
3. do not retry blindly
4. check backup/restore status
5. apply approved rollback or forward-fix
6. document incident and postmortem if needed
