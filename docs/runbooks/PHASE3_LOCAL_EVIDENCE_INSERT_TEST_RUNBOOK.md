# PHASE3 Local Evidence Insert Test Runbook

## Purpose

This runbook defines the local verification path for the PHASE-3 controlled local evidence insert bridge.

It exists to keep the next step test-first and controlled before any real Supabase execution is considered.

## Scope

This runbook covers only the worker-runtime local/mock path introduced by TPC-3-005.

Relevant files:

- `automation/worker-runtime/src/phase3_controlled_evidence_insert.py`
- `automation/worker-runtime/tests/test_phase3_controlled_evidence_insert.py`
- `automation/worker-runtime/pyproject.toml`

## Guardrails

This runbook does not authorize:

- real Supabase writes
- service-role usage
- UI changes
- API routes
- scheduler, cron, or daemon behavior
- external source calls
- browser automation
- product, price, customer, supplier, sales, CRM, or commercial writeback
- secrets or runtime values

## Preconditions

From the repository root, confirm that the latest `main` is checked out locally before testing:

    git checkout main
    git pull origin main

Then enter the worker-runtime directory:

    cd automation/worker-runtime

Use a local Python environment. Mock mode is the default and should not require secrets.

## Required focused test

Run:

    python -m pytest tests/test_phase3_controlled_evidence_insert.py

Expected result:

- all tests in `test_phase3_controlled_evidence_insert.py` pass
- no Supabase URL is required
- no service role key is required
- no network access is required
- no browser automation is triggered

## Recommended wider test

Run:

    python -m pytest

Expected result:

- existing worker-runtime tests remain green
- PHASE-3 local evidence bridge does not regress earlier mock-only worker paths

## Required assertions

The focused test must prove:

1. a safe PHASE-3 row is accepted
2. `phase_label` remains `PHASE-3`
3. `target_table` remains `automation_driver_outputs`
4. `live_execution` is false
5. `network_calls` is zero
6. `browser_automation` is false
7. local/mock client records exactly one inserted row
8. network calls are rejected without recording
9. live execution is rejected
10. business-writeback-like keys are rejected
11. secret-like nested keys are rejected

## Failure handling

If the focused test fails:

1. do not proceed to real DB work
2. capture the full pytest output
3. fix the local/mock bridge first
4. re-run the focused test
5. re-run the wider worker-runtime test suite

## Evidence to attach to future PRs

Any future PR that claims PHASE-3 evidence insert readiness must include:

- focused test command
- focused test output
- wider test command
- wider test output or explicit reason it was not run
- confirmation that no secrets were required
- confirmation that no network/browser/external call was made

## Final decision

Passing this runbook only proves local/mock readiness.

It does not unlock production DB writes. A future real Supabase step must be approved in a separate packet and PR.
