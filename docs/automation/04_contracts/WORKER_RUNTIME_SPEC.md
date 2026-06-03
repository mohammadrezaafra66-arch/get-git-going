# Worker Runtime Spec

## Phase 0 scope

The Worker Runtime in Phase 0 is limited to dummy jobs only.

It must not run real bots, real scrapers, real senders, OCR/STT, AI pipelines, proxy management, account automation, or browser automation.

## Worker responsibilities

A Phase 0 worker must be able to:

1. register or identify itself
2. claim a dummy job
3. mark the job as running
4. send heartbeat
5. append logs
6. update progress
7. save checkpoint
8. register output
9. mark success or failure
10. stop safely when requested

## Required runtime behavior

- Idempotent job handling.
- Safe retry behavior.
- Heartbeat while running.
- Checkpoint before stopping.
- No secrets in logs.
- No external platform calls in Phase 0.

## Failure behavior

If the worker fails, the system must be able to detect stale heartbeat and make the job recoverable according to the job lifecycle.
