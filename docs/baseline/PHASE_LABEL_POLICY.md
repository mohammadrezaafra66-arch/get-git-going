# Phase Label Policy

**Effective:** 2026-06-05  
**Applies to:** AfraKala Automation Platform and the control-plane repository

## Labels

| Label | Meaning | Allowed work |
|-------|---------|--------------|
| `phase-0` | Baseline freeze | Contracts, ADRs, docs, governance — **no real bots** |
| `phase-1` | Core stabilization | Extend existing architecture (per `AGENTS.md`) |
| `phase-2` | Unified persons core | Customers, suppliers, parties — single persons model |
| `automation-contract` | Schema/OpenAPI change | Contract-only; no worker runtime in core repo |
| `worker-runtime` | External worker repo | Implements contracts; not in control plane |
| `ui-only` | Lovable/React/TanStack | Presentation and operator UX only |
| `mirror-only` | Google Drive | Copy/export; never write authority |

## Rules

1. **Every PR** should declare its highest phase label in the title or description.
2. **`phase-0` PRs must not** add Laravel, parallel backends, parallel databases, or integration bots.
3. **`automation-contract` changes** require ADR-0007 review and version bump in OpenAPI `info.version` when breaking.
4. **`worker-runtime` work** happens outside this repository unless explicitly approved via ADR amendment.
5. **Do not reuse deprecated labels** from old README text (e.g. "فاز ۱ — اسکلت معماری") without mapping to this policy.

## GitHub usage

- Use labels on issues and PRs when available.
- Milestones may group `phase-0` deliverables under **Automation Baseline 2026-06-05**.
- Release tags use `baseline-YYYY-MM-DD`, not `v1.0.0`, for freeze points.

## Drive mirror naming (optional)

When mirroring baseline docs to Google Drive, prefix folders:

```
AfraKala/automation-baseline/2026-06-05/
```

Drive copies are **read-only mirrors** of GitHub; corrections flow GitHub → Drive only.
