# PHASE3 Guarded Evidence Insert Contract — 2026-06-15

## Status

This document records the TPC-3-007 contract step.

## Goal

Add a non-executing guarded insert plan for PHASE-3 evidence rows.

The contract validates that a future evidence insert remains limited to:

    automation_driver_outputs

and keeps execution disabled in this step.

## Changed files

- `automation/worker-runtime/src/phase3_guarded_db_evidence_contract.py`
- `automation/worker-runtime/tests/test_phase3_guarded_db_evidence_contract.py`
- `automation/worker-runtime/pyproject.toml`
- `docs/baseline/PHASE3_GUARDED_DB_EVIDENCE_CONTRACT_2026_06_15.md`

## Guardrails

This step does not add:

- database connection code
- database execution
- UI changes
- API routes
- scheduler, cron, or daemon behavior
- external calls
- browser automation
- product, price, customer, supplier, sales, CRM, or commercial writeback
- secrets or runtime values

## Required tests

From `automation/worker-runtime`:

    python -m pytest tests/test_phase3_guarded_db_evidence_contract.py
    python -m pytest

## Expected behavior

The contract must prove:

1. a safe PHASE-3 evidence row can produce a plan
2. the plan targets only `automation_driver_outputs`
3. manual invocation is required
4. single-row mode is required
5. execution remains disabled
6. invalid PHASE-3 rows are rejected
7. commercial table references are rejected

## Final decision

This contract prepares the shape of a future guarded evidence insert step.

It does not execute database writes.
