# Phase 0 E1 / E3 Acceptance Evidence & Blocker — 2026-06-07

**Phase Label:** PHASE-0  
**Gate:** [`PHASE0_ACCEPTANCE_GATE.md`](../automation/PHASE0_ACCEPTANCE_GATE.md) § E  
**Review date:** 2026-06-07  
**Base commit:** `main` after PR #20 merge

---

## Summary

| Criterion | Result | Notes |
|-----------|--------|-------|
| **E1** — UI command → DB job created | **BLOCKED** | No merged UI or control-plane enqueue route exists |
| **E2** — Worker claims and completes dummy job | **SATISFIED** | Already checked — [WPC-0-001 § E2E evidence](../automation/task-packets/WPC-0-001-worker-dummy.md) |
| **E3** — UI or admin query shows completed status | **SATISFIED (admin query)** | No UI; operator query paths documented below |

**Phase 0 Status:** Remains **OPEN** (E1 unchecked; sign-off pending).  
**Phase 1 Status:** Remains **BLOCKED**.

**No secrets recorded in this document.**

---

## Investigation (2026-06-07)

### Files reviewed

| Area | Finding |
|------|---------|
| `src/**` | **No** routes, components, or Supabase calls referencing `automation_*` tables |
| `automation/worker-dummy/e2e-lib.mjs` | Job enqueue via **service-role** `insert` into `automation_jobs` — not UI |
| `automation/worker-dummy/run-e2e.mjs` | CLI smoke runner; outputs JSON evidence including `run_status: COMPLETED` |
| `supabase/migrations/20260605120000_phase0_automation_tables.sql` | RLS SELECT for `admin`/`manager`; no INSERT policies for authenticated clients |
| `docs/automation/PHASE0_AUTOMATION_TABLES.md` | Control-plane API routes and enqueue RPCs explicitly **out of scope** |
| `automation/openapi/automation-v1.yaml` | Contract only — no in-repo route implementation |

### G-08 / gate alignment

G-08 defines full Phase 0 E2E as:

`UI command → DB command → Dummy Worker claim → event → UI status`

Current merged implementation covers the **middle** (DB → worker → DB) via PR #19. **UI bookends (E1, UI path for E3) are not implemented.**

---

## E1 — BLOCKER: UI command → DB job created

### Gap

There is **no merged path** where an operator action in the React/TanStack UI creates a row in `automation_jobs`.

Job creation today occurs only in `automation/worker-dummy/e2e-lib.mjs` → `enqueueDummyJob()` using `SUPABASE_SERVICE_ROLE_KEY`. That satisfies **G-08 / WPC-0-001 worker smoke** and **E2**, but **not E1**.

### Missing pieces

1. **UI surface** — admin/manager page or control action (e.g. “Enqueue dummy job”).
2. **Server-side write path** — route or RPC that enqueues `DUMMY_RUN` with idempotency key; must **not** expose service role to the browser (G-07 / `SECURITY_BASELINE.md`).
3. **RBAC** — UI guard + route/server guard limiting enqueue to `admin`/`manager`.

### Minimum Phase 0-only proposal (not implemented)

| Item | Scope |
|------|-------|
| Route | e.g. `/admin/automation` (RTL, Persian, mobile-first) |
| UI | Single button: enqueue `DUMMY_RUN` for `dummy_worker` with generated idempotency key |
| Server | TanStack server function or edge route using service role **server-side only** |
| Out of scope | Real bots, external APIs, new migrations (reuse existing tables), Phase 1 packets |

Suggested task packet label: **WPC-0-004** — Phase 0 automation status UI (enqueue + read-only status).

### E1 gate status

**Remain unchecked** until a UI enqueue path is demonstrated and recorded.

---

## E3 — Admin query shows completed status

### Available paths (no UI)

| Path | Role | Status |
|------|------|--------|
| **A. E2E JSON report** | Operator CLI | **Recorded** — WPC-0-001 LAN/local run 2026-06-05 |
| **B. Admin/manager SQL** | Supabase Studio / `psql` as `admin`/`manager` | **Documented** — RLS SELECT permitted |
| **C. React UI status page** | — | **Not implemented** |

### Path A — Safe output (from WPC-0-001 E2E evidence)

Operator ran `node automation/worker-dummy/run-e2e.mjs` on LAN/local after PR #19. Relevant fields (no secrets):

| Field | Value |
|-------|--------|
| ok | true |
| job_status | CLAIMED |
| run_status | **COMPLETED** |
| event_types | RUN_STARTED, CHECKPOINT_SAVED, RUN_COMPLETED |
| checkpoint_count | 1 |
| real_bot_scope | false |

This demonstrates completed run status is persisted and readable from the database after worker execution.

### Path B — Admin read-only SQL (safe templates)

Run as authenticated **admin** or **manager** (RLS permits SELECT). Replace `<idempotency_key>` with a known test key (e.g. from a fresh E2E run).

**Job + run status:**

```sql
SELECT
  j.id AS job_id,
  j.status AS job_status,
  j.job_type,
  j.idempotency_key,
  r.id AS run_id,
  r.status AS run_status,
  r.started_at,
  r.completed_at
FROM public.automation_jobs j
LEFT JOIN public.automation_job_runs r ON r.job_id = j.id
WHERE j.idempotency_key = '<idempotency_key>'
ORDER BY r.started_at DESC NULLS LAST
LIMIT 5;
```

**Expected shape after successful E2E:**

| job_status | run_status |
|------------|------------|
| CLAIMED | COMPLETED |

**Recent completed runs (operator overview):**

```sql
SELECT
  r.id AS run_id,
  r.status,
  r.completed_at,
  j.job_type,
  j.idempotency_key
FROM public.automation_job_runs r
JOIN public.automation_jobs j ON j.id = r.job_id
WHERE r.status = 'COMPLETED'
ORDER BY r.completed_at DESC
LIMIT 20;
```

**Events for a run:**

```sql
SELECT event_type, message, occurred_at
FROM public.automation_log_events
WHERE run_id = '<run_id>'
ORDER BY occurred_at ASC;
```

Expected event types: `RUN_STARTED`, `CHECKPOINT_SAVED`, `RUN_COMPLETED`.

### E3 gate status

**Checked via admin query path** — Path A output recorded in WPC-0-001; Path B SQL documented for operator re-verification. UI status page remains future work (optional for Phase 0 acceptance if admin query suffices per gate wording).

---

## Build / lint (repo toolchain)

| Step | Result | Notes |
|------|--------|-------|
| `npm run build` | PASS | Docs-only change; verified 2026-06-07 |
| `npm run lint` | FAIL | Known baseline prettier/lint debt; unchanged |

---

## Gate impact

| Row | Action |
|-----|--------|
| E1 | **Unchecked** — blocker documented above |
| E3 | **Checked** — admin query evidence (Path A + Path B) |
| Phase 0 | **OPEN** |
| Phase 1 | **BLOCKED** |
| Sign-off | **Blank** |

## Related

- [PHASE0_ACCEPTANCE_GATE.md](../automation/PHASE0_ACCEPTANCE_GATE.md)
- [WPC-0-001-worker-dummy.md](../automation/task-packets/WPC-0-001-worker-dummy.md)
- [PHASE0_AUTOMATION_TABLES.md](../automation/PHASE0_AUTOMATION_TABLES.md) § Security
- [PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md](./PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md)
