# Definition of Done

A Phase 0 task is not done until all Done checks pass.

## Required before delivery

- Task stayed within approved scope.
- Files changed are only the approved files.
- No real bot behavior was added.
- No real external platform call was added.
- No secret was committed.
- No unapproved migration was added.
- RLS/RBAC impact is documented.
- Test case IDs are updated.
- Acceptance criteria are satisfied.
- Reviewer can verify the output.

## Required report

Every delivery must include:

- files inspected
- files changed
- reason for change
- migration impact
- RLS/RBAC impact
- security impact
- test result
- remaining risk

## Not done if

- It is not testable.
- It changes extra files.
- It creates hidden dependencies.
- It introduces real automation in Phase 0.
- It requires secrets to work.
