# ADR-0002: Supabase / PostgreSQL Is the Source of Truth

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Automation workers may hold ephemeral state locally, but durable business and job state must not split across ad-hoc databases, files, or Drive folders.

## Decision

**Supabase / PostgreSQL** (via timestamped migrations in `supabase/migrations/`) is the **sole source of truth** for persistent application and automation state.

Workers read and write through control-plane APIs or approved Supabase interfaces — never through a parallel database.

## Consequences

### Positive

- Consistent RLS, RBAC, and audit trails
- Backup/restore via existing self-host procedures
- Single migration pipeline

### Negative

- Automation schema changes require formal migrations and review
- Workers cannot "own" a private database for shared state

## Compliance

- Parallel PostgreSQL/MySQL/SQLite schemas for shared state: **rejected**
- Phase 0 automation tables: **none** (contracts only)
- Future job/heartbeat tables: require migrations + RLS per `AGENTS.md`
