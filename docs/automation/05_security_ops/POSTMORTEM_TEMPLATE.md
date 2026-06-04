# Postmortem Template — Afra Automation Phase 0

This is a reusable, blameless, learning-focused postmortem template for Phase 0 incidents.

Use this template for incidents affecting documentation, contracts, dummy-worker flow, test readiness, migration planning, security controls, secrets policy, or Phase 0 safety boundaries.

Do not include secrets, credentials, private customer data, production-sensitive values, or real external platform data in this template.

Related references:

1. `docs/automation/05_security_ops/RUNBOOK.md`
2. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
3. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
4. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`

## Phase 0 scope note

This template applies only to Phase 0 documentation, contracts, schemas, dummy-worker planning, dummy-job lifecycle, safe dummy E2E flow, review process, migration planning, and security controls.

Real external automation incidents are out of scope unless a later approved phase authorizes the relevant real module and runbook.

## Blameless principle

This postmortem must focus on learning and prevention, not blame.

Use neutral language. Describe system, process, documentation, contract, review, or testing gaps. Do not politicize, accuse, shame, or assign personal blame.

---

## Incident ID

`INC-YYYYMMDD-###`

## Linked incident record

`<link or path to incident record created from docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md>`

## Postmortem owner

`<name or role>`

## Date

`<YYYY-MM-DD>`

## Phase label

Select one:

- [ ] `PHASE-0`
- [ ] `BASELINE`
- [ ] `FUTURE`
- [ ] `BLOCKED / needs clarification`

## Classification

Select all that apply:

- [ ] Contract gap
- [ ] Testing gap
- [ ] Process gap
- [ ] Documentation gap
- [ ] Migration planning gap
- [ ] Security / secrets gap
- [ ] RLS/RBAC planning gap
- [ ] Review / PR workflow gap
- [ ] Phase boundary gap
- [ ] Other: `<describe without sensitive data>`

## Summary

`<short non-sensitive summary of what happened>`

## Impact

Describe the impact without private data.

- Affected area:
- Affected documents/contracts:
- Affected dummy-worker flow:
- Affected testing or acceptance criteria:
- Security impact:
- Secret exposure impact:
- Migration/RLS impact:

## Detection

How was the issue detected?

- [ ] Review comment
- [ ] PR checklist
- [ ] Test case
- [ ] Manual inspection
- [ ] Contract/schema comparison
- [ ] Runbook execution
- [ ] Incident escalation
- [ ] Other: `<describe>`

Detection details:

`<non-sensitive details>`

## Timeline

| Time | Event | Actor / role | Notes |
|---|---|---|---|
| `<time>` | Detected | `<role>` | `<non-sensitive note>` |
| `<time>` | Investigated | `<role>` | `<non-sensitive note>` |
| `<time>` | Mitigated | `<role>` | `<non-sensitive note>` |
| `<time>` | Resolved | `<role>` | `<non-sensitive note>` |

## Root cause

What was the primary cause?

`<describe the system/process/documentation/contract/testing cause without blame>`

## Contributing factors

List contributing conditions.

1. `<factor>`
2. `<factor>`
3. `<factor>`

Possible categories:

- unclear scope
- missing contract detail
- missing test case
- incomplete review checklist
- missing owner approval
- ambiguous migration/RLS impact
- unclear secrets policy application
- missing runbook procedure

## What went well

1. `<what helped detection, mitigation, or learning>`
2. `<what worked as intended>`
3. `<what reduced impact>`

## What went wrong

Use neutral, non-blaming language.

1. `<process or system gap>`
2. `<documentation or testing gap>`
3. `<review or communication gap>`

## What was missing

1. `<missing document, contract, test, checklist, owner, or rule>`
2. `<missing validation or review step>`
3. `<missing escalation path>`

## Corrective actions

Corrective actions fix the immediate issue.

| Action | Owner | Due date | Status | Verification |
|---|---|---|---|---|
| `<action>` | `<owner>` | `<YYYY-MM-DD>` | `<open/in progress/done>` | `<how closure will be checked>` |

## Preventive actions

Preventive actions reduce the chance of recurrence.

| Action | Owner | Due date | Status | Related test / doc |
|---|---|---|---|---|
| `<action>` | `<owner>` | `<YYYY-MM-DD>` | `<open/in progress/done>` | `<test case or doc path>` |

## Owners and due dates

| Owner | Responsibility | Due date | Follow-up location |
|---|---|---|---|
| `<owner>` | `<responsibility>` | `<YYYY-MM-DD>` | `<PR/task/doc/test>` |

## Verification of closure

Closure is verified only when:

1. Corrective actions are complete or explicitly deferred with owner approval.
2. Preventive actions are tracked.
3. Related documentation is updated if needed.
4. Related contract/schema/test case is updated if needed.
5. `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md` is updated if a test gap was found.
6. Migration/RLS/RBAC follow-up is tracked if relevant.
7. Secret/security follow-up is tracked if relevant.
8. The owner accepts the resolution.

Verification notes:

`<non-sensitive notes>`

## Follow-up PRs / Task Packets / docs

- PR:
- Task Packet:
- Related docs:
- Related test cases:
- Related ADR, if needed:

## Lessons learned

1. `<lesson>`
2. `<lesson>`
3. `<lesson>`

## Final status

Select one:

- [ ] Open
- [ ] Mitigated, follow-up pending
- [ ] Resolved
- [ ] Escalated
- [ ] Deferred with owner approval

## Final note

This postmortem is complete only when it produces clear learning and owned follow-up actions. It must not include secrets, real incident data from external automation, blame-oriented language, or production-sensitive details.
