# TPC-2-005 — Torob Live-ReadOnly Output Persistence Gate

**Status:** Draft for review  
**Phase:** Phase 2  
**Scope:** Database-backed persistence gate for accepted Torob live-readonly metadata  
**Execution mode:** No live request, no worker execution, no migration in this packet

## 1. Purpose

Define the rules for persisting accepted `TOROB_LIMITED_READONLY` run metadata into the database-backed worker evidence path.

This packet does **not** authorize a migration, live retry, scheduler, crawler expansion, parser expansion, UI trigger, or business writeback.

It only defines the persistence contract that a later implementation PR must follow.

## 2. Background

Phase 2 has completed:

- queue/API/UI enqueue path,
- worker smoke path,
- first one-product controlled live-readonly evidence,
- three-product safe-abort evidence,
- retry/backoff policy,
- abort evidence builder,
- driver output enrichment with retry decision.

Rapid live retries are paused after repeated HTTP abort evidence.

The next safe step is to define exactly how accepted live-readonly outputs may be recorded in database evidence tables without changing AfraKala business records.

## 3. Allowed persistence target

The preferred target is the existing worker evidence path:

```text
public.automation_driver_outputs
```

A later migration may be required before this target can accept Phase 2 rows, depending on the current `phase_label` check constraint.

If a migration is needed, it must be limited to evidence-table compatibility only and must not alter product, price, customer, supplier, or sales tables.

## 4. Allowed row scope

Rows may be written only for worker/evidence outputs from:

```text
job_type = TOROB_LIMITED_READONLY
phase_label = PHASE-2
source_kind = external_read_only
source = torob
mode = read-only
```

Rows must represent observed public metadata from a controlled run, not business truth.

## 5. Allowed payload fields

The persisted output payload may include only evidence-safe fields:

```text
job_id
run_id
driver_id
source
mode
items_requested
items_completed
read_only_confirmed
live_execution
browser_automation
network_calls
max_total_requests
abort_reason
retry_decision
abort_evidence
normalized_items
```

Each normalized item may include only:

```text
test_product_id
product_name
product_url
seller_name
price
availability_status
http_status
final_url
body_preview_length
status
error_code
```

Current Phase 2 driver behavior may leave `seller_name` and `price` as null.

## 6. Explicitly forbidden payload fields

The output payload must not include:

```text
credentials
cookies
session tokens
authorization headers
full HTML body
full response body
customer data
internal product IDs linked for update
supplier mutation data
sales data
ranking manipulation fields
browser fingerprint data
anti-bot bypass data
```

## 7. Forbidden side effects

The implementation PR must not change:

```text
products
prices
customers
suppliers
sales lists
purchase prices
purchase records
CRM records
messages
status posting workflows
```

It must not enqueue follow-up live jobs automatically.

It must not mark external prices as AfraKala prices.

It must not trigger recalculation, publication, pricing rules, customer communication, or supplier selection.

## 8. Allowed run statuses

Persistence may record both completed and safe-aborted evidence:

```text
COMPLETED
SKIPPED
FAILED
```

But persistence must preserve the original driver status and must not convert `SKIPPED` into `COMPLETED`.

Safe-abort rows must keep:

```text
abort_reason
retry_decision
abort_evidence
items_requested
items_completed
network_calls
```

## 9. Backoff requirement

If `retry_decision.retry_allowed_now = false`, no automated retry may be triggered by the persistence step.

Persistence is record-keeping only.

## 10. Live execution requirement

This packet does not authorize a new live Torob request.

Any future live-readonly attempt still requires:

```text
cooldown
operator review
fresh explicit approval
max 3 products
max 10 requests
concurrency 1
minimum delay 3 seconds
no login
no cookie
no browser automation
no scheduler
no bulk crawl
no business writeback
```

## 11. Migration gate

Before implementing persistence, the next PR must inspect current constraints on:

```text
public.automation_driver_outputs
```

If `PHASE-2` is not currently allowed in `phase_label`, a migration may add only that compatibility and must include a rollback-safe explanation.

No other table constraints should be relaxed.

## 12. Implementation acceptance criteria

The later implementation PR must prove:

1. deterministic test path writes evidence with `live_execution = false`,
2. safe-abort evidence can be serialized without secrets,
3. `retry_decision` is preserved,
4. `source_kind = external_read_only`,
5. no product/price/customer/supplier tables are touched,
6. no scheduler or browser automation is introduced,
7. no live Torob request is made during tests.

## 13. Non-goals

This packet does not implement:

- seller extraction,
- price extraction,
- price comparison,
- automatic product matching,
- automatic competitor price update,
- UI run trigger,
- scheduled worker execution,
- catalog crawling.

## 14. Next PR recommendation

Next implementation PR:

```text
feat(worker): persist Torob read-only evidence outputs
```

Expected scope:

- inspect/adjust evidence-table constraint if required,
- add a persistence helper for accepted driver output,
- add tests that use deterministic/local payloads only,
- no live request.
