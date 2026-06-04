# Secrets Policy — Afra Automation Phase 0

This document defines the definitive Phase 0 secrets policy for repository content, documentation, worker placeholders, and review procedures.

It applies to all Afra Automation Phase 0 files, including documentation, contracts, schemas, `.env.example` files, worker skeleton files, pull request descriptions, review comments, and generated examples.

## 1. Purpose

The purpose of this policy is to prevent real secrets from entering GitHub, documentation, examples, builder prompts, generated files, logs, artifacts, checkpoints, or review comments.

This policy supports:

1. `docs/automation/05_security_ops/SECURITY_BASELINE.md`
2. `docs/automation/05_security_ops/RUNBOOK.md`
3. `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md`
4. `docs/automation/05_security_ops/RELEASE_CHECKLIST.md`
5. `docs/automation/05_security_ops/ENVIRONMENT_MATRIX.md`
6. `afrakala-worker/.env.example`

## 2. Hard rule

Real secrets must never be committed to GitHub, pasted into documentation, embedded in examples, included in pull request descriptions, echoed by builder bots, or copied into chat.

If a value grants access, proves identity, authenticates a system, reveals private infrastructure, exposes private data, or can help an attacker operate the system, treat it as a secret.

When uncertain, treat the value as secret.

## 3. What counts as a secret

In this project, secrets include but are not limited to:

1. API keys.
2. Passwords.
3. Service keys.
4. Service role keys.
5. JWT secrets.
6. Cookies.
7. Access tokens.
8. Refresh tokens.
9. Session tokens.
10. Certificates.
11. Private keys.
12. Database dumps.
13. Backup archives.
14. Production environment files.
15. Browser session files.
16. Browser profiles.
17. Proxy credentials.
18. Account credentials.
19. SMTP credentials.
20. Admin dashboard credentials.
21. Storage exports.
22. Private production endpoints.
23. Private infrastructure addresses.
24. Customer/private operational data.
25. Screenshots or logs that expose any of the above.

## 4. Categorized forbidden list

The following must never be committed, pasted into docs, placed in examples, or echoed in chat.

### 4.1 API and service credentials

1. API keys.
2. Service keys.
3. Service role keys.
4. Integration keys.
5. Webhook signing secrets.
6. Bot keys.
7. Provider access keys.

### 4.2 Authentication credentials

1. Passwords.
2. JWT secrets.
3. Session secrets.
4. Cookies.
5. Access tokens.
6. Refresh tokens.
7. Login challenge codes.
8. One-time passwords.

### 4.3 Cryptographic material

1. Certificates.
2. Private keys.
3. Signing keys.
4. TLS key files.
5. SSH private keys.

### 4.4 Data exports and runtime files

1. Database dumps.
2. Backup archives.
3. Storage exports.
4. Production `.env` files.
5. LAN/prod runtime `.env` files.
6. Browser session files.
7. Browser profiles.
8. Worker local state containing sensitive values.

### 4.5 Network and account material

1. Proxy credentials.
2. Account credentials.
3. Production endpoints that reveal private infrastructure.
4. Internal-only URLs.
5. Private IP addresses when they reveal operational topology.
6. Real webhook callback URLs.

## 5. Allowed placeholder content

Allowed committed content is limited to non-operational placeholders.

Allowed examples:

1. Empty placeholder values.
2. Obvious fake values.
3. `.env.example` files with non-operational placeholders only.
4. Field names without values.
5. Schema property names.
6. Documentation that explains where a value belongs without showing the value.
7. Localhost examples that do not expose private infrastructure.

Examples of allowed placeholder style:

1. Empty value.
2. `change-me`.
3. `example-only`.
4. `local-dummy-worker`.
5. `dummy`.

Do not use values that look like real tokens, real keys, real domains, real customer identifiers, or real account data.

## 6. `.env.example` rules

`.env.example` files may be committed only when they contain placeholder values.

Rules:

1. Real `.env` files must never be committed.
2. `.env.example` must not contain real secrets.
3. `.env.example` must not contain production credentials.
4. `.env.example` must not contain private production endpoints.
5. `.env.example` may include variable names and empty or fake placeholder values.
6. `afrakala-worker/.env.example` must remain dummy-worker-only in Phase 0.
7. Any variable that could be sensitive must clearly use an empty or fake placeholder value.
8. No server secret may use a `VITE_` prefix.

## 7. Where secrets belong by environment

### 7.1 Local development

Real local secrets belong only in local ignored environment files outside Git tracking.

They must not be copied into docs, prompts, generated examples, logs, screenshots, or pull requests.

### 7.2 LAN environment

