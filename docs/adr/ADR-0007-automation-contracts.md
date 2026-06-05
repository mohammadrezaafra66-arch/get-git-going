# ADR-0007: Automation Contracts

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Control plane and workers need a stable interface before any runtime is built.

## Decision

Automation integration uses **versioned contracts** in this repository:

| Artifact | Path | Purpose |
|----------|------|---------|
| OpenAPI | `automation/openapi/automation-v1.yaml` | HTTP API between control plane and workers |
| Job schema | `automation/schemas/job.schema.json` | Job payload structure |
| Heartbeat schema | `automation/schemas/heartbeat.schema.json` | Worker liveness and capacity reporting |

Rules:

1. Contracts are **specifications**, not implementations.
2. Breaking changes bump OpenAPI `info.version` and require a PR labeled `automation-contract`.
3. JSON Schemas use `$id` URIs under `https://afrakala.ir/schemas/automation/`.
4. Implementations (when added) must validate against these schemas before merge/deploy.

## Consequences

### Positive

- Workers and control plane can evolve independently within contract bounds
- Enables contract-first testing without bots

### Negative

- Maintenance overhead for schema compatibility
- Delay before runnable demos

## Compliance

- Empty or dummy contract files: **rejected** — schemas must be valid and minimal but complete
- Implementing Divar inside OpenAPI as a hard dependency: **rejected** — use generic job types
