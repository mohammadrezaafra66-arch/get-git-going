# Phase 2 Torob Queue Worker Smoke Evidence — 2026-06-13

**Status:** ACCEPTED — local queue-to-worker smoke verified  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Queue-to-worker smoke path only; **no live Torob request**.

## Purpose

This evidence records the safe worker step after the admin panel successfully enqueued `TOROB_LIMITED_READONLY` jobs.

The worker smoke runner proves this path:

```text
PENDING automation_jobs row
→ CLAIMED automation_jobs row
→ RUNNING automation_job_runs row
→ COMPLETED automation_job_runs row
→ RUN_STARTED/RUN_COMPLETED automation_log_events
```

## Guardrails

Confirmed by implementation and local verification:

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

Observed result:

```text
4 passed in 0.11s
```

## Manual local smoke command

After a `TOROB_LIMITED_READONLY` job is visible as `PENDING` in local Supabase:

```powershell
cd C:\Users\AFRA\AfraKala\get-git-going\automation\worker-runtime

$env:SUPABASE_URL="http://127.0.0.1:8000"
$env:SUPABASE_SERVICE_ROLE_KEY="<local service role key from running container>"

python src\torob_queue_smoke.py
```

## Observed local database result

Local query after two smoke runs:

```text
job_id                                | job_status | run_id                               | run_status | network_calls | live_execution | created_at                  | completed_at
--------------------------------------+------------+--------------------------------------+------------+---------------+----------------+-----------------------------+----------------------------
03114ffd-ebc1-4829-bf97-d2ca66269cd5 | CLAIMED    | d4583f9d-e00a-4c18-a302-db916d318f32 | COMPLETED  | 0             | false          | 2026-06-13 11:19:11.429958 | 2026-06-13 11:19:12.563169
e48bbcfb-4d03-408b-af4c-2e7ff98ff2ee | CLAIMED    | 093e87fc-9342-4699-9120-f8a484ddb0ff | COMPLETED  | 0             | false          | 2026-06-13 11:16:25.033602 | 2026-06-13 11:16:26.140423
```

## Acceptance notes

This evidence accepts the worker smoke step only.

It confirms that queued Phase 2 Torob jobs can be claimed and completed by the worker pipeline without live network calls. It must not be treated as live Torob product evidence.

## Next approved step

Open a separate controlled live-readonly evidence run for a real public Torob product URL, using explicit TPC-2-004 acknowledgement and preserving all no-login/no-browser/no-scheduler/no-bulk guardrails.
