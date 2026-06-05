# openapi/ — Deprecated path (pointer only)

**Phase Label:** PHASE-0  
**Canonical contract:** [`automation/openapi/automation-v1.yaml`](../automation/openapi/automation-v1.yaml)  
**ADR:** [ADR-0007](../docs/adr/ADR-0007-automation-contracts.md)

## Do not implement against this folder

The file `openapi/automation-v1.yaml` in this directory is a **deprecated stub** kept so old links do not break.

The official Phase-0 OpenAPI specification lives next to automation JSON Schemas:

```
automation/openapi/automation-v1.yaml
automation/schemas/heartbeat.schema.json
automation/schemas/job.schema.json
```

## Why this pointer exists

A parallel draft (`commands` / `runs` vocabulary) was added at repo root during early Phase-0 planning. ADR-0007 already designated `automation/openapi/` as canonical. See:

[`docs/automation/OPENAPI_CANONICAL_RESOLUTION.md`](../docs/automation/OPENAPI_CANONICAL_RESOLUTION.md)

## Rules

- No new executable endpoints from this path
- No second contract implementations
- Update references in docs to point at `automation/openapi/automation-v1.yaml`
