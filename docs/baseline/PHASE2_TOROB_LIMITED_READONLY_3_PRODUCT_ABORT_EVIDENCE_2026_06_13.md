# Phase 2 Torob Limited Read-Only 3-Product Abort Evidence — 2026-06-13

**Status:** ACCEPTED AS SAFE ABORT — 3-product controlled run stopped on HTTP error  
**Track:** Phase 2 / Torob limited read-only  
**Packet:** `TPC-2-004-torob-limited-readonly-execution-evidence-packet.md`

## 1. Purpose

Record the controlled 3-product live-readonly Torob attempt after the first accepted one-product live-readonly evidence.

This run is **not** accepted as a fully completed 3-product evidence run because the third product returned `http_error_490`.

It is accepted as **safe-abort evidence** because the guard stopped after the HTTP error, did not continue crawling, and did not perform any writeback.

## 2. Commit hash

Evidence run commit:

```text
2ed6d2ec8655d2ad9998ab5441ed47cb6c6bbeae
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
items_completed = 2
```

## 6. Request count

```text
network_calls = 3
max_total_requests = 10
```

The run stayed under the configured request limit.

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
  "items_completed": 2,
  "live_execution": true,
  "network_calls": 3,
  "abort_reason": "http_error_490"
}
```

## 8. Product results

### Product 1

```text
test_product_id = torob-live-001
product_name = جاروبرقی بوش مدل BGL8PRO5
http_status = 200
status = ok
availability_status = fetched_read_only
```

URL:

```text
https://torob.com/p/4e47d29c-f134-4ca3-8ef2-04374ab3845b/%D8%AC%D8%A7%D8%B1%D9%88%D8%A8%D8%B1%D9%82%DB%8C-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-bgl8pro5/
```

### Product 2

```text
test_product_id = torob-live-002
product_name = چای‌ساز بوش مدل TTA5883
http_status = 200
status = ok
availability_status = fetched_read_only
```

URL:

```text
https://torob.com/p/bd724198-7383-4d27-a6c3-4979d6e89a42/%DA%86%D8%A7%DB%8C-%D8%B3%D8%A7%D8%B2-%D8%A8%D9%88%D8%B4-%D9%85%D8%AF%D9%84-tta5883-%D8%B8%D8%B1%D9%81%DB%8C%D8%AA-17-%D9%84%DB%8C%D8%AA%D8%B1-%D8%A8%D8%A7-%DA%A9%D8%AA%D8%B1%DB%8C-%D8%A7%D8%B3%D8%AA%DB%8C%D9%84-%D8%B6%D8%AF-%D8%B2%D9%86%DA%AF/
```

### Product 3

```text
test_product_id = torob-live-003
product_name = مایکروویو ال‌جی مدل MH8265
result = safe abort before accepting normalized item
abort_reason = http_error_490
```

URL:

```text
https://torob.com/p/7c95d05c-bc30-4f9d-9fda-0932d72760bb/%D9%85%D8%A7%DB%8C%DA%A9%D8%B1%D9%88%D9%88%DB%8C%D9%88-%D8%A7%D9%84-%D8%AC%DB%8C-%D9%85%D8%AF%D9%84-mh8265-%D8%B8%D8%B1%D9%81%DB%8C%D8%AA-42-%D9%84%DB%8C%D8%AA%D8%B1-%D8%A8%D8%A7-28-%D8%A8%D8%B1%D9%86%D8%A7%D9%85%D9%87-a%2B/
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

This evidence accepts the run as a **safe-abort controlled live-readonly 3-product attempt**.

It does **not** accept it as a fully completed 3-product live-readonly run, because the third product returned `http_error_490` and the driver correctly stopped.

## 14. Next action

Next Phase 2 work should either:

1. retry a 3-product evidence run with a replacement public Torob URL for the third product, or
2. wire accepted one-product live-readonly output and safe-abort evidence into the database-backed worker evidence path, without business writeback.
