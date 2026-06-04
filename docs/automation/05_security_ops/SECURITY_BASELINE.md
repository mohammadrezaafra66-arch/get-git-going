# Security Baseline — Afra Automation Phase 0

This document defines the canonical Phase 0 security baseline for Afra Automation documentation, contracts, schemas, and dummy-worker preparation.

It extends the repository-wide rules in `AGENTS.md` and `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`. It does not replace them.

Phase 0 is documentation, contracts, schemas, and dummy-worker preparation only. Phase 0 does not permit real automation, real bots, real scraping, real sending, OCR/STT, AI/LLM pipelines, browser automation, proxy/account automation, production integrations, migrations, or runtime worker execution against real external systems.

## 1. Purpose

The purpose of this baseline is to ensure that Phase 0 work remains safe while the automation foundation is being prepared.

This document defines:

1. Minimum security principles.
2. Sensitive material that must never be committed.
3. Log redaction expectations.
4. Dummy-worker artifact, checkpoint, and log safety rules.
5. Review triggers.
6. Escalation rules for suspected leaks or unsafe changes.

## 2. Canonical references

This baseline must be read together with:

1. `AGENTS.md`
2. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
3. `docs/automation/05_security_ops/SECRETS_POLICY.md`
4. `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`
5. `docs/automation/05_security_ops/RUNBOOK.md`
6. `docs/automation/05_security_ops/RELEASE_CHECKLIST.md`
7. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`

If this document and a stricter repository-wide rule disagree, follow the stricter rule.

## 3. Minimum baseline principles

### 3.1 No secrets in GitHub

No real secret may be committed to GitHub.

Only placeholder examples are allowed in committed files.

Allowed examples:

1. Empty values.
2. `change-me` placeholders.
3. Clearly fake local examples.
4. Non-sensitive schema examples.

Forbidden examples:

1. Real keys.
2. Real tokens.
3. Real passwords.
4. Real cookies.
5. Real service role keys.
6. Real production endpoints that reveal private infrastructure.

### 3.2 Least privilege

Every future automation capability must be designed with least privilege.

Principles:

1. A worker should only access the contracts and records required for its job.
2. A user should only see and operate the automation features allowed by role.
3. Sensitive commands must not be available to general users.
4. Future service credentials must be scoped and rotated outside GitHub.
5. Service-role access must not be distributed to worker machines during Phase 0.

### 3.3 Separation of browser, server, and worker concerns

Browser/UI, server/core, and worker runtime concerns must remain separated.

Rules:

1. Browser/UI must not execute worker logic.
2. Browser/UI must not contain secrets.
3. Server/core owns approved API boundaries.
4. Worker Runtime is a separate execution layer.
5. Plugin/driver logic must not live inside React/Lovable UI.
6. Phase 0 worker behavior is dummy-only.

### 3.4 RLS/RBAC for sensitive data changes

Any future automation table or sensitive command must have RLS/RBAC design before migration or implementation.

Phase 0 may document RLS/RBAC expectations. It must not skip them.

### 3.5 Auditability for sensitive actions

Sensitive future actions must be auditable.

Examples of sensitive future actions:

1. Starting a worker.
2. Stopping a worker.
3. Cancelling a job.
4. Retrying a job.
5. Changing worker permissions.
6. Changing plugin/driver configuration.
7. Registering or modifying credentials outside GitHub.
8. Changing access rules.

Phase 0 must document audit expectations before implementation.

### 3.6 Source-of-truth discipline

Supabase/PostgreSQL remains the source of truth.

Google Sheets, Excel, local JSON, SQLite, local worker files, and generated artifacts must not become platform source of truth.

Temporary files may be used only as documented cache, local state, or export references.

### 3.7 No parallel core or hidden side channel

Phase 0 must not create:

1. Parallel core.
2. Parallel database.
3. Parallel API layer.
4. Parallel admin panel.
5. Hidden worker control path.
6. Secret side channel.
7. Production integration outside the approved control plane.

Any exception requires a new accepted ADR.

## 4. Sensitive material definition

Sensitive material includes, but is not limited to:

1. API keys.
2. Service keys.
3. Service role keys.
4. Role keys.
5. JWT secrets.
6. Passwords.
7. Cookies.
8. Session tokens.
9. Access tokens.
10. Refresh tokens.
11. Private keys.
12. Certificates.
13. Browser profiles.
14. Proxy credentials.
15. Account credentials.
16. Database dumps.
17. Backup archives.
18. Storage exports.
19. Production `.env` files.
20. Private endpoints.
21. Internal infrastructure addresses that reveal private operations.
22. Customer data.
23. Private operational data.
24. Screenshots that expose credentials, sessions, or customer/private data.
25. Logs containing secrets or private operational data.

Sensitive material must not be committed to GitHub, included in PR descriptions, pasted into issue comments, or placed in documentation examples.

## 5. Log redaction expectations

Logs must be safe by default.

Future worker logs, API logs, runbook examples, and documentation examples must not contain:

1. API keys.
2. Service role keys.
3. JWT secrets.
4. Passwords.
5. Cookies.
6. Tokens.
7. Private keys.
8. Browser profiles.
9. Proxy credentials.
10. Customer private data.
11. Private production endpoints.
12. Database dump paths containing private details.

Safe logs may contain:

1. Non-sensitive worker id.
2. Non-sensitive job id.
3. Timestamp.
4. Event name.
5. Severity level.
6. Sanitized reason.
7. Sanitized error category.
8. Sanitized checkpoint reference.
9. Sanitized artifact reference.

When in doubt, redact.

## 6. Dummy-worker artifacts, logs, and checkpoints

Phase 0 dummy-worker artifacts, logs, and checkpoints must be safe.

They must not contain:

1. Real customer data.
2. Real credentials.
3. Real external platform data.
4. Real scraped data.
5. Real message content.
6. Real OCR/STT content.
7. Real AI prompts containing private data.
8. Real browser/session/account data.
9. Real proxy information.
10. Production system details.

Dummy artifacts must be synthetic, local, and non-sensitive.

Use the canonical term `artifact` for registered dummy worker artifacts.

## 7. Production environment boundary

Production environment behavior is out of scope in Phase 0.

Phase 0 may document future production concerns at a high level, but it must not include:

1. Production worker deployment.
2. Real production credentials.
3. Production scraping instructions.
4. Production sending instructions.
5. Production proxy/account setup.
6. Real external integration procedure.
7. Runtime automation procedure for real platforms.

Operational documents in Phase 0 must stay documentation-level and dummy-worker-only.

## 8. Security review triggers

A change requires security review if it touches or proposes any of the following:

### 8.1 RLS/RBAC impact

Trigger review when a change affects:

1. Access control.
2. Roles.
3. Permissions.
4. RLS policies.
5. Sensitive data visibility.
6. Worker command permissions.
7. Operator action permissions.

### 8.2 Migration impact

Trigger review when a change includes or proposes:

1. New tables.
2. New columns.
3. New indexes.
4. New functions.
5. New triggers.
6. Policy changes.
7. Data retention changes.
8. Any automation migration.

Phase 0 must not add migrations without approved design and rollback plan.

### 8.3 Environment impact

Trigger review when a change touches:

1. `.env.example` files.
2. Deployment docs.
3. Docker or compose behavior.
4. Worker environment variables.
5. Runtime configuration.
6. Feature flags.
7. External integration flags.

### 8.4 Secret exposure risk

Trigger review when a change includes:

1. New credential names.
2. New authentication flows.
3. New worker authentication design.
4. New external service references.
5. New logs or artifacts that might include sensitive data.
6. New examples that could be mistaken for real values.

## 9. Escalation rule

If a suspected leak or unsafe change is found:

1. Stop the work immediately.
2. Do not continue editing related files.
3. Do not copy the suspected secret into chat, issues, docs, or PR comments.
4. Notify the repository owner through the approved private channel.
5. Remove or rotate the exposed value outside this repository workflow if the value is real.
6. Document the incident using `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md` if appropriate.
7. Add a postmortem using `docs/automation/05_security_ops/POSTMORTEM_TEMPLATE.md` if the incident affected the repository or process.

## 10. Phase 0 rejection conditions

Reject Phase 0 work if it includes:

1. Runtime code for real bots.
2. Real external integrations.
3. Real scraping.
4. Real sending.
5. OCR/STT pipeline.
6. AI/LLM pipeline.
7. Browser automation.
8. Proxy/account automation.
9. Production deployment.
10. Unapproved migrations.
11. Real secrets.
12. Service role keys.
13. Production credentials.
14. Customer/private data.
15. Parallel core, database, API, or admin panel.

## 11. Final rule

Phase 0 security is about preventing unsafe foundations.

If a change makes the future automation platform harder to secure, harder to audit, harder to self-host, or more likely to leak secrets, it must be blocked until a safer design is approved.
