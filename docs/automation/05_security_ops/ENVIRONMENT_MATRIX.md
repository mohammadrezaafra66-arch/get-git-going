# Environment Matrix — Afra Automation Phase 0

This document defines the canonical environment boundaries for Afra Automation Phase 0.

It answers what is local, what is LAN, what is production, where Supabase/PostgreSQL belongs, where the Phase 0 worker may run, and where secrets may be stored.

Related references:

1. `README.md`
2. `docs/automation/05_security_ops/SECURITY_BASELINE.md`
3. `docs/automation/05_security_ops/SECRETS_POLICY.md`
4. `docs/automation/05_security_ops/RLS_RBAC_POLICY.md`
5. `docs/automation/05_security_ops/RUNBOOK.md`
6. `docs/automation/05_security_ops/MIGRATION_ROLLBACK.md`
7. `afrakala-worker/.env.example`

## 1. Core environment answers

| Question | Phase 0 answer |
|---|---|
| What is local? | A developer machine used for documentation, contract review, schema review, and safe dummy-worker preparation. |
| What is LAN? | A controlled internal network environment that may be used for later safe testing after approval, but not for real Phase 0 automation. |
| What is production? | The live business environment. Production must not run real Phase 0 automation. |
| Where is Supabase? | Supabase/PostgreSQL is the source of truth for the platform. Phase 0 database work is design-first only unless separately approved. |
| Where does the worker run in Phase 0? | The Phase 0 worker is dummy-only and limited to safe development/testing contexts. |
| Where are secrets stored? | Never in GitHub or browser bundles. Real values belong only in environment-specific secret storage or local non-committed env files. |

## 2. Environment matrix

| Environment | Purpose | Allowed use in Phase 0 | Forbidden use in Phase 0 | Operated by | Allowed data | Credentials policy |
|---|---|---|---|---|---|---|
| Local | Individual development and documentation preparation. | Edit approved docs, review contracts, review schemas, prepare dummy-worker docs, use placeholder-only `.env.example`, run safe local checks if later approved. | Real bots, real scraping, real sending, real OCR/STT, real AI/LLM, browser automation, proxy/account automation, production integration, production credentials. | Developer or approved contributor. | Non-sensitive docs, placeholder data, dummy test data, synthetic artifacts. | Real local values may exist only in ignored local env files outside Git; committed examples must be placeholder-only. |
| LAN | Controlled internal network environment for future safe validation. | Future controlled dummy-flow testing after approval, environment validation, internal review of self-host boundaries. | Real Phase 0 automation, production scraping, production sending, real external platform drivers, unapproved migrations, secret exposure in docs or Git. | Repository owner/admin reviewer or approved operator. | Synthetic test data, approved dummy data, non-sensitive operational metadata. | Real LAN secrets must be stored outside Git in environment-specific secret storage or server-managed env. |
| Production | Live business environment. | No real Phase 0 automation. Documentation may reference production only at policy level without private details. | Running Phase 0 workers, real bots, scraping, sending, browser automation, proxy/account automation, unapproved migrations, real test experiments. | Repository owner/admin reviewer or production operator. | Live business data only under existing production rules, not Phase 0 automation tests. | Production secrets must stay in production secret storage or server-managed env; never in GitHub, docs, examples, browser bundles, or chats. |

## 3. Supabase/PostgreSQL location

Supabase/PostgreSQL is the source of truth.

Phase 0 may document future automation data models for:

1. Jobs.
2. Workers.
3. Heartbeats.
4. Logs.
5. Checkpoints.
6. Artifacts.
7. Plugin metadata.
8. Commands.
9. Events.

Phase 0 must not add automation database migrations unless table design, RLS/RBAC policy, audit impact, rollback plan, test plan, and owner approval are already complete.

Google Sheets, Excel, local JSON, SQLite, local worker files, and generated artifacts must not become the platform source of truth.

## 4. Worker location in Phase 0

The Phase 0 worker is dummy-only.

Allowed worker context:

1. Local development documentation.
2. Safe dummy-worker preparation.
3. Future approved dummy-flow validation.
4. Placeholder-only configuration through `afrakala-worker/.env.example`.

Forbidden worker context:

1. Production execution.
2. Real external platform execution.
3. Real bot execution.
4. Real scraping.
5. Real sending.
6. OCR/STT execution.
7. AI/LLM execution.
8. Browser automation.
9. Proxy/account automation.
10. Service-role distribution to worker machines.

## 5. Secret location rules

Secrets must follow these rules in every environment.

### 5.1 Never in GitHub

Forbidden in GitHub:

1. API keys.
2. Service keys.
3. Service role keys.
4. JWT secrets.
5. Passwords.
6. Cookies.
7. Tokens.
8. Certificates.
9. Private keys.
10. Browser profiles.
11. Proxy credentials.
12. Production `.env` files.
13. Database dumps.
14. Backup archives.
15. Private endpoints.
16. Customer/private operational data.

### 5.2 Never in browser bundles

Browser/client code must not contain:

1. Server-only secrets.
2. Service role keys.
3. Private tokens.
4. Passwords.
5. Cookies.
6. Private endpoints.
7. Worker privileged credentials.

### 5.3 Placeholder-only in committed examples

Committed examples may contain only:

1. Empty values.
2. `change-me` values.
3. Clearly fake values.
4. Variable names without real values.
5. Localhost-only non-sensitive examples.

### 5.4 Real values

Real values belong only in:

1. Local ignored env files for local development.
2. LAN environment-specific secret storage or server-managed env.
3. Production secret storage or server-managed env.

Real values must never be pasted into docs, PRs, chats, browser code, generated examples, logs, artifacts, or checkpoints.

## 6. Environment boundary rules

1. Local is for safe development and documentation.
2. LAN is for controlled internal validation after approval.
3. Production is for live business operations, not Phase 0 automation testing.
4. Phase 0 worker activity is dummy-only.
5. Any movement from local to LAN requires owner/reviewer awareness.
6. Any production-impacting change requires separate approval and must not be bundled into Phase 0 docs-only work.
7. Environment examples must not reveal real infrastructure.
8. Environment-specific secrets must remain outside the repository.

## 7. Future environment expansion

After Phase 0 acceptance, the project may define additional environment details for later phases.

Future expansion may include:

1. Dedicated staging environment.
2. Controlled LAN dummy-worker test environment.
3. Worker registration environment.
4. External integration sandbox environments.
5. Production worker deployment model.

Any future expansion must require:

1. Approved ADR or task packet.
2. Updated environment matrix.
3. Security review.
4. RLS/RBAC review where relevant.
5. Migration/rollback review where relevant.
6. Updated testing strategy and test case registry.

## 8. Final rule

If an environment decision requires real bots, real scraping, real sending, OCR/STT, AI/LLM, browser automation, proxy/account automation, production integration, production credentials, or private infrastructure details, it is outside Phase 0 and must be blocked until explicitly approved in a later phase.
