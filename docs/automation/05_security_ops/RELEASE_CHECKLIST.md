# Release Checklist — Afra Automation Phase 0

Use this checklist before merging Phase 0 automation documentation, contracts, schemas, security, operations, or dummy-worker preparation changes into `main`.

This checklist complements `.github/pull_request_template.md` and `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`.

A PR must not be merged if any required gate below fails.

## 1. Phase / scope gate

- [ ] The PR clearly states its phase label.
- [ ] The PR is `PHASE-0`, `BASELINE`, or approved documentation-only `FUTURE` planning.
- [ ] The PR scope matches `docs/automation/01_product_scope/PROJECT_SCOPE.md`.
- [ ] The PR does not introduce work outside the declared phase.
- [ ] The PR does not blur Phase 0 with Phase 1 implementation.
- [ ] Unclear items are marked `BLOCKED` or `FUTURE`, not implemented.

## 2. Documentation completeness gate

- [ ] The PR updates only approved files.
- [ ] The changed documents are clear enough for team execution.
- [ ] The changed documents do not contradict `README.md`, `AGENTS.md`, or the repository inventory.
- [ ] The changed documents preserve the existing `get-git-going` repository as Control Plane/Core.
- [ ] The changed documents preserve Supabase/PostgreSQL as source of truth.
- [ ] The changed documents preserve React/TanStack/Lovable as UI/operator layer only.
- [ ] The changed documents keep Worker Runtime separate and dummy-only in Phase 0.
- [ ] Any new or changed document is linked to the relevant parent document when appropriate.

## 3. Contract consistency gate

- [ ] Contract-related changes align with `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`.
- [ ] Job lifecycle references align with `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`.
- [ ] OpenAPI-related changes align with `openapi/automation-v1.yaml`.
- [ ] JSON schema changes align with the relevant file under `schemas/automation/`.
- [ ] The term `artifact` is used as the canonical contract term where artifact registration is discussed.
- [ ] `schemas/automation/artifact.schema.json` remains the canonical artifact contract.
- [ ] No conflicting schema, API, lifecycle, or artifact contract is introduced.
- [ ] Schema/OpenAPI examples do not contain real credentials, private endpoints, or production values.

## 4. Security / secrets gate

Review against:

- `docs/automation/05_security_ops/SECURITY_BASELINE.md`
- `docs/automation/05_security_ops/SECRETS_POLICY.md`

Checklist:

- [ ] No API key is committed.
- [ ] No password is committed.
- [ ] No service key is committed.
- [ ] No service role key is committed.
- [ ] No JWT secret is committed.
- [ ] No cookie or token is committed.
- [ ] No certificate or private key is committed.
- [ ] No database dump, backup archive, or storage export is committed.
- [ ] No production `.env` file is committed.
- [ ] No browser session file or browser profile is committed.
- [ ] No proxy credential is committed.
- [ ] No private endpoint or private infrastructure value is exposed.
- [ ] `.env.example` changes contain placeholders only.
- [ ] No privileged key is exposed to browser/client code.
- [ ] No builder prompt, generated doc, or example echoes a real secret.

## 5. RLS / RBAC review gate

Review against `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`.

- [ ] The PR does not weaken existing RLS/RBAC boundaries.
- [ ] The PR does not introduce frontend-only authorization for sensitive actions.
- [ ] Any future automation table design includes read model, write model, actor ownership, review path, and audit implications.
- [ ] Any future worker access concept separates worker permissions from operator permissions.
- [ ] Any future privileged action is documented as server-side mediated.
- [ ] No browser-side privileged access is introduced.
- [ ] No service role distribution to workers is introduced.

## 6. Migration / rollback gate

Review against `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`.

- [ ] No database migration is included.
- [ ] No migration SQL is added.
- [ ] No existing migration is edited.
- [ ] No undocumented manual SQL edit is introduced.
- [ ] No destructive database operation is introduced.
- [ ] If the PR discusses future table design, it clearly remains design-only.
- [ ] Any future migration mention includes requirement for design, RLS/RBAC, audit, rollback, testing, and owner approval before implementation.

## 7. Testing evidence gate

Review against:

- `docs/automation/05_security_ops/TESTING_STRATEGY.md`
- `docs/automation/05_security_ops/TEST_CASE_REGISTRY.md`

Checklist:

- [ ] The PR states whether it is documentation-only or requires verification.
- [ ] Relevant test case IDs are listed when applicable.
- [ ] Missing test cases are recorded as follow-up work.
- [ ] Dummy-flow references remain dummy-only.
- [ ] No real external platform is required to verify the PR.
- [ ] Build/lint/typecheck status is reported if runtime code changed.
- [ ] If commands were not run, the reason is documented honestly.

## 8. Environment boundary gate

Review against `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`.

- [ ] The PR does not introduce production deployment behavior.
- [ ] The PR does not introduce production worker behavior.
- [ ] The PR does not expose production environment values.
- [ ] The PR does not require real external integrations.
- [ ] Local, LAN, and production boundaries remain distinct.
- [ ] Any environment examples are non-operational placeholders.
- [ ] No runtime dependency on Lovable Cloud is introduced.

## 9. Reviewer / owner approval gate

- [ ] The PR uses `.github/pull_request_template.md`.
- [ ] The PR has a linked Task Packet or explains why no Task Packet is required.
- [ ] The PR includes reviewer notes.
- [ ] CODEOWNERS review is satisfied.
- [ ] Sensitive changes have repository owner/admin reviewer approval.
- [ ] Remaining risks are documented.
- [ ] Follow-up tasks are listed when needed.

## 10. Forbidden work gate

Reject the PR if any item below is true:

- [ ] Real bot logic was added.
- [ ] Real scraping was added.
- [ ] Real sending was added.
- [ ] OCR/STT production pipeline was added.
- [ ] AI/LLM production pipeline was added.
- [ ] Browser automation was added.
- [ ] Proxy/account automation was added.
- [ ] Laravel core was added.
- [ ] Parallel database was added.
- [ ] Parallel API layer was added.
- [ ] Parallel admin panel was added.
- [ ] Unapproved migration was added.
- [ ] Real secret or production credential was added.
- [ ] Production external integration was added.
- [ ] Runtime plugin/driver execution was added.
- [ ] Phase 0 dummy-worker-only boundary was violated.

If any checkbox in this section is checked, do not merge.

## 11. Linked records

- [ ] Linked PR: `<PR number or URL>`
- [ ] Linked Task Packet: `<task packet id or not applicable>`
- [ ] Linked test cases: `<test case ids or not applicable>`
- [ ] Linked ADRs: `<ADR paths or not applicable>`
- [ ] Linked incident/postmortem: `<paths or not applicable>`
- [ ] Reviewer notes: `<summary>`

## 12. Final sign-off

| Role | Name / handle | Date | Sign-off notes |
|---|---|---|---|
| Author | `<name>` | `<YYYY-MM-DD>` | `<notes>` |
| Technical reviewer | `<name>` | `<YYYY-MM-DD>` | `<notes>` |
| Security / owner reviewer | `<name>` | `<YYYY-MM-DD>` | `<notes>` |
| Final approver | `<name>` | `<YYYY-MM-DD>` | `<notes>` |

## 13. Final merge decision

Select one:

- [ ] Approved to merge.
- [ ] Blocked — scope issue.
- [ ] Blocked — security/secrets issue.
- [ ] Blocked — migration/RLS issue.
- [ ] Blocked — contract/schema inconsistency.
- [ ] Blocked — forbidden work included.
- [ ] Blocked — missing review or testing evidence.

Final decision notes:

`<non-sensitive notes>`
