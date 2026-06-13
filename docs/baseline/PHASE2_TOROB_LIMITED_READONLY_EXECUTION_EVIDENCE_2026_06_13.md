# Phase 2 Torob Limited Read-Only Execution Evidence — 2026-06-13

**Status:** ACCEPTED — controlled live-readonly probe completed successfully  
**Track:** Phase 2 / Torob limited read-only  
**Packet:** `TPC-2-004-torob-limited-readonly-execution-evidence-packet.md`

## 1. PR / branch context

Evidence run was executed locally from `main` after Phase 2 queue/API/smoke guardrails were merged.

Relevant prior merges:

- Queue/API path: PR #147
- Worker smoke runner: PR #148
- Worker smoke evidence: PR #149

## 2. Commit hash

Evidence run commit:

`1bb1c8ccb0be0a1388b35856a804243bcb8fc478`

## 3. Operator

Local operator verification was performed from the AfraKala Windows PowerShell workspace.

## 4. Environment

Local Windows PowerShell workspace:

`C:\Users\AFRA\AfraKala\get-git-going`

Branch verified before the manual probe:

`main`

## 5. Command shape

Manual controlled probe used the Python `TorobLimitedReadOnlyDriver` directly from the worker runtime.

The run was explicitly configured with:

- `execution_packet = TPC-2-004`
- `manual_execution_ack = TPC-2-004_MANUAL_TOROB_READONLY_ACK`
- `live_execution_requested = true`
- `max_concurrency = 1`
- `max_total_requests = 10`
- `min_delay_ms_between_requests = 3000`
- one operator-supplied public Torob product URL

## 6. Product count

Product count: `1`

Configured first live-readonly limits:

- minimum: 1
- target: 3
- maximum: 3

## 7. Request count

Actual request count: `1`

Configured maximum: `10`

## 8. Timing / delay configuration

Guard configuration:

- `max_concurrency = 1`
- `min_delay_ms_between_requests >= 3000`
- `max_total_run_seconds <= 300`
- `max_total_requests <= 10`

No second request was made, so no inter-request delay was required in this one-product probe.

## 9. Product URL

Public Torob product URL used:

```text
https://torob.com/p/4e47d29c-f134-4ca3-8ef2-04374ab3845b/%D8%AC%D8%A7%D8%B1%D9%88%D8%A8%D8%B1%D9%82%DB%8C-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-bgl8pro5/
```

Product label recorded in the probe:

```text
جاروبرقی بوش مدل BGL8PRO5
```

## 10. Controlled live-readonly output summary

Observed output:

```json
{
  "driver_status": "COMPLETED",
  "job_id": "phase2-live-readonly-manual-001",
  "run_id": "phase2-live-readonly-20260613112634",
  "items_requested": 1,
  "items_completed": 1,
  "network_calls": 1,
  "max_total_requests": 10,
  "abort_reason": null,
  "live_execution": true,
  "browser_automation": false,
  "read_only_confirmed": true,
  "http_status": 200,
  "final_url": "https://torob.com/p/4e47d29c-f134-4ca3-8ef2-04374ab3845b/%D8%AC%D8%A7%D8%B1%D9%88%D8%A8%D8%B1%D9%82%DB%8C-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-bgl8pro5/",
  "availability_status": "fetched_read_only",
  "body_preview_length": 1000,
  "errors": []
}
```

## 11. Checkpoint

Observed checkpoint:

```json
{
  "driver": "torob_limited_readonly",
  "step": "torob_limited_readonly_guarded_live_completed",
  "progress": 100,
  "items_requested": 1,
  "items_completed": 1,
  "live_execution": true,
  "network_calls": 1,
  "abort_reason": null
}
```

## 12. Read-only behavior confirmation

Confirmed:

- no product writeback,
- no price update,
- no customer update,
- no supplier update,
- no production sync,
- no business data mutation.

The guarded path records public response metadata only. It does not parse or write prices.

## 13. No login / session / cookie

Confirmed:

- no login,
- no session,
- no cookie handling,
- no credentials,
- no secrets.

## 14. No browser automation

Confirmed:

- no Playwright,
- no Selenium,
- no browser profile,
- no browser automation.

## 15. No scheduler / bulk crawl

Confirmed:

- no scheduler,
- no cron,
- no always-on worker path,
- no bulk crawl,
- no catalog-wide discovery.

## 16. Abort / completion status

Completion status:

```text
COMPLETED
```

Abort reason:

```text
null
```

Errors:

```text
[]
```

## 17. No business data changed

Confirmed:

- no AfraKala price changed,
- no product changed,
- no customer changed,
- no supplier changed,
- no production data changed.

## 18. Acceptance decision

This evidence accepts the first controlled Torob live-readonly probe for one public product URL.

This acceptance does **not** authorize:

- scheduler/cron,
- bulk crawl,
- browser automation,
- login/session/cookie,
- automatic product discovery,
- price/product/customer writeback,
- expansion to non-Torob sources.

## 19. Next action

Next Phase 2 work should either:

1. extend evidence to the target 3-product controlled run under the same guardrails, or
2. wire accepted live-readonly outputs into the database-backed worker evidence path with no business writeback.