LAN secrets belong in server-managed or machine-local environment configuration outside Git.

They must be managed by the approved owner and must not be committed to the repository.

### 7.3 Production environment

Production secrets belong in production server-managed environment configuration or an approved secret store.

Production secrets must not appear in GitHub, client bundles, documentation examples, PR descriptions, logs, artifacts, checkpoints, or builder chats.

### 7.4 Browser/client code

Secrets never belong in browser code.

Frontend code must not contain service role keys, server-only keys, passwords, cookies, private tokens, private endpoints, or sensitive operational values.

## 8. Builder bots and chat safety

Builder bots, code assistants, Lovable, Cursor, and chat tools must not echo real secret values.

Rules:

1. Do not paste real secrets into prompts.
2. Do not ask an assistant to print secrets.
3. Do not include secrets in generated docs.
4. Do not include secrets in generated code examples.
5. Do not include secrets in error reports.
6. If a secret is accidentally revealed, stop and escalate.

If a builder bot asks for a real credential, use a placeholder or stop the task.

## 9. Logs, artifacts, and checkpoints

Phase 0 dummy-worker logs, artifacts, and checkpoints must not contain secrets or customer/private data.

Forbidden in logs, artifacts, and checkpoints:

1. API keys.
2. Service role keys.
3. JWT secrets.
4. Cookies.
5. Tokens.
6. Passwords.
7. Private keys.
8. Certificates.
9. Proxy credentials.
10. Browser session files.
11. Browser profiles.
12. Real customer data.
13. Private operational data.
14. Production endpoints.
15. Real scraped data.
16. Real message content.

Use the canonical term `artifact` for registered worker files and metadata.

## 10. Documentation rules

Documentation may describe secret fields, but must not expose values.

Allowed:

1. Naming a variable.
2. Explaining where it belongs.
3. Describing that it must be stored outside Git.
4. Using placeholder-only values.

Forbidden:

1. Real values.
2. Screenshots containing real values.
3. Token-like examples.
4. Production secret examples.
5. Private endpoint examples.
6. Customer/private operational examples.

## 11. Pre-commit checks

Before committing, the author must check that the change does not include:

1. `.env` files.
2. Secret-looking values.
3. Token-looking values.
4. Private keys.
5. Certificates.
6. Database dumps.
7. Backup archives.
8. Browser session files.
9. Browser profiles.
10. Proxy credentials.
11. Real production endpoints.
12. Customer/private data.

For documentation-only changes, visually inspect all examples and code blocks.

For `.env.example` changes, confirm every value is empty or fake.

## 12. Pre-PR reviewer checks

Reviewers must check:

1. No real secrets are committed.
2. No `.env` file is committed.
3. `.env.example` values are placeholders only.
4. No browser/client code contains server secrets.
5. No documentation examples contain real values.
6. No logs, artifacts, checkpoints, or screenshots expose sensitive values.
7. No private endpoints are exposed.
8. No secret-like values are introduced by builder tools.
9. The PR template secret checklist is completed honestly.
10. Any suspected leak is escalated immediately.

## 13. Accidental leak response

If a real secret or suspected secret is exposed:

1. Stop work immediately.
2. Do not copy the value into chat, docs, PR comments, or issues.
3. Report the issue to the repository owner through the approved private channel.
4. Revoke or rotate the exposed secret if it is real.
5. Remove the secret from the working tree.
6. Clean history if needed under owner control.
7. Check whether the value appeared in build artifacts, logs, screenshots, or generated files.
8. Document the incident using `docs/automation/05_security_ops/INCIDENT_STATE_TEMPLATE.md` when appropriate.
9. Include follow-up prevention actions in the incident record.
10. Do not resume related work until the owner confirms it is safe.

## 14. Forbidden guidance

This policy must not be used to bypass secret scanning.

Do not add:

1. Instructions for hiding secrets from scanners.
2. Instructions for bypassing security review.
3. Real-looking fake credentials.
4. Token formatting examples that resemble real provider tokens.
5. Operational procedures that require exposing secrets.

## 15. Phase 0 rejection conditions

Reject a Phase 0 change if it includes:

1. Real secrets.
2. Real sample credentials.
3. Real external integrations.
4. Real bots.
5. Runtime code that requires credentials.
6. Migration files with secret-bearing values.
7. Browser code that contains server-only values.
8. Documentation that exposes sensitive material.
9. `.env.example` values that appear operational.
10. Instructions for bypassing secret scanning.

## 16. Final rule

Secrets are never part of the repository.

If a secret is needed to run something, the secret belongs in an approved local, LAN, or production secret location outside GitHub. The repository may document the variable name, but never the real value.
