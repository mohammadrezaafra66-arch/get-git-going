# Phase 2 Torob HTTP 490 Backoff Policy Evidence — 2026-06-13

**Status:** IMPLEMENTATION PR OPEN — local verification pending  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Backoff/retry decision policy only; **no live Torob request**.

## Purpose

After two controlled live-readonly attempts observed `http_error_490`, Phase 2 must not continue rapid live retries in the same session.

This evidence records the safe next step: a conservative retry/backoff policy that converts abort reasons into operator-facing decisions without making any network calls.

## Policy behavior

For repeated `http_error_490`:

```json
{
  "retry_allowed_now": false,
  "reason": "http_error_490",
  "cooldown_seconds": 21600,
  "next_action": "pause_live_retries"
}
```

For a single HTTP error:

```json
{
  "retry_allowed_now": false,
  "cooldown_seconds": 3600,
  "next_action": "cooldown_before_retry"
}
```

For login/captcha/anti-bot/blocked signals:

```json
{
  "retry_allowed_now": false,
  "cooldown_seconds": 86400,
  "next_action": "pause_and_request_human_review"
}
```

## Guardrails preserved

The policy never recommends:

- bypass,
- stealth,
- CAPTCHA solving,
- login,
- cookie/session use,
- browser automation,
- scheduler,
- bulk retry.

## Local verification command

```powershell
cd automation/worker-runtime
python -m pytest -q tests/test_torob_live_retry_policy.py
```

## Acceptance notes

This step does not perform a live request. It formalizes the stop/backoff decision required before any further live-readonly retry.

## Next action

Run the new policy tests. If green, merge the PR and stop live retry attempts for this session unless a new operator-approved run is scheduled after cooldown and review.
