# Baseline Pointer

**Current official baseline:** `baseline-2026-06-05`

| Field | Value |
|-------|-------|
| Git tag (recommended) | `baseline-2026-06-05` |
| Freeze date | 2026-06-05 |
| Manifest | [BASELINE_MANIFEST.md](./BASELINE_MANIFEST.md) |
| Release notes | [RELEASE_NOTES_2026-06-05.md](./RELEASE_NOTES_2026-06-05.md) |
| Phase label policy | [PHASE_LABEL_POLICY.md](./PHASE_LABEL_POLICY.md) |
| Phase 0 runbook | [../ops/RUNBOOK_PHASE0.md](../ops/RUNBOOK_PHASE0.md) |

## Quick navigation

### ADRs

1. [ADR-0001 — Existing repo is control plane](../adr/ADR-0001-existing-repo-is-control-plane.md)
2. [ADR-0002 — Supabase is source of truth](../adr/ADR-0002-supabase-is-source-of-truth.md)
3. [ADR-0003 — Lovable UI only](../adr/ADR-0003-lovable-ui-only.md)
4. [ADR-0004 — No parallel core](../adr/ADR-0004-no-parallel-core.md)
5. [ADR-0005 — Phase zero scope](../adr/ADR-0005-phase-zero-scope.md)
6. [ADR-0006 — Worker runtime boundary](../adr/ADR-0006-worker-runtime-boundary.md)
7. [ADR-0007 — Automation contracts](../adr/ADR-0007-automation-contracts.md)
8. [ADR-0008 — Drive is mirror](../adr/ADR-0008-drive-is-mirror.md)

### Automation contracts

- OpenAPI: [`automation/openapi/automation-v1.yaml`](../../automation/openapi/automation-v1.yaml)
- Schemas: [`automation/schemas/`](../../automation/schemas/)
- Worker placeholder: [`automation/worker-dummy/README.md`](../../automation/worker-dummy/README.md)

## Operator commands (after merge)

```bash
git tag -a baseline-2026-06-05 -m "AfraKala Automation Platform — Phase 0 baseline freeze"
git push origin baseline-2026-06-05
```

## Superseding this baseline

When a new baseline is approved:

1. Add `docs/baseline/RELEASE_NOTES_<date>.md`
2. Update this pointer file
3. Tag the new baseline
4. Add or amend ADRs — do not silently contradict frozen decisions
