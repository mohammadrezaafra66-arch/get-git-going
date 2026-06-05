# ADR-0003: Lovable / React / TanStack Are UI Only

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Lovable syncs with GitHub for rapid UI iteration. Automation must not treat the frontend bundle as an authoritative business layer.

## Decision

**Lovable, React, Vite, and TanStack Start** provide **operator UI only**.

Authorization, job orchestration, secret handling, and durable writes occur server-side (Supabase RLS/RBAC, server functions, hooks) — never through frontend-only checks alone.

## Consequences

### Positive

- Aligns with `AGENTS.md` rule: frontend-only authorization is unacceptable
- UI can evolve without forking business logic

### Negative

- Every sensitive automation action needs server + DB guards
- Lovable-generated code must be reviewed for leaked secrets (`VITE_` prefix forbidden for server secrets)

## Compliance

- Business rules enforced only in React: **rejected**
- UI for job status, worker health, operator actions: **allowed** when backed by server/RLS
- Embedding integration API keys in client bundles: **rejected**
