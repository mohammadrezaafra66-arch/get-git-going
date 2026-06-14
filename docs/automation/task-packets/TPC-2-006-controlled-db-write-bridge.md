# TPC-2-006 — Controlled DB Write Bridge for Read-Only Evidence

**Status:** Draft for review  
**Phase:** Phase 2  
**Scope:** Controlled database bridge for already-validated read-only evidence rows  
**Execution mode:** Documentation only in this packet

## 1. Purpose

Define the next implementation gate for moving validated Phase 2 read-only evidence rows from the worker-side boundary into the database evidence table.

This packet is a contract only. It does not implement the bridge.

## 2. Starting point

The current Phase 2 path already has:

- controlled queue envelope,
- worker smoke path,
- one-item controlled external evidence,
- safe-abort evidence,
- retry/backoff policy,
- abort evidence builder,
- read-only output row builder,
- evidence-table Phase 2 compatibility,
- deterministic local row check on checked databases,
- worker-side read-only output boundary,
- output adapter,
- deterministic pipeline,
- JobRunner route for deterministic read-only jobs,
- README/status update,
- closeout checkpoint.

## 3. Target table

The only allowed target is:

```text
public.automation_driver_outputs
```

No other table may be modified by this bridge.

## 4. Allowed row type

The bridge may accept only rows validated by the Phase 2 read-only row builder.

Required values:

```text
driver_name = torob_limited_readonly
job_type = TOROB_LIMITED_READONLY
source_kind = external_read_only
phase_label = PHASE-2
```

Allowed status values:

```text
COMPLETED
FAILED
SKIPPED
```

## 5. Allowed output posture

The first implementation PR under this packet must stay deterministic and zero-network.

Required output posture for initial bridge tests:

```text
live_execution = false
network_calls = 0
browser_automation = false
read_only_confirmed = true
```

## 6. Forbidden scope

This packet does not authorize:

- external live requests,
- browser automation,
- scheduler or cron,
- bulk crawl,
- login/session/cookie use,
- CAPTCHA solving or bypass,
- automatic retry,
- product update,
- price update,
- customer update,
- supplier update,
- sales-list update,
- messaging/status-posting workflow changes,
- UI execution trigger,
- new public API route.

## 7. Credential boundary

The implementation must not hardcode secrets.

Any future non-mock database write path must use the existing approved environment/config boundary and must redact secrets from logs.

The first implementation should be test-only/mock-verified unless a separate approval explicitly authorizes a real local database insert command.

## 8. Required implementation behavior

A later implementation PR should add a bridge function with behavior equivalent to:

```text
validated row in
schema/guard checks
single evidence-table insert operation
inserted row summary out
```

The function must reject:

```text
wrong driver_name
wrong job_type
wrong source_kind
wrong phase_label
non-object output
non-array errors
secret-like fields
business-writeback fields
live_execution = true
network_calls > 0
```

## 9. Required tests

The implementation PR must include tests that prove:

1. a valid deterministic Phase 2 read-only row is accepted,
2. wrong driver/job/source/phase is rejected,
3. live/network-backed payload is rejected,
4. secret-like keys are rejected,
5. business-writeback-like keys are rejected,
6. no product/price/customer/supplier/sales data path is touched.

## 10. Evidence requirement

The implementation PR must include an evidence note with:

```text
no external request
no scheduler
no browser automation
no business writeback
validated row only
```

## 11. Acceptance criteria

The packet is ready for implementation when:

- Phase 2 output table constraint includes PHASE-2,
- deterministic local row check has passed on checked databases,
- worker-side persistence boundary is merged,
- JobRunner deterministic route is merged,
- reviewer agrees that this bridge is evidence-only.

## 12. Next recommended PR

```text
feat(worker): add controlled evidence DB bridge
```

The first PR under this packet should remain zero-network and test-first.
