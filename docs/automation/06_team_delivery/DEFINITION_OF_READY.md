# Definition of Ready

No Phase 0 task may start unless all Ready checks pass.

## Required before starting

- Task has a clear title.
- Task has a phase label.
- Task is confirmed as `PHASE-0` safe.
- Files to inspect are listed.
- Files allowed to change are listed.
- Acceptance criteria are listed.
- Test case IDs are linked.
- Security impact is considered.
- Migration impact is considered.
- RLS/RBAC impact is considered.
- Owner/reviewer is known.

## Not ready if

- Scope is unclear.
- It may create real bot behavior.
- It may touch secrets.
- It may change database without approved design.
- It may create parallel core/API/database/panel.
- It is too broad to test in one review.
