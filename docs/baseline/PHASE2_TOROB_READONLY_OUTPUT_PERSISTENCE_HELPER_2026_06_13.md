# Phase 2 Torob Read-Only Output Persistence Helper — 2026-06-13

**Status:** IMPLEMENTATION PR OPEN — local verification pending  
**Track:** Phase 2 / Torob limited read-only  
**Scope:** Row builder and validator only; no database insert, no live request.

## Purpose

Add a safe persistence-row builder for accepted Torob read-only evidence outputs.

This helper prepares rows for the `automation_driver_outputs` evidence path but does not insert anything into the database.

## Important database note

The current `automation_driver_outputs` table allows `source_kind = external_read_only`, but the current `phase_label` constraint does not yet allow `PHASE-2`.

Therefore, the helper marks:

```text
table_migration_required = true
```

A later migration PR is required before these rows can be inserted into the live table.

## Allowed row shape

The helper builds rows with:

```text
driver_name = torob_limited_readonly
job_type = TOROB_LIMITED_READONLY
source_kind = external_read_only
phase_label = PHASE-2
persistence_gate = TPC-2-005
```

## Guardrails

The helper rejects secret-like and writeback-like fields, including keys containing:

```text
credential
cookie
session
authorization
token
secret
full_html
response_body
customer
supplier_mutation
writeback
internal_product_id
browser_fingerprint
bypass
```

## Verification command

```powershell
cd automation/worker-runtime
python -m pytest -q tests/test_torob_readonly_output_persistence.py
```

## Scope confirmation

This change does not perform:

- live Torob request,
- database insert,
- migration,
- UI/API change,
- scheduler or bulk crawl,
- product/price/customer/supplier writeback.
