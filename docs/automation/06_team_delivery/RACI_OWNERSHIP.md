# RACI Ownership

This is the non-sensitive GitHub version of team ownership for Phase 0 automation work.

## Roles

| Person | Primary responsibility | Review responsibility |
|---|---|---|
| Afra | Final owner, product direction, security approval, sensitive decisions | Final approval for sensitive scope, secrets, access, architecture and phase boundary |
| Porchista | Main coding owner, technical implementation, technical review | Reviews code quality, architecture fit, technical correctness and maintainability |
| Heidari | Execution, testing, documentation support | Reviews task completion, test evidence and documentation clarity |
| Talebizadeh | Execution, testing, quality control | Reviews acceptance criteria, test results and quality gates |

## Phase 0 rule

No one may start a task unless the task passes Definition of Ready.

No one may deliver a task unless the task passes Definition of Done.

## Sensitive work

Sensitive work requires Afra approval before merge.

Sensitive work includes:

- access control
- secrets
- database migration
- RLS/RBAC
- service access
- production deployment
- phase boundary changes
- any real automation beyond dummy flow
