# Incident State Template — Afra Automation Phase 0

Use this template for Phase 0 incidents related to documentation, contracts, schemas, dummy-worker flow, safe dummy E2E testing, review process, or related safe operations.

Do not include secrets, credentials, private customer data, production-sensitive values, or real external platform data in this template.

Related references:

1. `docs/automation/05_security_ops/RUNBOOK.md`
2. `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`
3. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`

## When to use this template

Use this template when a Phase 0 issue needs active tracking, escalation, or follow-up.

Examples:

1. Documentation conflict.
2. Contract/schema mismatch.
3. Dummy-worker lifecycle ambiguity.
4. Stale heartbeat test ambiguity.
5. Checkpoint or artifact contract confusion.
6. Secret exposure concern.
7. Migration/RLS/RBAC concern.
8. PR/review process failure.
9. Phase boundary confusion.
10. Repeated failure in a safe dummy-flow test.

Real external automation incidents are out of scope unless a later approved phase authorizes the relevant real module and runbook.

---

## Incident ID

`INC-YYYYMMDD-###`

## Title

`<short non-sensitive incident title>`

## Date / time opened

`<YYYY-MM-DD HH:MM timezone>`

## Reporter

`<name or role>`

## Owner

`<name or role>`

## Phase label

Select one:

- [ ] `PHASE-0`
- [ ] `BASELINE`
- [ ] `FUTURE`
- [ ] `BLOCKED / needs clarification`

## Severity

Select one:

- [ ] Low — minor documentation or review issue with no security or acceptance impact
- [ ] Medium — blocks task progress or creates ambiguity in Phase 0 acceptance
- [ ] High — affects security, RLS/RBAC, migration safety, contract correctness, or dummy E2E readiness
- [ ] Critical — possible secret exposure, unsafe migration, unauthorized production impact, or severe boundary violation

## Current state

Allowed states:

- [ ] Investigating
- [ ] Mitigating
- [ ] Monitoring
- [ ] Resolved
- [ ] Escalated

## Affected scope

Select all that apply:

- [ ] Documentation
- [ ] OpenAPI contract
- [ ] JSON schema
- [ ] Job lifecycle
- [ ] Worker runtime spec
- [ ] Dummy worker spec
- [ ] Dummy E2E flow
- [ ] RLS/RBAC design
- [ ] Migration/rollback design
- [ ] Secrets policy
- [ ] Runbook
- [ ] Test case registry
- [ ] Pull request / review process
- [ ] Other: `<describe without sensitive data>`

## User / business impact

`<describe impact without private customer data>`

## Security impact

Select one:

- [ ] None known
- [ ] Possible policy gap
- [ ] Possible access-control issue
- [ ] Possible secret exposure
- [ ] Possible migration/RLS/RBAC risk
- [ ] Confirmed security issue

Notes:

`<non-sensitive notes>`

## Secret exposure impact

Select one:

- [ ] No secret exposure suspected
- [ ] Secret-like placeholder only
- [ ] Possible real secret exposure
- [ ] Confirmed real secret exposure
- [ ] Unknown / needs owner review

If possible or confirmed real secret exposure:

1. Stop related work.
2. Do not paste the value anywhere.
3. Escalate privately to the owner.
4. Follow `docs/automation/05_security_ops/RUNBOOK.md` and `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md` if relevant.

## Migration / RLS impact

Select all that apply:

- [ ] No migration impact
- [ ] No RLS/RBAC impact
- [ ] Possible migration impact
- [ ] Possible RLS/RBAC impact
- [ ] Confirmed migration issue
- [ ] Confirmed RLS/RBAC issue
- [ ] Needs review before continuing

Notes:

`<non-sensitive notes>`

## Current mitigation

`<what has been done so far; do not include commands, secrets, or private values>`

## Next action

`<specific next action, owner, and expected follow-up>`

## Last update timestamp

`<YYYY-MM-DD HH:MM timezone>`

## Linked PR / Task Packet / docs

- PR: `<link or PR number>`
- Task Packet: `<task packet id>`
- Related document(s): `<repo path(s)>`
- Related test case(s): `<test case id(s)>`

## Timeline

| Time | State | Actor | Update |
|---|---|---|---|
| `<time>` | `<state>` | `<role>` | `<non-sensitive update>` |

## Decision log

| Time | Decision | Owner | Notes |
|---|---|---|---|
| `<time>` | `<decision>` | `<owner>` | `<non-sensitive notes>` |

## Resolution criteria

This incident can be marked `Resolved` only when:

1. The immediate issue is understood.
2. Unsafe work is stopped or corrected.
3. Security, secret, migration, and RLS/RBAC impacts are assessed.
4. Required follow-up tasks are created.
5. A postmortem is created if the issue is repeated, high severity, critical, or security-related.
6. The owner or reviewer accepts the resolution.

## Postmortem required?

Select one:

- [ ] No
- [ ] Yes — use `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md`
- [ ] Unknown / owner decision needed

## Final notes

`<optional non-sensitive notes>`
