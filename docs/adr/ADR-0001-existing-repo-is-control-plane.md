# ADR-0001: Existing Repository Is the Control Plane

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

AfraKala needs an automation platform without fragmenting architecture. A separate "automation core" repository would duplicate routing, auth, migrations, deploy, and RBAC patterns already present in the get-git-going / afrakala-platform repository.

## Decision

The **existing repository** (React + Vite + TanStack + Supabase integrations + `deploy/`) is the **Control Plane / Core**.

All automation governance, contracts, migrations, server hooks, and operator UI entry points extend this repository. No second "core" repository will be created for automation.

## Consequences

### Positive

- Single GitHub source of truth for code and schema
- Reuse of RBAC, RLS, audit, and self-host patterns
- Smaller operational surface

### Negative

- Control-plane repo must stay disciplined about scope (see ADR-0004, ADR-0005)
- Worker runtimes must remain external (see ADR-0006)

## Compliance

- New "automation core" repos: **rejected**
- Laravel or parallel app servers in-repo for automation: **rejected** (ADR-0004)
- Contract stubs under `automation/`: **allowed** (ADR-0007)
