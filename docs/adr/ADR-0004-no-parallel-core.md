# ADR-0004: No Parallel Core

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Automation projects often introduce duplicate stacks (Laravel API, Nest microservice, second admin panel). AfraKala Phase 1 architecture is already implemented and stabilizing.

## Decision

The project **will not** create:

- A parallel backend application (including Laravel, Django, or standalone Express core)
- A parallel database or ORM schema outside Supabase migrations
- Duplicate modules, routes, tables, services, or person systems (per `AGENTS.md`)

Automation extends the existing control plane.

## Consequences

### Positive

- Avoids split-brain configuration and identity models
- Preserves self-host simplicity

### Negative

- Integration code must fit existing patterns (hooks, edge functions, external workers)
- Cannot "greenfield" automation in isolation

## Compliance

- New Laravel app for bots: **rejected**
- Second PostgreSQL for automation jobs: **rejected**
- External worker process consuming OpenAPI contracts: **allowed** (ADR-0006)
