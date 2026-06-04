# ADR-005: No Real Bots or External Automation Drivers in Phase 0

## Status

Accepted

## Date

2026-06-03

## Context

Afra Automation is intended to become a reliable automation and multi-worker platform. The long-term vision includes future modules such as lead extraction, market price monitoring, messaging, OCR/STT, AI-assisted analysis, and other automation capabilities.

However, building real bots too early would be high risk.

Real external automation usually introduces:

1. Fragile platform-specific behavior.
2. Account and access risk.
3. Anti-bot and rate-limit risk.
4. Security and credential risk.
5. Data quality risk.
6. Legal and policy uncertainty.
7. Operational recovery complexity.
8. Debugging and monitoring needs.
9. Checkpoint and retry complexity.
10. Pressure to create quick scripts outside the approved platform.

If the team starts with real Divar, WhatsApp, Instagram, Torob, OCR/STT, AI, browser automation, proxy/account automation, scraping, or sending before the platform foundation is ready, the project can quickly become a collection of fragile scripts instead of a controlled automation platform.

Phase 0 must prevent that failure mode.

## Decision

No real bots or external automation drivers are allowed in Phase 0.

Phase 0 is limited to:

1. Repository inventory.
2. Documentation structure.
3. Scope and phase label control.
4. ADRs and architecture decisions.
5. Automation table design.
6. API contract design.
7. JSON schemas.
8. Worker Runtime skeleton.
9. Dummy Worker only.
10. Logging, checkpoint, status, and start/stop contract design.
11. Runbooks.
12. Testing strategy and test case registry.
13. Safe dummy end-to-end flow design.

The only allowed worker concept in Phase 0 is the Dummy Worker.

The Dummy Worker must not call real external services.

Divar, WhatsApp, Instagram, Torob, OCR/STT, AI/LLM pipelines, browser automation, proxy/account automation, production scraping, and production sending are `FUTURE` unless a later accepted ADR explicitly moves a specific item into a later phase.

Divar must remain `FUTURE` unless a later ADR changes that decision.

## Consequences

### Positive consequences

1. Phase 0 remains safe and foundation-focused.
2. The team avoids premature fragile automation.
3. Contracts can be designed before runtime behavior exists.
4. Security, RLS/RBAC, audit, and migration rules can be reviewed first.
5. Worker lifecycle, heartbeat, checkpoint, logs, and artifacts can be designed before real drivers exist.
6. The project avoids account-ban, scraping, credential, and production integration risks during Phase 0.
7. Cursor, Lovable, and team members have a clear boundary: do not build real bots in Phase 0.

### Negative consequences

1. No real business automation output is produced during Phase 0.
2. Teams eager to test real platforms must wait.
3. Future module work requires additional ADRs, module specs, contracts, and acceptance criteria.

These constraints are intentional. Phase 0 is not optimized for visible automation output. It is optimized for safe foundation readiness.

## Alternatives considered

### Alternative 1: Start with a real Divar crawler

Rejected.

Divar automation introduces platform, policy, anti-bot, account, messaging, checkpoint, and recovery risk. It must remain `FUTURE` unless a later ADR explicitly changes its phase.

### Alternative 2: Start with a real WhatsApp sender

Rejected.

WhatsApp sending introduces account safety, rate limit, compliance, credential, and messaging risk. It is not Phase 0 work.

### Alternative 3: Start with a real Instagram extractor

Rejected.

Instagram extraction introduces platform restrictions, account/session risk, anti-bot behavior, and data policy issues. It is not Phase 0 work.

### Alternative 4: Start with a real Torob scraper

Rejected for Phase 0.

Torob may be a useful future module, but it still requires driver design, rate limits, checkpointing, output schema, test cases, and operational review before implementation.

### Alternative 5: Build OCR/STT or AI pipeline early

Rejected.

OCR/STT and AI pipelines introduce external dependencies, privacy, cost, quality, and reliability risks. They require feature flags, fallbacks, and security review before implementation.

### Alternative 6: Build only a dummy worker first

Accepted.

A dummy worker allows the team to validate lifecycle, heartbeat, logging, checkpointing, artifacts, and safe E2E contracts without external platform risk.

## Rules / enforcement

1. Do not build real bots in Phase 0.
2. Do not build real external automation drivers in Phase 0.
3. Do not build a real Divar crawler in Phase 0.
4. Do not build a real WhatsApp sender or reader in Phase 0.
5. Do not build a real Instagram extractor in Phase 0.
6. Do not build a real Torob scraper in Phase 0.
7. Do not build an OCR/STT production pipeline in Phase 0.
8. Do not build an AI/LLM production pipeline in Phase 0.
9. Do not add real browser automation in Phase 0.
10. Do not add proxy/account automation in Phase 0.
11. Do not add production scraping in Phase 0.
12. Do not add production sending in Phase 0.
13. Do not add production external integrations in Phase 0.
14. Do not add runtime plugin execution in Phase 0.
15. Do not add real credentials, cookies, tokens, browser profiles, or service role keys.
16. Keep Divar labeled `FUTURE` unless a later accepted ADR changes it.
17. Keep WhatsApp, Instagram, Torob, OCR/STT, AI, browser automation, proxy/account automation, production scraping, and production sending labeled `FUTURE` unless a later accepted ADR changes the specific item.
18. Reject any Phase 0 pull request that contains real bot logic.
19. Reject any Phase 0 pull request that contains real external platform integration.
20. Reject any Phase 0 pull request that makes future modules look implemented.

## Related documents

1. `README.md`
2. `AGENTS.md`
3. `docs/REPO_STATE_INVENTORY.md`
4. `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
5. `docs/AUTOMATION_GAP_ANALYSIS.md`
6. `docs/REPO_STATE_INVENTORY_PHASE0_AUTOMATION_ADDENDUM.md`
7. `docs/automation/README.md`
8. `docs/automation/00_master/MASTER_EXECUTION_PACKAGE.md`
9. `docs/automation/01_product_scope/PROJECT_SCOPE.md`
10. `docs/automation/01_product_scope/PHASE_LABEL_POLICY.md`
11. `docs/automation/02_phases/phase_0/PHASE_0_REQUIREMENTS.md`
12. `docs/automation/02_phases/phase_0/PHASE_0_ACCEPTANCE_CRITERIA.md`
13. `docs/automation/03_architecture/adr/ADR-001-use-existing-get-git-going-core.md`
14. `docs/automation/03_architecture/adr/ADR-002-no-laravel-in-phase-0.md`
15. `docs/automation/03_architecture/adr/ADR-003-supabase-as-source-of-truth.md`
16. `docs/automation/03_architecture/adr/ADR-004-separate-python-worker-runtime.md`
17. `docs/automation/04_contracts/WORKER_RUNTIME_SPEC.md`
18. `docs/automation/04_contracts/jobs/JOB_LIFECYCLE.md`
19. `docs/automation/07_modules/dummy_worker/DUMMY_WORKER_SPEC.md`
20. `docs/automation/07_modules/DIVAR_FUTURE_MODULE_SPEC.md`
21. `.github/pull_request_template.md`
