# Phase 2 Torob Limited Read-Only Execution Evidence — 2026-06-13

**Status:** GUARDED READINESS VERIFIED — placeholder live probe exposed HTTP-error handling fix  
**Track:** Phase 2 / Torob limited read-only  
**Packet:** `TPC-2-004-torob-limited-readonly-execution-evidence-packet.md`

## 1. PR

PR #139 — `feat(worker): add TPC-2-004 guarded Torob readiness`

Follow-up fix PR: pending — HTTP 500 must abort the guarded run instead of being counted as completed.

## 2. Commit hash

PR #139 merge commit:

`6f31e388c0f3f33c7e14ad0d802306f61d38db82`

Follow-up fix commit: pending final PR head.

## 3. Operator

Local operator verification was performed from the AfraKala Windows PowerShell workspace.

## 4. Environment

Local Windows PowerShell workspace:

`C:\Users\AFRA\AfraKala\get-git-going`

Branch verified before the manual probe:

`main`

## 5. Commands used

Local verification command:

```powershell
cd C:\Users\AFRA\AfraKala\get-git-going

git checkout main
git pull origin main

cd automation/worker-runtime
python -m pytest -q
```

Manual guarded probe command was run through PowerShell stdin using the `TorobLimitedReadOnlyDriver` and `MockSupabaseClient` only.

## 6. Test result

Recorded local result before the manual probe:

```text
114 passed in 0.24s
```

The suite includes guarded tests for explicit acknowledgement, max live product count, Torob-only public HTTPS URLs, minimum delay, request limit, no browser automation confirmation, patchable fetch path, and HTTP-error abort behavior.

## 7. Product count

Manual guarded probe product count: `1`

Configured future live limit:

- minimum: 1
- target: 3
- maximum: 3

## 8. Request count

Manual guarded probe actual request count: `1`

Configured future live maximum: `10`

## 9. Timing / delay configuration

Guard configuration:

- `max_concurrency = 1`
- `min_delay_ms_between_requests >= 3000`
- `max_total_run_seconds <= 300`
- `max_total_requests <= 10`

## 10. Manual guarded probe output

The probe was run with a placeholder Torob path:

```text
https://torob.com/p/REPLACE_WITH_REAL_PRODUCT/
```

Observed output before the HTTP-error fix:

```json
{
  "status": "COMPLETED",
  "errors": [],
  "network_calls": 1,
  "abort_reason": null,
  "items_completed": 1,
  "http_status": 500,
  "live_execution": true,
  "browser_automation": false,
  "read_only_confirmed": true
}
```

This result is **not accepted as successful live product evidence** because:

1. the URL was a placeholder path,
2. Torob returned HTTP 500,
3. HTTP 500 was incorrectly treated as completed.

## 11. Fix recorded in follow-up

The guarded driver is updated so:

- HTTP 401/403 still abort as `blocked_http_401` / `blocked_http_403`,
- any other HTTP status `>= 400` aborts as `http_error_<status_code>`,
- HTTP 500 now returns `SKIPPED` with `abort_reason = http_error_500`,
- no normalized item is accepted for HTTP 500.

A regression test is added for HTTP 500 guarded abort.

## 12. Read-only behavior confirmation

Confirmed for this readiness/probe step:

- no product writeback,
- no price update,
- no customer update,
- no production sync,
- no UI exposure,
- no API exposure.

The guarded path records response metadata only and does not parse or write prices.

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

## 16. Errors encountered

Observed error condition:

```text
HTTP 500 from placeholder Torob path
```

Resolution:

```text
Guard updated to abort all HTTP >= 400 responses.
```

## 17. No business data changed

Confirmed:

- no AfraKala price changed,
- no product changed,
- no customer changed,
- no supplier changed,
- no production data changed.

## 18. Required next action

Before any accepted live Torob product evidence, run again with a real public Torob product URL after the HTTP-error fix is merged and local tests pass.

The next accepted evidence must include:

1. real product URL or ID,
2. actual request count,
3. completion or abort result,
4. output summary,
5. confirmation that no prices/products/customers were changed.
