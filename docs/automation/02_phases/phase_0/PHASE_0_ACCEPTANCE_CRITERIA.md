# Phase 0 Acceptance Criteria

Phase 0 is not complete until all criteria below are satisfied.

## 1. Repository preparation

- Branch exists for Phase 0 work.
- Required documentation folders exist.
- Required placeholder files exist.
- No existing production module is rewritten.

## 2. Documentation readiness

- Repository inventory exists.
- Automation gap analysis exists.
- Project scope exists.
- Phase label policy exists.
- Phase 0 requirements exist.
- Phase 0 acceptance criteria exists.

## 3. Architecture readiness

- ADR placeholders exist.
- No parallel core is created.
- No Laravel core is added.
- Existing repository remains the control plane/core.
- Supabase/PostgreSQL remains the source of truth.

## 4. Contract readiness

- API contract placeholder exists.
- Job lifecycle placeholder exists.
- Event contract placeholder exists.
- Plugin/Driver contract placeholder exists.
- JSON schema placeholders are planned or created.

## 5. Database readiness

- Automation table design is documented before migration.
- RLS/RBAC plan is documented before migration.
- Rollback plan is documented before migration.
- No automation migration is added before approval.

## 6. Worker readiness

- Worker Runtime skeleton is planned or created.
- Dummy Worker specification exists.
- Dummy Worker is limited to simulated work.
- No real external platform is called.

## 7. End-to-end readiness

The safe dummy flow must be testable:

1. create dummy job
2. claim dummy job
3. send heartbeat
4. write log/progress/checkpoint
5. complete or fail job
6. read final status

## 8. Forbidden work check

Phase 0 is not accepted if it includes any of these:

- real Divar crawler
- real WhatsApp sender
- real Instagram extractor
- real Torob scraper
- real OCR/STT pipeline
- real AI/LLM pipeline
- real proxy/account management
- production scraping
- production message sending
- Laravel core
- parallel database
- parallel admin panel
- parallel API layer

## 9. Final acceptance rule

Phase 0 is accepted only when it proves the platform foundation is ready without building real bots.
