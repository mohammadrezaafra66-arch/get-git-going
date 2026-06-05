# Release Notes — Baseline Freeze 2026-06-05

## AfraKala Automation Platform — Phase 0 Baseline

This release is a **documentation and contract freeze**, not an application feature release.

## What shipped

### Governance

- GitHub `CODEOWNERS` for baseline, ADR, automation, migration, and deploy paths
- Pull request template with baseline alignment and self-host checks

### Baseline package

- Baseline manifest, pointer, phase label policy
- Eight Architecture Decision Records (ADR-0001 through ADR-0008)
- Phase 0 runbook, incident template, postmortem template

### Automation contracts (spec only)

- OpenAPI `automation-v1.yaml` — control-plane ↔ worker handshake
- JSON Schemas: `job.schema.json`, `heartbeat.schema.json`
- `worker-dummy/README.md` — explicit non-implementation placeholder

## What did NOT ship

- No real automation bots
- No Laravel application
- No parallel backend or database
- No Divar, Torob, WhatsApp, Instagram, OCR, STT, or AI integrations
- No production worker executables in this repository

## Architecture reaffirmed

| Component | Role |
|-----------|------|
| This repository | Control plane / core |
| Supabase / PostgreSQL | Source of truth for data |
| Lovable / React / TanStack | UI only |
| GitHub | Source of truth for code and contracts |
| Google Drive | Mirror only |

## Upgrade / deploy impact

- **Database migrations:** none
- **RLS / RBAC:** none
- **Application deploy:** none required for this freeze
- **Docker images:** unchanged

## Verification performed

- All listed baseline paths created
- No runtime worker code added
- No new `supabase/migrations/` files

## Recommended operator actions

```bash
git tag -a baseline-2026-06-05 -m "Phase 0 automation baseline freeze"
git push origin baseline-2026-06-05
```

Optional: mirror `docs/baseline/`, `docs/adr/`, and `docs/ops/` to Google Drive under `automation-baseline/2026-06-05/`.

## Next steps (out of scope for this freeze)

- Implement worker runtime in a separate repository per ADR-0006
- Add automation job tables via timestamped migrations when Phase 1+ approves
- Wire UI surfaces in Lovable/React only after backend contracts are stable
