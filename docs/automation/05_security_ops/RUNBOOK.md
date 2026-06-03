# Operational Runbook

## Scope

This runbook is for Phase 0 automation foundation and dummy worker operations only.

No real bots, scraping, sending, OCR/STT, AI pipeline, proxy management or external platform automation is covered here.

## 1. Worker died

1. Check last heartbeat.
2. Mark stale worker as unavailable.
3. Check the related job status.
4. If job is not terminal, move it to a recoverable state according to Job Lifecycle.
5. Restart only the dummy worker process.
6. Verify heartbeat resumes.
7. Record the incident note.

## 2. Internet disconnected

1. Stop claiming new jobs.
2. Keep current dummy job state safe.
3. Save checkpoint.
4. Wait for connection recovery.
5. Resume only after heartbeat and API access are stable.
6. Do not retry aggressively.

## 3. Power outage

1. After restart, check worker boot status.
2. Check unfinished jobs.
3. Read last checkpoint.
4. Resume dummy job only if lifecycle allows it.
5. Do not start real automation.
6. Record recovery note.

## 4. Job stuck

1. Check status and last progress update.
2. Check last heartbeat.
3. If worker is alive, pause job for review.
4. If worker is dead, mark job recoverable.
5. Do not manually edit database rows without approved procedure.

## 5. Migration failed

1. Stop further database changes.
2. Do not run a second migration attempt blindly.
3. Check migration error.
4. Use the approved rollback plan.
5. Verify database health.
6. Record failure and recovery details.

## 6. Final rule

If the incident involves real credentials, production data, RLS/RBAC, service role usage, migration damage or external platform automation, stop and escalate to owner review.
