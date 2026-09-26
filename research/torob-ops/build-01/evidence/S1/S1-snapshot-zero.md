# Cycle 27ffbd97 — snapshots = 0

Run: `27ffbd97-5b9e-4896-9fb9-57aa7bea93d3`  
Status written: `completed` (wrong — should have been `failed`)  
`products_attempted=15` `succeeded=0` `skipped=14` `failed=1`  
`torob_offer_snapshots` for this run_id: **0**

## Scraped

Logs (`S1-eye-logs-cycle.txt`): 85 sellers حضوری + 85 اینترنتی for product `41464c40` (ساید الجی x24). Then link discovery, then `fail=1`.

## Cause

`skip_reasons` last entry (product `41464c40-1bf7-4909-bc2e-4eeadaf02613`):

```
Client error '400 Bad Request' for url 'http://kong:8000/rest/v1/torob_offer_snapshots'
```

`httpx.raise_for_status()` dropped the JSON body. Reproduced from the eye container:

```
OVERFLOW 400
{"code":"22003","message":"value \"50000000000\" is out of range for type integer"}
```

`torob_offer_snapshots.price_toman` is `integer` (max 2_147_483_647). `scraper._price_from_text` accepts up to 50_000_000_000. One (or more) of the 170 seller rows was above integer; PostgREST rejected the whole batch. The worker stored a one-line 400 in `skip_reasons`, printed nothing, and marked the run `completed`.

Clean 1-row and 170-row inserts with prices ≤ integer succeeded (probe rows deleted).

## Fix

- 597: `price_toman` → `bigint`
- `snapshots.raise_if_bad_response` includes the REST body
- `finalize_run_status(insert_failed=True) == "failed"`
- Test seen failing first: `S1-snapshot-test-before.txt`
