# Phase 2 Torob Current Status and Next Gates — 2026-06-13

**Status:** ACTIVE — controlled read-only path validated; rapid live retries paused  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Status and next-gate record only; no live request, no code execution.

## 1. Completed milestones

Phase 2 has now completed the following controlled milestones:

1. Admin panel can enqueue `TOROB_LIMITED_READONLY` jobs.
2. Queue API route exists and returns reliable job output.
3. Local auth/admin approval path was verified for test operator access.
4. Worker smoke runner can claim queued Torob jobs.
5. Worker smoke path creates completed runs with:
   - `network_calls = 0`,
   - `live_execution = false`.
6. First controlled one-product live-readonly probe completed successfully:
   - `driver_status = COMPLETED`,
   - `network_calls = 1`,
   - `http_status = 200`,
   - no browser automation,
   - no login/session/cookie,
   - no business writeback.
7. Controlled three-product run produced safe-abort evidence:
   - 2 products completed with HTTP 200,
   - third product triggered HTTP error,
   - driver stopped safely.
8. Controlled three-product retry produced safe-abort evidence:
   - first request triggered HTTP error,
   - driver stopped immediately.
9. Retry/backoff policy was added.
10. Abort evidence builder was added.
11. Driver abort output now includes retry decision in output/checkpoint.

## 2. Current decision

Because repeated HTTP 490-style aborts were observed during live-readonly attempts, rapid live retries are paused.

Current recommended action:

```text
pause_live_retries
```

Current policy posture:

```text
retry_allowed_now = false
```

Minimum next action before another live attempt:

```text
cooldown + operator review + fresh explicit confirmation
```

## 3. What is still not authorized

The following remain not authorized:

- scheduler / cron / always-on worker,
- bulk crawl,
- browser automation,
- login/session/cookie use,
- CAPTCHA solving or bypass,
- stealth or anti-bot evasion,
- automatic product discovery,
- price/product/customer/supplier writeback,
- expansion to non-Torob sources.

## 4. Remaining Phase 2 work

Remaining work should proceed through separate PRs:

### Gate A — completed 3-product live-readonly evidence

A future run may retry the 3-product evidence only after cooldown and explicit operator approval.

Acceptance target:

```text
items_requested = 3
items_completed = 3
network_calls <= 10
abort_reason = null
browser_automation = false
read_only_confirmed = true
```

### Gate B — database-backed live-readonly output persistence

Wire accepted live-readonly output metadata into the database-backed worker evidence path without business writeback.

This must not change AfraKala products, prices, customers, suppliers, or sales data.

### Gate C — operator-visible evidence panel

Optional later UI work may display already-recorded run evidence. It must not trigger live execution from the browser.

## 5. Current Phase 2 progress estimate

```text
Queue/API/UI enqueue: complete
Worker smoke path: complete
One-product live-readonly evidence: complete
Three-product evidence: safe-abort only
Retry/backoff policy: complete
Abort evidence builder: complete
Database-backed live output persistence: pending
Completed 3-product evidence: pending after cooldown
```

Estimated progress:

```text
~70% complete
~30% remaining
```

## 6. Next recommended PR

The next safest PR is:

```text
docs/implementation: define database-backed live-readonly output persistence gate
```

It should define exactly which fields can be written, where they go, and which business writebacks remain forbidden.

No live retry should happen before cooldown and explicit operator approval.
