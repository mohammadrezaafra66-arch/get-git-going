# PHASE3 Controlled Local Evidence Insert — Evidence

## Status

This document records the TPC-3-005 implementation boundary for the controlled local evidence insert bridge.

## Goal

Add a narrow worker-runtime path that can validate and append a PHASE-3 evidence row to the local/mock Supabase client for deterministic tests.

## Changed files

- `automation/worker-runtime/src/phase3_controlled_evidence_insert.py`
- `automation/worker-runtime/tests/test_phase3_controlled_evidence_insert.py`
- `docs/baseline/PHASE3_CONTROLLED_LOCAL_EVIDENCE_INSERT_2026_06_15.md`

## Guardrails

This step is intentionally limited to local/mock execution.

It does not add:

- real Supabase connection code
- UI changes
- API routes
- scheduler, cron, or daemon behavior
- external source calls
- browser automation
- product, price, customer, supplier, sales, CRM, or commercial writeback
- secrets or runtime values

## Expected behavior

The implementation should:

1. Build a PHASE-3 row for `automation_driver_outputs`.
2. Require `live_execution=false`.
3. Require `network_calls=0`.
4. Require `browser_automation=false`.
5. Require `read_only_confirmed=true`.
6. Require `local_insert_only=true`.
7. Reject secret-like keys.
8. Reject business-writeback-like keys.
9. Append only to the mock client's `phase3_local_evidence_inserts` list.

## Test command

Run from `automation/worker-runtime`:

    python -m pytest tests/test_phase3_controlled_evidence_insert.py

A wider safety run is recommended:

    python -m pytest

## Final decision

TPC-3-005 does not unlock real DB insert from production/runtime code.

It only introduces a controlled local/mock bridge path and tests. Real Supabase execution remains blocked until an explicit future packet and review approve it.
