# Repository State Inventory Addendum — Phase 0 Automation

This addendum extends `docs/REPO_STATE_INVENTORY.md` for Afra Automation Phase 0.

It does not replace the main repository inventory. The main inventory remains the source of truth for what already exists in `get-git-going` and what must not be rebuilt.

## 1. Purpose

The purpose of this addendum is to define how the existing `get-git-going` repository should be treated during Phase 0 automation preparation.

It clarifies:

1. The current repository is the Control Plane / Core.
2. React, TanStack, and Lovable-generated UI belong to the operator UI layer.
3. Supabase/PostgreSQL remains the source of truth.
4. Python Worker Runtime is separate from the UI.
5. Contracts and documentation must be prepared before runtime automation.
6. No parallel core, database, API, or admin panel may be created.
7. No real automation module may be implemented in Phase 0.

## 2. Control Plane / Core decision

The existing `get-git-going` repository is the official Control Plane and Core for Afra Automation.

This means Phase 0 must reuse the existing application instead of creating a new central system.

The Control Plane / Core is responsible for:

1. Operator-facing workflow coordination.
2. Existing authentication and access control boundaries.
3. Future automation job visibility.
4. Future worker status visibility.
5. Future logs, checkpoints, and artifact visibility.
6. Future start, stop, pause, resume, and retry command surfaces.
7. Future integration with Supabase/PostgreSQL as the source of truth.

Phase 0 may document these responsibilities. It must not implement production automation behavior.

## 3. UI boundary

The UI layer belongs inside the existing React/TanStack/Lovable application.

Allowed UI responsibilities in future approved phases:

1. Display automation jobs.
2. Display worker status.
3. Display heartbeats.
4. Display logs.
5. Display checkpoints.
6. Display artifact references.
7. Provide approved operator controls.
8. Show clear error and recovery states.

Phase 0 UI work is limited to documentation and structure unless explicitly approved by a later task.

The UI must not contain:

1. Worker runtime logic.
2. Plugin/driver implementation.
3. Scraping logic.
4. Messaging logic.
5. OCR/STT logic.
6. AI/LLM pipeline logic.
7. Proxy/account automation logic.
8. Service-role secrets.
9. Browser automation.

Lovable may help with UI and documentation, but it must not become the runtime brain of automation.

## 4. Supabase/PostgreSQL boundary

Supabase/PostgreSQL remains the source of truth.

Automation-related data must eventually live in approved Supabase/PostgreSQL tables, subject to:

1. Design-first review.
2. RLS/RBAC design.
3. Audit-log design.
4. Migration safety review.
5. Rollback planning.
6. Backup/restore compatibility.
7. Staging validation.
8. Owner approval.

Possible future automation data areas:

1. Jobs.
2. Workers.
3. Worker heartbeats.
4. Job logs.
5. Checkpoints.
6. Artifacts.
7. Plugin/driver registry.
8. Job events.
9. Commands.
10. Runtime settings.

Phase 0 may document these table designs. It must not add automation migrations until the design, access policy, rollback plan, and acceptance criteria are approved.

## 5. Worker Runtime boundary

Python Worker Runtime must be separate from the UI.

The worker layer is responsible for future background execution, but Phase 0 is limited to dummy-worker preparation.

Phase 0 worker preparation may include:

1. Worker folder skeleton.
2. Worker README.
3. `.env.example` with placeholder-only values.
4. Dummy-worker-only specifications.
5. Contract references.
6. Test planning for a safe dummy flow.

Phase 0 worker preparation must not include:

1. Real bots.
2. Real scrapers.
3. Real senders.
4. Real OCR/STT.
5. Real AI/LLM execution.
6. Browser automation.
7. Proxy/account automation.
8. Production integrations.
9. Distributed service-role access.
10. Runtime code that touches external platforms.

The only acceptable Phase 0 worker behavior is a safe dummy flow that proves job lifecycle, heartbeat, logs, checkpoints, and artifacts without calling real external systems.

## 6. Contracts boundary

Contracts belong in the repository and must be reviewed before implementation.

