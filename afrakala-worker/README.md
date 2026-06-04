# AfraKala Worker Runtime

This directory is the Phase 0 skeleton for the future Python Worker Runtime.

It exists to document and prepare a safe worker boundary outside the React/TanStack/Lovable UI. During Phase 0, this folder is limited to dummy-worker preparation only. It must not contain real bots, scraping logic, message sending logic, OCR/STT, AI pipelines, browser automation, proxy/account automation, production integrations, database migrations, or secrets.

## Purpose

The worker runtime will eventually run background automation tasks outside the operator UI while still using the existing `get-git-going` repository as the control plane.

In Phase 0, the only approved goal is to prepare the worker structure and document the dummy-worker flow. The dummy worker is a safe simulation used to prove that the platform can support worker identity, job lifecycle, heartbeat, logs, checkpoints, artifacts, and completion status without touching any real external platform.

## Phase 0 role

The Phase 0 worker area supports design-first preparation for:

1. Worker identity.
2. Dummy job claiming.
3. Dummy heartbeat behavior.
4. Dummy progress updates.
5. Dummy checkpoint handling.
6. Dummy log handling.
7. Dummy artifact registration.
8. Dummy success, failure, retry, pause, and cancellation states.

The worker must stay dummy-only until a later approved phase and ADR explicitly allow real runtime behavior.

## Strict boundaries

Allowed in this folder during Phase 0:

1. Documentation for the worker runtime.
2. Empty or fake placeholder configuration in `.env.example`.
3. Dummy-worker-only planning.
4. References to approved contracts.
5. Local folder placeholders such as `.gitkeep`.
6. Future test documentation for dummy worker behavior.
7. Notes about safe local development.

Forbidden in this folder during Phase 0:

1. Real Divar crawler.
2. Real WhatsApp sender or reader.
3. Real Instagram extractor.
4. Real Torob scraper.
5. Real OCR/STT pipeline.
6. Real AI/LLM pipeline.
7. Browser automation.
8. Proxy/account automation.
9. Production scraping.
10. Production message sending.
11. Production integration.
12. Database migration SQL.
13. Service role keys.
14. Real API keys.
15. Passwords, cookies, tokens, browser profiles, or private keys.
16. Any code that connects to real external platforms.

## Folder structure

Current Phase 0 structure:

```text
afrakala-worker/
  README.md
  .env.example
  src/
    .gitkeep
  tests/
    .gitkeep
```

Meaning:

1. `README.md` explains the worker boundary and Phase 0 rules.
2. `.env.example` documents placeholder-only configuration for a future dummy worker.
3. `src/` is reserved for future approved dummy-worker source files.
4. `tests/` is reserved for future approved dummy-worker tests.

Do not add runtime code until a specific approved task allows it.

## Environment setup

Use `afrakala-worker/.env.example` only as a placeholder template.

Rules:

1. `.env.example` may be committed.
2. Real `.env` files must not be committed.
3. Placeholder values such as `change-me`, empty strings, and local example URLs are allowed.
4. Real credentials are forbidden.
5. Production URLs are forbidden unless they are public non-sensitive documentation examples approved by the owner.
6. `AFRA_WORKER_MODE` must remain `dummy` for Phase 0.
7. Safety switches must keep real bots, scraping, messaging, browser automation, proxy/account automation, AI, OCR/STT, and production integrations disabled.

Example values in `.env.example` are not operational secrets. They are placeholders only.

## Relationship to control plane contracts

The worker runtime must follow the approved Phase 0 contracts and documentation.

Relevant files:

1. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
2. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
3. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
4. `openapi/automation-v1.yaml`
5. `schemas/automation/job.schema.json`
6. `schemas/automation/worker-heartbeat.schema.json`
7. `schemas/automation/artifact.schema.json`
8. `schemas/automation/plugin-manifest.schema.json`

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

## Expected dummy-worker behavior

When the approved dummy worker is later implemented, it should prove only this safe loop:

1. Read placeholder-only local configuration.
2. Identify itself as a dummy worker.
3. Claim or simulate claiming a dummy job.
4. Mark the job as running.
5. Send or simulate heartbeat.
6. Append safe structured logs.
7. Update progress.
8. Save checkpoint state.
9. Register a dummy artifact.
10. Mark the dummy job as succeeded or failed.
11. Stop safely when requested.

The dummy worker must not call Divar, WhatsApp, Instagram, Torob, OCR/STT services, AI/LLM services, browser automation, proxy providers, account automation services, or production systems.

## How to run

There is no approved runtime command in Phase 0 yet.

Until a future approved task adds dummy-worker code, do not invent or document commands that imply the worker already runs.

Future run instructions must be added only after the approved dummy worker implementation exists. Those instructions must remain dummy-only and must not include real external integrations.

## Security rules

Never commit:

1. Real `.env` files.
2. Service role keys.
3. JWT secrets.
4. API keys.
5. Passwords.
6. Cookies.
7. Access tokens.
8. Private keys.
9. Certificates.
10. Browser profiles.
11. Proxy credentials.
12. Production endpoints that reveal private infrastructure.
13. Database dumps.
14. Backup archives.
15. Customer data.

All secrets must stay outside GitHub.

## Logging expectations

Future dummy-worker logs should be structured and safe.

A log entry should eventually include:

1. Timestamp.
2. Worker id.
3. Job id when available.
4. Event name.
5. Severity level.
6. Safe message.
7. Non-sensitive context.

Logs must not contain secrets, credentials, tokens, cookies, raw customer data, or private operational data.

## Checkpoint expectations

Checkpoint behavior must be safe, idempotent, and recoverable.

A future dummy worker should be able to:

1. Save checkpoint state before stopping.
2. Restart without duplicating completed work.
3. Resume or fail according to the documented job lifecycle.
4. Avoid corrupting job status when interrupted.

## Review checklist

Before merging any worker-related Phase 0 change, confirm:

1. The change is dummy-worker-only.
2. No real external service is called.
3. No runtime bot logic is added.
4. No scraping or sending logic is added.
5. No OCR/STT or AI pipeline is added.
6. No browser automation is added.
7. No proxy/account automation is added.
8. No database migration is added unless explicitly approved.
9. No real secrets are committed.
10. `.env.example` contains placeholder values only.
11. The change respects `README.md`, `AGENTS.md`, `docs/REPO_STATE_INVENTORY.md`, and `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`.
