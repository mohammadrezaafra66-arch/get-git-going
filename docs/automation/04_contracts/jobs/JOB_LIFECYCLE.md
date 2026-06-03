# Job Lifecycle

## Statuses

- `PENDING`: waiting to be claimed.
- `CLAIMED`: assigned to a worker.
- `RUNNING`: currently executing.
- `PAUSED`: temporarily paused.
- `SUCCEEDED`: completed successfully.
- `FAILED`: completed with error.
- `CANCELLED`: intentionally stopped.
- `RETRY_WAITING`: waiting before retry.

## Phase 0 note

This lifecycle is for dummy jobs only during Phase 0.
