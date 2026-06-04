# Security Baseline — Afra Automation Phase 0

This document defines the canonical Phase 0 Security Baseline for Afra Automation.

Phase 0 is documentation, contracts, schemas, and dummy-worker foundation only. No real automation is allowed in Phase 0. This document does not authorize runtime code, migration SQL, real credentials, real bot instructions, scraping instructions, sending instructions, production access instructions, OCR/STT, AI pipelines, browser automation, proxy/account automation, or production integrations.

## 1. Purpose

The purpose of this baseline is to keep Phase 0 safe while the automation foundation is documented and reviewed.

It applies to:

1. Documentation.
2. OpenAPI contracts.
3. JSON schemas.
4. Dummy-worker specifications.
5. Worker skeleton documentation.
6. Runbook and testing documents.
7. Task Packets and pull requests.

## 2. Minimum security baseline

All Phase 0 work must follow these rules:

1. No real secrets may be committed to GitHub.
2. Browser/UI code must never receive privileged credentials.
3. Service role access must remain server-side only.
4. Future automation work must follow least privilege.
5. Supabase/PostgreSQL remains the source of truth.
6. Logs, checkpoints, artifacts, and docs must not contain secrets or sensitive production data.
7. Future sensitive actions must be auditable.
8. No database migration is allowed without design, rollback, RLS/RBAC review, and owner approval.
9. No parallel core, API, database, or panel may be introduced.
10. No real external automation may be introduced in Phase 0.

## 3. Secret prohibition

Real secrets must never be committed to GitHub, pasted into documentation, included in examples, placed in logs, stored in artifacts, copied into checkpoints, shown in screenshots, or echoed in builder chats.

The following are explicitly forbidden:

1. API keys.
2. Passwords.
3. Service keys.
4. Service role keys.
5. Cookies.
6. Tokens.
7. JWT secrets.
8. Session files.
9. Private certificates.
10. Database dumps.
11. Backups.
12. Production `.env` files.
13. Storage exports.
14. Private keys.
15. Browser profiles.
16. Proxy credentials.
17. Production account identifiers.
18. Private infrastructure values.
19. Sensitive customer or operational data.

Only empty placeholders, obvious fake values, and non-operational examples may appear in committed files.

## 4. Browser, server, and worker separation

Browser/UI code must never receive privileged credentials.

Rules:

1. React/Lovable UI must not contain service role keys.
2. React/Lovable UI must not execute worker logic.
3. React/Lovable UI must not contain scraping, sending, or automation driver behavior.
4. Server-side privileged access must stay server-side.
5. Worker Runtime must remain separate from UI/Core.
6. Phase 0 worker behavior is dummy-only and simulation-only.

## 5. Service role access

Service role access must remain server-side only.

It must not be:

1. Committed to GitHub.
2. Exposed in browser bundles.
3. Added to `.env.example` as a real value.
4. Distributed to dummy workers in Phase 0.
5. Included in documentation examples.
6. Logged or copied into PRs, issues, or chats.

Any future proposal involving service role access requires explicit owner/security review.

## 6. Migration security baseline

No database migration is allowed without:

1. Approved design.
2. Rollback or recovery plan.
3. RLS/RBAC review.
4. Audit impact review.
5. Test plan.
6. Owner approval.

Phase 0 default is no automation migration.

Any migration-related change must be blocked unless it has already passed the required review path.

## 7. Least privilege for future automation

All future automation work must follow least privilege.

This means:

1. Operators receive only the access required for their role.
2. Workers receive only the access required for their approved job type.
3. Browser/UI access remains separate from worker access.
4. Server-side privileged actions must be mediated and auditable.
5. Future credentials must be scoped, rotated, and stored outside GitHub.
6. Plugin/driver permissions must be explicitly reviewed before implementation.

## 8. Logs, checkpoints, artifacts, and docs

Logs, checkpoints, artifacts, and documentation must not contain:

1. Secrets.
2. Credentials.
3. Tokens.
4. Cookies.
5. Service role keys.
6. Private keys.
7. Browser session data.
8. Proxy credentials.
9. Sensitive production data.
10. Sensitive customer data.
11. Real external platform data collected through automation.

Phase 0 dummy artifacts must be synthetic and non-sensitive.

## 9. Sensitive-area review list

A change requires extra review if it touches or proposes changes to:

1. Authentication.
2. RLS/RBAC.
3. Service role usage.
4. Migrations.
5. Production deployment.
6. Worker access.
7. Secrets.
8. External integrations.
9. Automation contracts.
10. Job lifecycle.
11. Worker heartbeat.
12. Artifact registration.
13. Checkpoint or log behavior.

If the security impact is unclear, the task is blocked until reviewed.

## 10. Unsafe Phase 0 rejection section

Reject Phase 0 work if it includes:

1. Real automation.
2. Real bot behavior.
3. Real scraping.
4. Real sending.
5. OCR/STT implementation.
6. AI/LLM implementation.
7. Browser automation.
8. Proxy/account automation.
9. Production access instructions.
10. Runtime worker implementation.
11. Unapproved migration.
12. Secrets or credentials.
13. Privileged browser access.
14. Service role key exposure.
15. Parallel core, API, database, or panel.
16. Documentation that teaches production automation steps.

## 11. Final rule

Phase 0 must remain documentation, contracts, schemas, and dummy-worker foundation only.

If a change introduces secrets, privileged browser access, unapproved migration, production operational steps, or real external automation, it must be rejected or escalated before merge.
