# Phase Label Policy — Afra Automation

This document defines the official phase labels for Afra Automation work inside the existing `get-git-going` repository.

The purpose of this policy is to prevent accidental scope creep, especially during Phase 0. Every Task Packet, pull request, review, and automation-related document must use one of these labels.

## 1. Official labels

| Label | Meaning | Allowed work | Forbidden work | Examples |
|---|---|---|---|---|
| `BASELINE` | Current state of the existing `get-git-going` repository. | Inventory, current-state documentation, anti-duplication notes, gap analysis, references to existing modules. | Changing runtime behavior, adding new automation, adding migrations, creating parallel systems. | Repository inventory, existing self-host docs, current bot API notes. |
| `PHASE-0` | Structure, documentation, contracts, schemas, dummy worker, and safe dummy E2E only. | Documentation, ADRs, OpenAPI placeholders, JSON schema placeholders, worker skeleton, dummy-worker specs, runbooks, testing docs, task packets. | Real bots, real scraping, real sending, OCR/STT, AI pipeline, browser automation, proxy/account automation, production integration, unapproved migration, secrets. | `docs/automation/`, `openapi/automation-v1.yaml`, `schemas/automation/`, `afrakala-worker/.env.example`, dummy-worker-only planning. |
| `PHASE-1` | Limited MVP after Phase 0 acceptance. | Only work approved after Phase 0 acceptance through ADR, module spec, contracts, RLS/RBAC review, test cases, and owner approval. | Any module or runtime behavior without an approved ADR and task packet. Any production automation without acceptance gates. | A future limited MVP module after approved contracts and dummy E2E success. |
| `FUTURE` | Explicitly not to be built now. | Research notes, future module specs, non-executable planning, risk documentation, legal/operational boundary analysis. | Runtime implementation, production integration, real credentials, migrations, execution logic. | Divar future spec, real WhatsApp sender planning, Instagram extraction notes, real Torob scraper planning. |

## 2. Hard Phase 0 rule

The following topics are `FUTURE` by default unless a later approved ADR explicitly moves them into a later implementation phase:

1. Real Divar extraction.
2. Real Divar messaging.
3. Real WhatsApp sending.
4. Real WhatsApp reading.
5. Real Instagram extraction.
6. Real Torob extraction.
7. OCR/STT pipeline.
8. AI/LLM pipeline.
9. Browser automation.
10. Proxy/account automation.
11. Production scraping.
12. Production sending.
13. Production external integrations.
14. Runtime plugin execution.

Mentioning these items in documentation does not authorize implementation.

## 3. Required label usage

Every Task Packet must include a phase label.

Every pull request must include a phase label.

Every automation-related document should state whether its content is `BASELINE`, `PHASE-0`, `PHASE-1`, or `FUTURE` when the phase boundary could be misunderstood.

Every reviewer must check that the work matches its label.

## 4. Default rule for unclear tasks

If a task is unclear, risky, or could be interpreted as real automation, it must default to one of these outcomes:

1. `FUTURE` if it is a future idea or module planning topic.
2. `BLOCKED` if it needs clarification, an ADR, security review, owner approval, or a narrower task before work can continue.

Do not guess the phase.

Do not implement first and classify later.

## 5. Phase 0 allowed examples

Examples of valid `PHASE-0` work:

1. Writing or expanding approved documentation files.
2. Defining job lifecycle states.
3. Creating placeholder OpenAPI contracts.
4. Creating placeholder JSON schemas.
5. Documenting worker heartbeat rules.
6. Documenting dummy-worker behavior.
7. Expanding `.env.example` with placeholder-only values.
8. Creating runbook, incident, postmortem, release, DoR, DoD, and RACI documents.
9. Designing a safe dummy E2E flow without external calls.
10. Writing module specs that clearly mark real modules as future planning only.

## 6. Phase 0 forbidden examples

Examples of forbidden `PHASE-0` work:

1. Writing Playwright/Selenium code for real websites.
2. Connecting to Divar, WhatsApp, Instagram, Torob, Google Maps, Telegram, Rubika, Bale, or SMS services.
3. Adding a browser automation runner.
4. Adding a proxy manager.
5. Adding account/session automation.
6. Calling AI, OCR, or STT services.
7. Adding production worker deployment.
8. Adding database migrations without approved design and migration review.
9. Adding real credentials or private endpoints.
10. Creating a Laravel service or new backend core.
11. Creating a second database or admin panel.
12. Creating an API layer that bypasses the existing control plane.

## 7. Pull request enforcement

A PR should not be reviewed until its phase label is clear.

A PR should not be merged if:

1. The label is missing.
2. The content does not match the label.
3. `PHASE-0` work includes real automation.
4. `PHASE-0` work includes migration without explicit approval.
5. `PHASE-0` work includes secrets or production credentials.
6. `FUTURE` work contains executable runtime implementation.
7. The PR bypasses existing repository architecture.

## 8. Task Packet enforcement

A Task Packet must include:

1. Phase label.
2. Scope statement.
3. Allowed files.
4. Forbidden files.
5. Expected output.
6. Acceptance criteria.
7. Testing or documentation-only verification.
8. Owner and reviewer.

If a Task Packet cannot clearly define these items, it is not ready.

## 9. Final rule

Phase labels are not decoration. They are execution controls.

If the phase label and the requested work disagree, the task is blocked until the scope is corrected or an approved ADR changes the phase boundary.
