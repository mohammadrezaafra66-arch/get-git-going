# Runbook — Phase 0 (Baseline Freeze)

**Baseline:** `baseline-2026-06-05`  
**Audience:** Maintainers, operators  
**Scope:** Governance and contracts only — no worker fleet

## Prerequisites

- Access to GitHub repository (maintainer)
- Familiarity with `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` and `AGENTS.md`
- Self-host stacks documented in `docs/SELF_HOST_UPDATE_RUNBOOK.md` (unchanged by Phase 0)

## Phase 0 objectives

1. Land baseline docs, ADRs, and automation contracts
2. Tag `baseline-2026-06-05`
3. Optionally mirror docs to Google Drive (read-only copy)
4. **Do not** deploy new services or migrations for automation

## Procedure: apply baseline freeze

### 1. Verify repository contents

Confirm these paths exist:

```
.github/CODEOWNERS
.github/pull_request_template.md
docs/baseline/*
docs/adr/ADR-0001..0008
docs/ops/*
automation/openapi/automation-v1.yaml
automation/schemas/*.json
automation/worker-dummy/README.md
```

### 2. Review ADR alignment

Read `docs/baseline/BASELINE_MANIFEST.md` and ADR-0001 through ADR-0008. Reject any PR that adds real bots, Laravel, or parallel databases.

### 3. Merge and tag

After merge to `main`:

```bash
git fetch origin
git checkout main
git pull origin main
git tag -a baseline-2026-06-05 -m "AfraKala Automation Platform — Phase 0 baseline freeze"
git push origin baseline-2026-06-05
```

### 4. Optional Drive mirror

Export (do not edit on Drive):

- `docs/baseline/`
- `docs/adr/`
- `docs/ops/RUNBOOK_PHASE0.md`

Target folder: `AfraKala/automation-baseline/2026-06-05/`

### 5. Communicate

- Point team to `docs/baseline/BASELINE_POINTER.md`
- Enforce `phase-0` label policy on new automation issues

## What NOT to do in Phase 0

| Action | Status |
|--------|--------|
| Deploy worker containers | ❌ |
| Run Divar/Torob/WhatsApp bots | ❌ |
| Add `supabase/migrations/*automation*` | ❌ |
| Create Laravel app | ❌ |
| Store secrets on Drive | ❌ |

## Rollback

Phase 0 is docs-only. Rollback = revert the merge commit or delete the tag:

```bash
git tag -d baseline-2026-06-05
git push origin :refs/tags/baseline-2026-06-05
```

No database rollback required.

## Escalation

Use `docs/ops/INCIDENT_TEMPLATE.md` for production issues. Phase 0 doc errors are handled via normal PR fix — not SEV incidents unless they caused a wrongful deploy (unlikely).

## Related

- [BASELINE_POINTER.md](../baseline/BASELINE_POINTER.md)
- [PHASE_LABEL_POLICY.md](../baseline/PHASE_LABEL_POLICY.md)
- [PRICING_RECOMPUTE_WORKER.md](../PRICING_RECOMPUTE_WORKER.md) (existing server-side worker — separate concern)
