# Phase-0 Boundary Fence

**Status:** Contract-only — review before implementation  
**Baseline tag:** `baseline/v2026.06.05`  
**Branch context:** `chore/phase0-dummy-worker-contract`  
**Audience:** Maintainers, reviewers, future worker implementers

## Purpose

This document is the **hard fence** for Phase-0 automation work. It defines what may exist in the repository during Phase-0 and what must be rejected in review. Phase-0 delivers **contracts and documentation only** — no runnable automation fleet, no production migrations, and no marketplace integrations.

Team review of this fence is required **before** any control-plane route, database table, or worker runtime is implemented.

## Architecture fence (unchanged)

| Layer | Role | Phase-0 rule |
|-------|------|----------------|
| **get-git-going / afrakala-platform** | Control Plane / Core | Only existing repo; no parallel core |
| **Supabase / PostgreSQL** | Source of truth for data | No new automation production migrations |
| **React / TanStack / Lovable** | UI only | No worker secrets, no bot logic in frontend |
| **Python Worker Runtime** | External execution | Documented only; not implemented in Phase-0 |

See ADR-0001 through ADR-0008 (baseline tag) for full ADR text.

## API namespace fence

| Namespace | Phase-0 |
|-----------|---------|
| `/api/automation/*` | **Allowed** — contract specification only (`openapi/automation-v1.yaml`) |
| `/api/public/bot/*` | **Untouched** — out of scope for this phase |
| `/api/public/hooks/*` | **Untouched** — existing server-side workers (e.g. pricing) remain separate |
| Any new namespace outside `/api/automation/*` | **Rejected** |

## Module fence (do not touch)

The following domains are **explicitly out of scope** for Phase-0 automation work:

- Pricing, accounting, invoices
- Customers, persons, credit
- `/api/public/bot/*`
- Divar, Torob, WhatsApp, Instagram
- OCR, STT, AI agent pipelines
- Laravel, FastAPI control-plane, parallel databases

## Technology fence

| Item | Phase-0 |
|------|---------|
| Real bots or browser automation | ❌ Forbidden |
| Production worker executables with integrations | ❌ Forbidden |
| `supabase/migrations/*automation*` (production tables) | ❌ Forbidden |
| Laravel or second backend core | ❌ Forbidden |
| FastAPI as control-plane | ❌ Forbidden |
| OpenAPI + JSON Schema contracts | ✅ Allowed |
| Dummy worker **documentation** | ✅ Allowed |
| Contract-level E2E smoke **plan** (no live fleet) | ✅ Allowed |

## Allowed file paths (Phase-0 task scope)

Changes for Phase-0 dummy worker contract work are limited to:

```
docs/automation/*
docs/contracts/*
openapi/automation-v1.yaml
```

Frozen baseline artifacts (from `baseline/v2026.06.05`) remain authoritative for schema locations:

```
automation/openapi/automation-v1.yaml   # baseline mirror (ADR-0007)
automation/schemas/*.json
automation/worker-dummy/README.md
docs/adr/ADR-0001..0008
docs/baseline/*
docs/ops/RUNBOOK_PHASE0.md
```

Do not relocate or duplicate schemas without an ADR amendment.

## Contract artifacts (this phase)

| Document | Purpose |
|----------|---------|
| [DUMMY_WORKER_CONTRACT.md](./DUMMY_WORKER_CONTRACT.md) | End-to-end dummy worker behavior contract |
| [WORKER_HEARTBEAT_CONTRACT.md](./WORKER_HEARTBEAT_CONTRACT.md) | Heartbeat payload and control-plane ack |
| [JOB_CLAIM_CONTRACT.md](./JOB_CLAIM_CONTRACT.md) | Job claim, lease, and queue semantics |
| [CHECKPOINT_CONTRACT.md](./CHECKPOINT_CONTRACT.md) | Progress checkpoint reporting |
| [E2E_SMOKE_PLAN_PHASE0.md](./E2E_SMOKE_PLAN_PHASE0.md) | Reviewer smoke plan (contract-level) |
| [openapi/automation-v1.yaml](../../openapi/automation-v1.yaml) | HTTP contract under `/api/automation/v1` |

## Reviewer rejection checklist

Reject the PR if any of the following appear:

- [ ] `.py`, `.go`, or worker entrypoints with network calls to marketplaces
- [ ] New routes under `src/` for automation (Phase-0 is contract-only)
- [ ] Production migrations for automation job tables
- [ ] Changes to pricing, accounting, invoices, customers, persons, credit modules
- [ ] Changes under `/api/public/bot/*`
- [ ] `VITE_`-prefixed worker secrets
- [ ] Marketplace-specific job types or capability enums in contracts
- [ ] Claims that Phase-0 includes a runnable E2E bot fleet

## Phase transition gate

Implementation phases may begin only after:

1. Team review and sign-off on all `docs/automation/*` contracts
2. ADR reference in implementation PR (not Phase-0)
3. Approved migration design for job persistence (separate phase)
4. Server route implementation scoped to `/api/automation/v1/*` only

## Related

- [docs/contracts/README.md](../contracts/README.md) — contract index
- Baseline ADR-0005 (Phase Zero Scope)
- Baseline ADR-0006 (Worker Runtime Boundary)
- Baseline ADR-0007 (Automation Contracts)
