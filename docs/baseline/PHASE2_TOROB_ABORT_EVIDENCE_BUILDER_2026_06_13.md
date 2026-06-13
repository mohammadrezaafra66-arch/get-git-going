# Phase 2 Torob Abort Evidence Builder — 2026-06-13

**Status:** IMPLEMENTATION PR OPEN — local verification pending  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Evidence payload builder only; **no live Torob request**.

## Purpose

After repeated safe-abort evidence and a backoff policy, Phase 2 needs a structured way to attach retry/backoff decisions to guarded live-readonly abort outputs.

This step adds a small evidence builder that converts driver output into a JSON-safe operator evidence payload.

## Input

The builder accepts:

- driver status,
- driver output,
- driver errors,
- consecutive same abort reason count.

## Output

The builder returns:

```json
{
  "accepted_as_safe_abort": true,
  "driver_status": "SKIPPED",
  "abort_reason": "http_error_490",
  "items_requested": 3,
  "items_completed": 0,
  "network_calls": 1,
  "live_execution": true,
  "browser_automation": false,
  "read_only_confirmed": true,
  "errors": ["http_error_490"],
  "retry_decision": {
    "retry_allowed_now": false,
    "reason": "http_error_490",
    "cooldown_seconds": 21600,
    "next_action": "pause_live_retries"
  }
}
```

## Guardrails preserved

The evidence payload always keeps:

- no login/session/cookie,
- no browser automation,
- no scheduler,
- no bulk crawl,
- no business writeback.

## Local verification command

```powershell
cd automation/worker-runtime
python -m pytest -q tests/test_torob_live_abort_evidence.py
```

## Acceptance notes

This step does not perform a live request and does not retry Torob. It only standardizes evidence after an already observed guarded abort.
