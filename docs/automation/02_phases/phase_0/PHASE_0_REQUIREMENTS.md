# Phase 0 Requirements

## 1. Purpose

Phase 0 prepares the Afra Automation foundation inside the existing `get-git-going` repository without building real bots or creating a parallel core.

## 2. Phase 0 includes

1. Repository inventory.
2. Documentation structure.
3. Phase labels and scope control.
4. Architecture decision placeholders/ADRs.
5. Automation table design.
6. API contract design.
7. JSON schema placeholders/contracts.
8. Worker Runtime skeleton.
9. Dummy Worker only.
10. Logging, checkpoint, status and start/stop contract design.
11. End-to-end dummy test.

## 3. Required Phase 0 outputs

- `docs/automation/` documentation structure.
- Automation inventory and gap files.
- Scope and phase label policy.
- Phase 0 requirements and acceptance files.
- Automation API contract placeholder.
- Automation job lifecycle placeholder.
- Automation database/table design placeholder.
- Dummy Worker specification placeholder.
- Worker skeleton folder.
- Test case registry placeholder.

## 4. Automation tables to design

Phase 0 must design tables for:

- jobs
- workers
- worker heartbeats
- job logs
- checkpoints
- artifacts
- plugin/driver registry
- job events

No migration should be added until the table design, RLS/RBAC, rollback and acceptance criteria are approved.

## 5. Dummy Worker requirement

The Dummy Worker may only simulate work.

It may test:

- claim job
- heartbeat
- progress update
- log append
- checkpoint save
- artifact registration
- success/failure state

It must not call Divar, WhatsApp, Instagram, Torob, OCR/STT, AI, proxy services or browser automation.

## 6. End-to-end test requirement

The Phase 0 end-to-end test must prove only this safe loop:

1. Operator creates or triggers a dummy job.
2. Worker claims the dummy job.
3. Worker sends heartbeat.
4. Worker writes logs/progress/checkpoint.
5. Worker marks job completed or failed.
6. UI/API can read the final status.

## 7. Explicitly forbidden in Phase 0

Do not build:

- real Divar crawler
- real WhatsApp sender
- real Instagram extractor
- real Torob scraper
- real OCR/STT pipeline
- real AI/LLM pipeline
- real browser automation driver
- real proxy/account management
- production scraping
- production message sending
- Laravel core
- parallel database
- parallel admin panel
- parallel API layer

## 8. Phase 0 success condition

Phase 0 is successful only when the project has safe structure, contracts, dummy worker design and a testable dummy flow without any real external automation.
