# PHASE3 Evidence Module Packaging — Evidence

## Status

This document records a small packaging follow-up after TPC-3-005.

## Reason

TPC-3-005 added `automation/worker-runtime/src/phase3_controlled_evidence_insert.py` as the local/mock-only PHASE-3 evidence bridge.

The worker-runtime project uses an explicit `py-modules` list in `automation/worker-runtime/pyproject.toml`. The new module must be listed there so a package build includes it.

## Changed files

- `automation/worker-runtime/pyproject.toml`
- `docs/baseline/PHASE3_EVIDENCE_MODULE_PACKAGING_2026_06_15.md`

## Guardrails

This change does not add or change:

- runtime behavior
- database migrations
- real Supabase connection code
- UI or API routes
- scheduler, cron, or daemon behavior
- external source calls
- browser automation
- product, price, customer, supplier, sales, CRM, or commercial writeback
- secrets or runtime values

## Test plan

From `automation/worker-runtime`:

    python -m pytest tests/test_phase3_controlled_evidence_insert.py
    python -m pytest

## Final decision

This is a packaging registration follow-up only. It does not unlock production DB writes.
