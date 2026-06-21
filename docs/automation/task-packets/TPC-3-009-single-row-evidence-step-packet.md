# TPC-3-009 — Single Row Evidence Step Packet

## Status

Draft planning packet for the next PHASE-3 step.

This packet is documentation only.

## Background

Confirmed checkpoints before this packet:

1. PHASE-3 phase label compatibility is merged.
2. Local/mock evidence bridge is merged.
3. Guarded contract is merged.
4. Contract validation fix is merged.
5. Local worker-runtime suite was reported green:

       169 passed in 0.40s

6. TPC-3-008 review packet is merged.

## Goal

Define the boundary for a future single-row evidence step.

The only allowed target remains:

    public.automation_driver_outputs

## Non-goals

This packet does not add:

- implementation code
- connection logic
- automatic execution
- UI routes
- API routes
- scheduled jobs
- external calls
- browser automation
- commercial writeback
- secrets or runtime values

## Required future constraints

A future implementation must satisfy all of these conditions:

1. manual invocation only
2. single row only
3. PHASE-3 only
4. target table only `automation_driver_outputs`
5. no queue consumer
6. no cron or daemon
7. no UI/API trigger
8. no source call
9. no browser automation
10. no commercial table path
11. no sensitive runtime value in repo
12. explicit rollback or cleanup note
13. local focused test passes
14. full worker-runtime test passes

## Required future tests

A future implementation PR must include tests for:

1. valid PHASE-3 evidence row accepted by the manual boundary
2. invalid phase label rejected
3. non-zero network calls rejected
4. live execution rejected
5. browser automation rejected
6. commercial table text rejected
7. secret-like text rejected by the existing local evidence validator
8. automatic invocation path absent
9. bulk input rejected
10. target table cannot be changed

## Required future evidence

Future PR evidence must include:

- focused test command
- focused test output
- full test command
- full test output
- confirmation that the step stayed manual and single-row
- confirmation that no commercial table path was touched

## Acceptance criteria

This packet is accepted when:

1. the boundaries above are documented
2. reviewer confirms it is docs-only
3. no implementation exists in this PR
4. no runtime path is opened by this PR

## Final decision

TPC-3-009 defines the next boundary only.

It does not authorize automatic behavior or broad database writes.
