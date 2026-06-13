# Phase 2 Torob Limited Read-Only 3-Product Retry Abort Evidence — 2026-06-13

**Status:** ACCEPTED AS SAFE ABORT — retry stopped on first HTTP 490  
**Track:** Phase 2 / Torob limited read-only  
**Packet:** `TPC-2-004-torob-limited-readonly-execution-evidence-packet.md`

## 1. Purpose

Record the controlled 3-product retry after the previous 3-product controlled run stopped on `http_error_490` for the third product.

This retry is **not** accepted as a fully completed 3-product evidence run because the first request returned `http_error_490`.

It is accepted as **safe-abort evidence** because the driver stopped immediately after the HTTP error, did not continue to the second or third product, and did not perform any writeback.

## 2. Commit hash

Evidence run commit:

```text
edd37ba8b7de236fadbae84ba738d65f64488bef
```

## 3. Environment

```text
local Windows PowerShell
branch: main
```

## 4. Operator confirmation

The operator explicitly confirmed:

```text
controlled live-readonly three-product run only;
with exactly the three supplied Torob links;
no login, no cookie, no browser automation;
no scheduler, no bulk crawl;
max 10 requests, concurrency 1, minimum 3 second delay;
no price/product/customer/supplier changes.
```

## 5. Product count

```text
items_requested = 3
items_completed = 0
```

## 6. Request count

```text
network_calls = 1
max_total_requests = 10
```

The run stopped after the first request and stayed well under the configured request limit.

## 7. Run status

```text
driver_status = SKIPPED
abort_reason = http_error_490
errors = ["http_error_490"]
```

Checkpoint:

```json
{
  "driver": "torob_limited_readonly",
  "step": "torob_limited_readonly_guarded_live_aborted",
  "progress": 0,
  "items_requested": 3,
  "items_completed": 0,
  "live_execution": true,
  "network_calls": 1,
  "abort_reason": "http_error_490"
}
```

## 8. Product set

### Product 1

```text
test_product_id = torob-live-001
product_name = جاروبرقی بوش مدل BGL8PRO5
result = safe abort before accepting normalized item
abort_reason = http_error_490
```

URL:

```text
https://torob.com/p/4e47d29c-f134-4ca3-8ef2-04374ab3845b/%D8%AC%D8%A7%D8%B1%D9%88%D8%A8%D8%B1%D9%82%DB%8C-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-bgl8pro5/
```

### Product 2

Not requested during this retry because product 1 triggered safe abort.

URL planned:

```text
https://torob.com/p/bd724198-7383-4d27-a6c3-4979d6e89a42/%DA%86%D8%A7%DB%8C-%D8%B3%D8%A7%D8%B2-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-tta5883-%D8%B8%D8%B1%D9%81%DB%8C%D8%AA-17-%D9%84%DB%8C%D8%AA%D8%B1-%D8%A8%D8%A7-%DA%A9%D8%AA%D8%B1%DB%8C-%D8%A7%D8%B3%D8%AA%DB%8C%D9%84-%D8%B6%D8%AF-%D8%B2%D9%86%DA%AF/
```

### Product 3

Not requested during this retry because product 1 triggered safe abort.

Replacement URL planned:

```text
https://torob.com/p/c456dd2d-5030-46bf-9d22-7558cdd873f1/%D8%B3%D8%B1%D8%AE-%DA%A9%D9%86-%D8%A8%D8%B1%D9%84%DB%8C%D9%86-950b-%D8%B8%D8%B1%D9%81%DB%8C%D8%AA-8-%D9%84%DB%8C%D8%AA%D8%B1-%D8%A8%D8%AF%D9%88%D9%86-%D8%B1%D9%88%D8%BA%D9%86/
```

## 9. Read-only behavior confirmation

Confirmed:

- no product writeback,
- no price update,
- no customer update,
- no supplier update,
- no production sync,
- no business data mutation.

The guarded path records public response metadata only. It does not parse or write prices.

## 10. No login / session / cookie

Confirmed:

- no login,
- no session,
- no cookie handling,
- no credentials,
- no secrets.

## 11. No browser automation

Confirmed:

- no Playwright,
- no Selenium,
- no browser profile,
- no browser automation.

## 12. No scheduler / bulk crawl

Confirmed:

- no scheduler,
- no cron,
- no always-on worker path,
- no bulk crawl,
- no catalog-wide discovery.

## 13. Acceptance decision

This evidence accepts the run as a **safe-abort controlled live-readonly retry**.

It does **not** accept it as a fully completed 3-product live-readonly run, because the first product returned `http_error_490` and the driver correctly stopped.

## 14. Next action

Do not continue rapid live retries in the same session.

Next Phase 2 work should add an explicit retry/backoff evidence rule for repeated HTTP 490 responses before another live attempt, while preserving all no-login/no-browser/no-scheduler/no-bulk guardrails.
