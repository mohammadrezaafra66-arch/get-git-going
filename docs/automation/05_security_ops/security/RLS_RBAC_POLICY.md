# RLS / RBAC Policy

## Phase 0 rule

No automation table may be migrated until its RLS/RBAC policy is documented and approved.

## Minimum requirements

- Every automation table must define who can read it.
- Every automation table must define who can write it.
- Worker access must be least-privilege.
- Admin/operator access must be separated from worker access.
- UI-only authorization is not enough.
- Service-role usage must remain server-side only.

## Required before migration

- Table ownership model.
- Role matrix.
- Read/write policy plan.
- Audit impact.
- Rollback plan.
