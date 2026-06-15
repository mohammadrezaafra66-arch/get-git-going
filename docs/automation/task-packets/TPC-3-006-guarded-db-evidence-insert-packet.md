# TPC-3-006 — Guarded Database Evidence Insert Packet

## Status

Draft packet for the next PHASE-3 step after the local/mock evidence insert path passed local testing.

This packet is documentation only.

## Background

The PHASE-3 evidence chain has reached these checkpoints:

1. TPC-3-003 documented the evidence-table compatibility blocker.
2. TPC-3-004 added the PHASE-3 phase-label compatibility migration.
3. TPC-3-005 added a controlled local/mock evidence insert bridge.
4. The worker-runtime local suite was reported green with:

       163 passed in 0.48s

## Goal

Define the guardrails for a future database evidence insert step into:

    public.automation_driver_outputs

The future step must remain narrow, explicit, reviewed, and test-first.

## Non-goals

This packet does not implement:

- database execution
- runtime connection code
- UI changes
- API routes
- scheduler, cron, or daemon behavior
- external source calls
- browser automation
- product, price, customer, supplier, sales, CRM, or commercial writeback
- secrets or runtime values

## Required future behavior

A future implementation PR may only insert rows that satisfy all of these constraints:

1. target table is `public.automation_driver_outputs`
2. `phase_label` is `PHASE-3`
3. `source_kind` is internal/local evidence only
4. `live_execution` is false
5. `network_calls` is zero
6. `browser_automation` is false
7. `read_only_confirmed` is true
8. payload contains no secret-like keys
9. payload contains no business-writeback-like keys
10. operation is manually invoked for a single controlled evidence row
11. no bulk loop, queue consumer, scheduler, cron, or daemon is introduced

## Required future tests

Before any future implementation can be accepted, it must include tests proving:

1. a valid PHASE-3 evidence row is accepted
2. invalid `phase_label` values are rejected
3. non-zero network calls are rejected
4. live execution is rejected
5. browser automation is rejected
6. secret-like keys are rejected
7. business-writeback-like keys are rejected
8. no commercial table names are written
9. no scheduler or automatic execution path is added
10. the local/mock path remains green

## Required local verification

Before the future PR is reviewed, run from `automation/worker-runtime`:

    python -m pytest tests/test_phase3_controlled_evidence_insert.py
    python -m pytest

The test output must be pasted into the future PR or evidence document.

## Required review checklist

Reviewer must confirm:

- changed files are limited to the approved implementation path and tests
- no UI/API/scheduler/external-source path was added
- no commercial writeback path was added
- no secret value or runtime credential was committed
- only `automation_driver_outputs` is in scope
- rollback is clear
- manual execution boundary is documented

## Rollback expectation

A future implementation PR must include a rollback section.

For documentation-only packets like this one, rollback is simply reverting the commit.

## Final decision

This packet authorizes planning for a guarded future database evidence insert step.

It does not authorize immediate database execution.
