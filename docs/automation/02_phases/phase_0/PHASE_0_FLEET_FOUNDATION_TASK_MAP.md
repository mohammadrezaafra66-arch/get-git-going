# Phase 0 Fleet Foundation Task Map

## Purpose

This document breaks Phase 0 into safe, reviewable foundation tasks for the Afra Automation worker fleet.

Phase 0 prepares the documentation, contracts, schemas, and dummy-flow plan needed before any real automation module is built.

## Scope

Phase 0 task work is limited to:

- Repository documentation for automation.
- Contract and schema preparation.
- Worker fleet architecture documentation.
- Dummy worker skeleton planning.
- Heartbeat, log, checkpoint, and artifact design.
- End-to-end dummy-flow design.
- Review rules, owner rules, and acceptance criteria.

## Non-Goals

Phase 0 does not deliver:

- Real data extraction.
- Real message sending.
- Real browser automation.
- Real external platform integration.
- Real OCR/STT.
- Real AI pipeline.
- Production deployment of workers.
- Database migrations.
- New runtime app features.

## Decisions

1. The existing app remains the Control Plane/Core.
2. Phase 0 does not add a second Core, API, database, or admin panel.
3. Worker Runtime design is documented but not productionized.
4. Only dummy flow is allowed for end-to-end validation.
5. Real modules remain `FUTURE` until approved by ADR.
6. Every Phase 0 task must be small, reviewable, and reversible.

## Requirements

Phase 0 task packets must cover these foundation areas:

### Task Group A — Repository and documentation inventory

- Confirm target branch is `phase0-structure-only`.
- Confirm PR remains draft.
- Confirm no runtime code is changed.
- Confirm canonical repo files were read before edits.

### Task Group B — Fleet principles

- Define fleet platform principles.
- Define worker/plugin boundaries.
- Define forbidden Phase 0 work.
- Define module phase labels.

### Task Group C — Command Center architecture

- Document the Control Plane role of `get-git-going`.
- Document UI boundaries.
- Document worker-facing concepts without implementing runtime.
- Document how operators will view future job status.

### Task Group D — Hybrid Worker Fleet architecture

- Document Python Worker Runtime as a separate runtime.
- Document worker heartbeat, logs, checkpoints, and artifacts.
- Document local/LAN-aware operation for unstable internet/power.
- Document no real workers in Phase 0.

### Task Group E — Integration contracts

- Document integration metadata.
- Document secret-safe references.
- Document status and failure states.
- Document allowed/forbidden fields.

### Task Group F — Monitoring and SLO-lite

- Define lightweight health indicators.
- Define fleet-level service expectations.
- Define incident and degradation vocabulary.
- Define what must be visible before real modules.

### Task Group G — Team execution

- Define daily work plan.
- Define owner/reviewer responsibilities.
- Define PR review checks.
- Define stop conditions.

### Task Group H — Plugin manifest standard

- Define plugin metadata.
- Define driver phase labels.
- Define capability declarations.
- Define forbidden capabilities in Phase 0.

### Task Group I — Schema validation

- Create valid `integration.schema.json`.
- Use `secret_location_reference`, not real secrets.
- Set `additionalProperties` to `false`.
- Keep schema implementation-neutral and safe.

## Forbidden Work

Do not use Phase 0 tasks to:

- Build a real bot.
- Build a real scraper.
- Build a real sender.
- Add Playwright/Selenium/Puppeteer runtime.
- Add OCR/STT/AI runtime.
- Add external production calls.
- Add migrations.
- Change `package.json`.
- Change `deploy/`.
- Change `src/` app runtime.
- Create secrets.
- Create a new Core/API/database/admin panel.

## Phase 0 Acceptance Criteria

Phase 0 task map is complete when:

1. Each foundation area above has a corresponding document or schema.
2. Every document states Purpose, Scope, Non-Goals, Decisions, Requirements, Forbidden Work, Acceptance Criteria, Owner/Review Responsibility, and Related Files.
3. `integration.schema.json` is valid JSON Schema 2020-12.
4. No real automation has been introduced.
5. PR #9 remains draft and unmerged.
6. Changed files are limited to approved documentation/schema targets for this task.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Architecture reviewer: Phase 0 architecture owner.
- Security reviewer: Mohammadreza Afra for sensitive access, integration boundaries, and no-secret checks.
- Task executors: assigned through daily task packets.

Every task packet must name one owner and one reviewer before work starts.

## Related Files

- `README.md`
- `docs/REPO_STATE_INVENTORY.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- `docs/automation/README.md`
- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/AUTOMATION_COMMAND_CENTER_ARCHITECTURE.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/06_team_delivery/PHASE_0_DAILY_BUILD_PLAN.md`
