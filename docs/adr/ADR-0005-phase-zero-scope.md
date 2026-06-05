# ADR-0005: Phase Zero Scope

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Teams may rush to implement marketplace bots before contracts and governance exist. Phase 0 establishes boundaries.

## Decision

**Phase 0** includes only:

- Baseline manifest and pointer documentation
- ADRs (0001–0008)
- Ops templates and Phase 0 runbook
- Automation **contracts** (OpenAPI + JSON Schema)
- `worker-dummy` documentation placeholder

**Phase 0 explicitly excludes:**

- Real bots or production worker runtimes
- Divar, Torob, WhatsApp, Instagram integrations
- OCR, STT, or AI agent pipelines
- New automation database tables (until a later phase approves migrations)
- Laravel or parallel cores (ADR-0004)

## Consequences

### Positive

- Clear freeze point: `baseline-2026-06-05`
- Reviewers can reject scope creep via PR template checkboxes

### Negative

- No end-to-end automation demo in Phase 0
- Operators must tag and track follow-on phases

## Compliance

PRs labeled `phase-0` must match this scope. Violations require ADR amendment and a new baseline tag.