Contract areas include:

1. `openapi/automation-v1.yaml`
2. `schemas/automation/job.schema.json`
3. `schemas/automation/worker-heartbeat.schema.json`
4. `schemas/automation/artifact.schema.json`
5. `schemas/automation/plugin-manifest.schema.json`
6. Job lifecycle documentation.
7. Worker runtime specification.
8. Plugin/driver contract documentation.
9. Event contract documentation.

`schemas/automation/artifact.schema.json` is the canonical artifact contract.

Contracts must be versioned, self-host-safe, and free from secrets or production-specific private values.

## 7. Documentation boundary

Phase 0 documentation belongs under `docs/automation/` and related approved root documentation files.

Documentation should define:

1. Scope.
2. Phase labels.
3. Requirements.
4. Acceptance criteria.
5. Architecture decisions.
6. Worker runtime boundaries.
7. Contract boundaries.
8. Security boundaries.
9. RLS/RBAC expectations.
10. Testing expectations.
11. Runbook and incident process.
12. Team ownership and delivery process.

Documentation must not pretend future modules are already implemented.

Documentation for real modules such as Google Maps, Torob, Divar, WhatsApp, Instagram, OCR/STT, or AI must be labeled as future-facing unless a later approved ADR moves them into an implementation phase.

## 8. Areas that must not be touched casually

The following existing areas are sensitive and must not be rewritten, bypassed, or duplicated during Phase 0 automation work:

1. Auth and RBAC.
2. Supabase client/server integration.
3. Existing database migrations.
4. Existing pricing engine and queue separation.
5. Existing bot/public API distinction from internal server functions.
6. Existing self-host deployment files.
7. Existing backup/restore/migration tooling.
8. Existing navigation source of truth.
9. Existing persons/customers identity direction.
10. Existing audit-log behavior.
11. Existing RLS policies.
12. Existing production modules.

If a change touches any of these areas, it requires a focused task, explicit approval, and an impact report.

## 9. Systems that must not be duplicated

Do not create:

1. A new Laravel core.
2. A second control plane.
3. A second admin panel.
4. A second database.
5. A second automation API outside the approved core.
6. A second customer/person identity model.
7. A second pricing engine.
8. A second bot API that bypasses existing server-side patterns.
9. A duplicate job system outside the approved automation design.
10. A hidden worker control system inside the UI.

Any exception requires a new ADR before implementation.

## 10. What must not be built in Phase 0

Phase 0 must not build:

1. Real Divar crawler.
2. Real Divar messaging.
3. Real WhatsApp sender or reader.
4. Real Instagram extractor.
5. Real Torob scraper.
6. Real Google Maps scraper.
7. Real Google Search scraper.
8. Real Telegram, Rubika, Bale, or SMS integration.
9. OCR/STT pipeline.
10. AI/LLM pipeline.
11. Browser automation.
12. Proxy/account automation.
13. Production scraping.
14. Production sending.
15. Runtime plugin execution.
16. Production worker deployment.
17. Automation database migration without approval.
18. Any real credentials, tokens, cookies, or secrets.

## 11. Required state before real automation

Before real automation modules can be implemented, the project must have:

1. Approved automation table design.
2. Approved RLS/RBAC plan.
3. Approved audit-log plan.
4. Approved migration and rollback plan.
5. Approved OpenAPI contract.
6. Approved JSON schemas.
7. Approved worker authentication design.
8. Approved job lifecycle.
9. Approved heartbeat and stale-worker behavior.
10. Approved checkpoint/resume behavior.
11. Approved artifact contract.
12. Approved worker runbook.
13. Approved test case registry.
14. A successful dummy-worker end-to-end test.
15. Module-specific specifications for any real module.
16. A new ADR moving the specific module into an implementation phase.

## 12. Phase 0 conclusion

The current `get-git-going` repository is already the correct foundation.

The right Phase 0 work is not to build robots. The right Phase 0 work is to prepare the documentation, ownership, contracts, worker skeleton, safety boundaries, and dummy-worker flow that make later automation safe, reviewable, and maintainable.
