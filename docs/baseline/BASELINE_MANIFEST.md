# Baseline Manifest — AfraKala Automation Platform

**Freeze date:** 2026-06-05  
**Label:** `baseline-2026-06-05`  
**Repository role:** Control Plane / Core (get-git-going / afrakala-platform)

## Purpose

This manifest records the official Phase 0 baseline for the AfraKala Automation Platform. It defines what exists, what is frozen, and what is explicitly out of scope for this freeze.

## Source of truth hierarchy

| Layer | Role | Authority |
|-------|------|-----------|
| GitHub (this repo) | Control plane, contracts, migrations, deploy, UI | **Source of truth** for code and schema definitions |
| Supabase / PostgreSQL | Persistent application state | **Source of truth** for runtime data |
| Lovable / React / TanStack | Operator UI | **UI only** — no parallel business core |
| Google Drive | Document mirror | **Mirror only** — never authoritative |
| Worker runtimes (future) | Job execution at the edge | **Consumers** of contracts defined here |

## Frozen artifacts (this baseline)

### Governance

- `.github/CODEOWNERS`
- `.github/pull_request_template.md`

### Baseline docs

- `docs/baseline/BASELINE_MANIFEST.md` (this file)
- `docs/baseline/BASELINE_POINTER.md`
- `docs/baseline/PHASE_LABEL_POLICY.md`
- `docs/baseline/RELEASE_NOTES_2026-06-05.md`

### Architecture Decision Records (ADR)

- `docs/adr/ADR-0001-existing-repo-is-control-plane.md`
- `docs/adr/ADR-0002-supabase-is-source-of-truth.md`
- `docs/adr/ADR-0003-lovable-ui-only.md`
- `docs/adr/ADR-0004-no-parallel-core.md`
- `docs/adr/ADR-0005-phase-zero-scope.md`
- `docs/adr/ADR-0006-worker-runtime-boundary.md`
- `docs/adr/ADR-0007-automation-contracts.md`
- `docs/adr/ADR-0008-drive-is-mirror.md`

### Operations

- `docs/ops/RUNBOOK_PHASE0.md`
- `docs/ops/INCIDENT_TEMPLATE.md`
- `docs/ops/POSTMORTEM_TEMPLATE.md`

### Automation contracts (no runtime)

- `automation/openapi/automation-v1.yaml`
- `automation/schemas/heartbeat.schema.json`
- `automation/schemas/job.schema.json`
- `automation/worker-dummy/README.md` (placeholder documentation only)

## Explicitly NOT in this baseline

The following are **forbidden** in Phase 0 and were **not** created:

- Real automation bots (Divar, Torob, WhatsApp, Instagram, OCR, STT, AI agents)
- Laravel or any parallel backend application
- Parallel database or duplicate schema outside Supabase migrations
- Worker executables with production integrations
- Google Drive as write authority

## Existing core (pre-baseline, unchanged)

This freeze **documents** the existing architecture; it does not replace it:

- React + Vite + TypeScript + TanStack Start UI
- Supabase self-host stack (`deploy/supabase/`)
- Application deploy (`deploy/app/`, `deploy/proxy/`)
- Timestamped migrations (`supabase/migrations/`)
- RBAC, RLS, audit patterns per `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

## Verification checklist

- [ ] All frozen paths exist in the repository
- [ ] No new runtime worker code beyond contract stubs
- [ ] No new database tables for automation in this freeze
- [ ] ADRs reviewed and linked from PR template
- [ ] Git tag `baseline-2026-06-05` applied after merge (operator action)

## Change policy after freeze

Changes to frozen contracts or ADRs require:

1. A PR referencing the affected ADR(s)
2. Review per `CODEOWNERS`
3. Updated `RELEASE_NOTES_YYYY-MM-DD.md` or additive ADR if the decision changes
