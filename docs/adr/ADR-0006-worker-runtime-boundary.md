# ADR-0006: Worker Runtime Boundary

**Status:** Accepted  
**Date:** 2026-06-05  
**Deciders:** AfraKala platform maintainers

## Context

Automation jobs execute close to external systems (browsers, messaging APIs, OCR). That execution environment must not collapse into the control-plane web container.

## Decision

**Worker runtimes** live **outside** the control-plane repository's production deploy path, except for:

- Contract definitions (`automation/openapi/`, `automation/schemas/`)
- Documentation placeholders (`automation/worker-dummy/`)
- Control-plane APIs that accept heartbeats and dispatch jobs (future, via migrations + server routes)

Workers:

- Authenticate with server-issued tokens (never `VITE_` secrets)
- Speak `automation-v1` OpenAPI contracts
- Do not write authoritative state except through control plane / Supabase

The existing **pricing recompute worker** pattern (cron → server hook → queue in PostgreSQL) remains a valid in-repo server-side worker; it is not an external marketplace bot.

## Consequences

### Positive

- Isolates flaky browser/automation dependencies from the web image
- Clear security boundary for third-party credentials

### Negative

- Separate deploy and monitoring for worker fleets
- Contract versioning discipline required (ADR-0007)

## Compliance

- Puppeteer/Playwright bot in `src/` calling Divar: **rejected in Phase 0**
- `automation/worker-dummy/README.md` explaining future layout: **allowed**
- Worker repo implementing heartbeat + job pull: **future phase**, not Phase 0
