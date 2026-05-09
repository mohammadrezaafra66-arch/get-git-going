## Phase SH-DOC.1 — Create 11 Self-Host Governance Documents

**Scope:** Documentation only. No code, no Docker/compose, no migrations, no secrets, no .env, no deploy.

**Location:** `docs/self-host-governance/`

### Files to create (11 total, numbered 00..10)

| # | File | Purpose |
|---|------|---------|
| 00 | `00_INDEX.md` | Map of the pack: each doc, owner, when to read, reading order |
| 01 | `01_PROJECT_CHARTER.md` | Why self-host, success definition, in/out of scope, stakeholders |
| 02 | `02_ARCHITECTURE_OVERVIEW.md` | Stacks (app, supabase, proxy), data flow, network, ports — references existing `deploy/*` |
| 03 | `03_REQUIREMENTS_REQ_SH.md` | REQ-SH-001..015 (functional + non-functional acceptance reqs derived from `AFRAKALA_ACCEPTANCE_CRITERIA.md`) |
| 04 | `04_REPO_STANDARDS.md` | Branch naming, commit format, PR rules, file naming, what may/may not be committed |
| 05 | `05_MASTER_EXECUTION_PLAN.md` | Roadmap of phases SH-DOC.1 → SH-RA.9 with status table |
| 06 | `06_PHASE_PROTOCOL.md` | Standard phase prompt template + Phase Completion Report format |
| 07 | `07_MIGRATION_SAFETY.md` | Pointer + summary of `docs/MIGRATION_SAFETY_POLICY.md` |
| 08 | `08_OPS_RUNBOOK.md` | Pointer + summary of `docs/OPERATIONS_QUICK_REFERENCE.md` and update/rollback runbook |
| 09 | `09_INTERNET_RESILIENCE.md` | Pointer + summary of `docs/INTERNET_RESILIENCE.md` (national vs international internet) |
| 10 | `10_ENVIRONMENT_MATRIX.md` | Empty matrix template (Lovable preview / Local laptop / Staging VPS / Production VPS) — values filled in SH-RA.2C |

### Rules applied to every doc

- Persian (RTL), short, executable
- No secrets, no real env values, no API keys
- Cross-link to existing `docs/*.md` files instead of duplicating
- Each doc starts with: Purpose / Audience / Last updated / Related docs

### Forbidden in this phase

- No edits outside `docs/self-host-governance/`
- No new `.env` files
- No code, Docker/compose, migration, or deploy changes
- No secret creation
- Do not start SH-RA.2A

### Refinement carried forward to SH-RA.2A (recorded in `05_MASTER_EXECUTION_PLAN.md`)

SH-RA.2A must inspect both, if present:
- `docker-compose.yml` (root)
- `docker-compose.legacy.yml.bak` (root)

…before deciding `DELETE_BAK` / `KEEP_BAK` / `ARCHIVE_ROOT_COMPOSE`.

### Phase Completion Report (to be emitted after creation)

1. Files created: list of 11 paths
2. No code changed ✅
3. No OCR changed ✅
4. No Docker/compose changed ✅
5. No migration ran ✅
6. No Auth/Storage/Data changed ✅
7. No secret/env/cert created ✅
8. No deployment ✅
9. SH-DOC.1 ready for review ✅
10. SH-RA.2A is BLOCKED pending user approval

Final line: **"SH-DOC.1 completed. 11 governance docs ready for review. Awaiting approval before SH-RA.2A."**
