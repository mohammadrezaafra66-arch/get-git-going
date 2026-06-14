# TPC-3-001 — Controlled Evidence DB Bridge Implementation Packet

**Status:** Draft for review  
**Phase:** Phase 3  
**Scope:** Controlled implementation gate for moving validated evidence rows from worker boundary to the evidence table  
**Execution mode:** Documentation only in this packet

## 1. Purpose

Define the first Phase 3 implementation gate after Phase 2 acceptance.

Phase 2 accepted the deterministic read-only worker foundation. Phase 3 may begin only with a controlled evidence database bridge that writes already-validated evidence rows to the approved evidence table.

This packet does not implement the bridge. It defines the allowed implementation boundary.

## 2. Source of truth from Phase 2

Accepted deterministic chain:

```text
JobRunner
readonly pipeline
validated output row
worker persistence boundary
bridge guard boundary
```

Accepted row posture:

```text
live_execution = false
network_calls = 0
browser_automation = false
read_only_confirmed = true
source_kind = external_read_only
phase_label = PHASE-2
```

## 3. Allowed target table

The only allowed table target for the first implementation is:

```text
public.automation_driver_outputs
```

No business table may be touched.

## 4. Allowed operation

The first implementation may add a controlled bridge function that performs one evidence-row insert after validation.

Allowed operation shape:

```text
validated row
schema checks
guard checks
single insert into evidence table
safe inserted-row summary
```

## 5. Forbidden operation

This packet does not authorize:

- external live request,
- scheduler or daemon,
- bulk crawl,
- browser automation,
- login/session/cookie use,
- automatic retry,
- product update,
- price update,
- customer update,
- supplier update,
- sales-list update,
- messaging/status workflow update,
- new public API route,
- operator UI trigger.

## 6. Credential boundary

No secret may be committed.

The implementation must use existing runtime configuration boundaries only.

Logs and summaries must not expose database keys, URLs with secrets, tokens, or connection strings.

## 7. First implementation rules

The first implementation PR must remain:

```text
zero-network
non-live
single-row
worker-only
test-first
no scheduler
no business writeback
```

The first implementation should prefer a dry-run or local-only bridge path unless a separate approval explicitly authorizes a real local database insert test.

## 8. Required validations

The bridge must reject rows when any of the following are true:

```text
wrong driver_name
wrong job_type
wrong source_kind
wrong phase_label
live_execution is true
network_calls greater than zero
browser_automation is true
read_only_confirmed is not true
output is not an object
errors is not an array
secret-like fields are present
business-writeback-like fields are present
```

## 9. Required tests

The implementation PR must prove:

1. valid deterministic row is accepted,
2. nonzero network row is rejected,
3. live row is rejected,
4. wrong phase/source/job/driver is rejected,
5. secret-like payload is rejected,
6. business-writeback-like payload is rejected,
7. only the evidence target is referenced,
8. the returned summary is redacted and safe.

## 10. Evidence requirement

The implementation PR must include a short evidence note confirming:

```text
no external request
no scheduler
no browser automation
no login/session/cookie
no business writeback
single evidence target only
```

## 11. Acceptance criteria

Phase 3 first gate is accepted when:

- tests pass,
- bridge remains deterministic and zero-network,
- no business table is touched,
- no credentials are committed,
- output summary is safe,
- reviewer confirms this is evidence-only.

## 12. Next recommended PR

```text
worker evidence bridge skeleton
```

The PR title may be neutral if repository guardrails require it.
