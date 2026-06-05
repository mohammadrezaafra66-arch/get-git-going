# ADR-0008: Google Drive Is Mirror Only

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Stakeholders may want baseline PDFs or Persian copies on Google Drive. Drive must not become a second source of truth.

## Decision

**Google Drive** is a **read-only mirror** of selected GitHub documentation exports.

- **Authoritative:** GitHub repository (code, ADRs, contracts, migrations)
- **Mirror:** Drive copies for convenience, sharing, or offline reading
- **Forbidden:** Editing baseline on Drive and back-porting without a GitHub PR
- **Forbidden:** Storing secrets, `.env`, service role keys, or database dumps on Drive

Sync direction: **GitHub → Drive** only.

## Consequences

### Positive

- Prevents configuration drift
- Keeps audit trail in Git

### Negative

- Drive users must check GitHub or release tags for latest baseline

## Compliance

- "Fix ADR on Drive only": **rejected**
- Automated or manual export of `docs/baseline/`, `docs/adr/`, `docs/ops/`: **allowed**
- Worker job state on Drive: **rejected** — use Supabase (ADR-0002)
