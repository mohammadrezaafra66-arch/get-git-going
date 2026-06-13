# Phase 2 Torob Queue Worker Smoke Evidence — 2026-06-13

**Status:** IMPLEMENTATION PR OPEN — local verification pending  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Queue-to-worker smoke path only; **no live Torob request**.

## Purpose

This evidence stub records the next safe step after the admin panel successfully enqueued a `TOROB_LIMITED_READONLY` job.

The worker smoke runner proves this path:

```text
PENDING automation_jobs row
→ CLAIMED automation_jobs row
→ RUNNING automation_job_runs row
→ COMPLETED automation_job_runs row
→ RUN_STARTED/RUN_COMPLETED automation_log_events
```

## Guardrails

Confirmed by design for this PR:

- no browser automation,
- no login,
- no session cookie,
- no scheduler,
- no bulk crawl,
- no product/price/customer writeback,
- no external Torob request in the smoke path,
- `network_calls = 0`,
- `live_execution = false`.

## Why this is not accepted live Torob evidence

This is a queue/worker smoke step only. It intentionally strips live execution from the queued UI payload and runs the deterministic non-live Torob driver path.

Accepted live evidence still requires a separate manual run with:

- real public Torob product URL(s),
- explicit TPC-2-004 acknowledgement,
- request count and timing evidence,
- completion/abort summary,
- proof that no business data changed.

## Local verification command

From repository root:

```powershell
cd automation/worker-runtime
python -m pytest -q tests/test_torob_queue_smoke.py
```

## Manual local smoke command

After a `TOROB_LIMITED_READONLY` job is visible as `PENDING` in local Supabase:

```powershell
cd C:\Users\AFRA\AfraKala\get-git-going\automation\worker-runtime

$env:SUPABASE_URL="http://127.0.0.1:8000"
$env:SUPABASE_SERVICE_ROLE_KEY="<local service role key from running container>"

python src\torob_queue_smoke.py
```

Expected JSON shape:

```json
{
  "processed": true,
  "job_id": "...",
  "run_id": "...",
  "status": "COMPLETED",
  "network_calls": 0,
  "live_execution": false
}
```

## Acceptance notes

This PR is acceptable only as a safe worker smoke step. It must not be treated as live Torob product evidence.
