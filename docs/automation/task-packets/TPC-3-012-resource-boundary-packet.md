# TPC-3-012 — Resource Boundary Packet

## Status

Documentation-only planning packet for PHASE-3 resource and volume limits.

## Background

Confirmed checkpoints before this packet:

1. Single-row evidence step is merged.
2. Row summary path is merged.
3. Row summary review is merged.
4. Latest reported worker-runtime result:

       176 passed in 2.64s

## Goal

Define resource and volume limits for the PHASE-3 evidence path before broader behavior is considered.

## Scope

Docs only.

No code, UI, API, scheduled job, external integration, broad table change, or sensitive value is added by this packet.

## Proposed limits

Future implementation must start with these limits unless a later packet changes them:

1. max rows per manual step: 1
2. max normalized items per row: 1
3. max summary fields: 20
4. max error strings in one row: 5
5. max error string length: 300 characters
6. max run id length: 120 characters
7. max job id length: 120 characters
8. max payload nesting depth: 4
9. no raw page body in summary
10. no large artifact storage in this path

## Required future checks

A future implementation must prove:

1. more than one row is rejected
2. more than one normalized item is rejected
3. oversized error text is rejected or truncated safely
4. unexpected raw fields are rejected
5. summary output stays small
6. target remains `automation_driver_outputs`
7. phase label remains `PHASE-3`

## Stop conditions

Stop if any future change introduces:

1. multi-row input
2. bulk processing
3. automatic trigger
4. UI trigger
5. API trigger
6. scheduled job
7. external source dependency
8. broad table path
9. sensitive runtime value
10. unbounded payload or artifact size

## Required evidence

Future work must include:

- focused test output
- full worker-runtime test output
- example safe summary
- boundary failure examples
- confirmation that the step remains single-row

## Acceptance criteria

This packet is accepted when:

1. limits are documented
2. stop conditions are documented
3. reviewer confirms docs-only scope
4. no implementation is included

## Final decision

TPC-3-012 defines resource boundaries only.

It does not authorize broader or automatic behavior.
