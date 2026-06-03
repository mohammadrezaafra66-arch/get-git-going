# Dummy Worker Spec

## Phase 0 scope

Dummy Worker is a safe simulation worker for Phase 0 only.

It must not call external platforms or run real automation.

## Allowed behavior

The Dummy Worker may simulate:

1. claiming a dummy job
2. setting job status to `RUNNING`
3. sending heartbeat
4. writing logs
5. updating progress
6. saving checkpoint
7. registering output
8. marking job as `SUCCEEDED` or `FAILED`

## Forbidden behavior

The Dummy Worker must not perform:

- real Divar crawling
- real WhatsApp sending
- real Instagram extraction
- real Torob scraping
- OCR/STT
- AI/LLM processing
- browser automation
- proxy/account management
- production scraping
- production sending

## Success condition

The Dummy Worker is acceptable only if it proves the job lifecycle and worker contract without touching any real external service.
