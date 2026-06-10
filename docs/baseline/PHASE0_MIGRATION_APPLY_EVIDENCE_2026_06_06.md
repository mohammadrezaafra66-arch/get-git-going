# Phase 0 Migration Apply Evidence — 2026-06-06

**Phase Label:** PHASE-0  
**Criterion:** C1 — Automation tables migration applied (staging/self-host)  
**Gate:** [`PHASE0_ACCEPTANCE_GATE.md`](../automation/PHASE0_ACCEPTANCE_GATE.md)  
**Migration:** `supabase/migrations/20260605120000_phase0_automation_tables.sql`  
**Verification timestamp:** 2026-06-06 (operator-verified, LAN pilot)

---

## Environment

| Field | Value |
|-------|-------|
| Environment | LAN pilot |
| DB container | `afrakala-lan-db` |
| Migration applied | `supabase/migrations/20260605120000_phase0_automation_tables.sql` |

---

## Database verification

### automation_* table count

| Check | Result |
|-------|--------|
| `automation_*` table count | **8** |

### automation_* tables (8)

1. `automation_artifacts`
2. `automation_checkpoints`
3. `automation_job_runs`
4. `automation_jobs`
5. `automation_log_events`
6. `automation_modules`
7. `automation_worker_heartbeats`
8. `automation_workers`

### RLS summary

| Check | Result |
|-------|--------|
| RLS enabled on all 8 `automation_*` tables | **PASS** — `rowsecurity = true` for every `automation_*` table |

### Seed confirmation

| Check | Result |
|-------|--------|
| `automation_modules` contains only `dummy_worker` | **PASS** — sole seeded module row is `dummy_worker`; no other modules enabled |

### Real-bot domain tables

| Check | Result |
|-------|--------|
| Corrected real-bot table query | **0 rows** — no real-bot domain tables present in the database |

---

## Build / lint (repo toolchain)

| Step | Command | Result | Notes |
|------|---------|--------|-------|
| Build | `npm run build` | **PASS** | Operator-verified after migration apply |
| Lint | `npm run lint` | **FAIL** | Known baseline prettier/lint debt; unchanged and not caused by C1 |

---

## Security note

**No secrets recorded in this document.** Connection strings, credentials, service-role keys, `.env` contents, and Docker secrets were not written here.

---

## Gate impact

- **C1:** Satisfied by this apply evidence (LAN pilot / self-host path).
- **Phase 0 Status:** Remains **OPEN** — other acceptance criteria and sign-off still pending.
- **Phase 1:** Remains **BLOCKED** until full Phase 0 acceptance.
