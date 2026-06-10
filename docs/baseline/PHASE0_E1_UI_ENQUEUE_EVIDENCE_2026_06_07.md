# Phase 0 E1 UI Enqueue Evidence — 2026-06-07

**Phase Label:** PHASE-0  
**Criterion:** E1 — UI command → DB job created  
**Task packet:** [WPC-0-004-admin-automation-enqueue.md](../automation/task-packets/WPC-0-004-admin-automation-enqueue.md)  
**Verification date:** 2026-06-07

---

## Environment

| Field | Value |
|-------|-------|
| Implementation branch | `phase-0/admin-dummy-enqueue` |
| UI route | `/admin/automation` |
| Roles required | `admin`, `manager` |
| DB prerequisite | Migration `20260605120000_phase0_automation_tables.sql` applied; `dummy_worker` enabled |

---

## UI path

| Item | Value |
|------|-------|
| Route | `/admin/automation` |
| Nav label | اتوماسیون فاز صفر (admin tools) |
| Route guard | `requireAnyRole(["admin", "manager"])` |
| Button label | **ایجاد دستور dummy** |
| Server function | `enqueueDummyAutomationJobFn` (POST, `requireSupabaseAuth`) |
| Server authorization | `user_roles` check — admin or manager only |
| Write client | `supabaseAdmin` (server-side only) |

---

## Server-side enqueue confirmation

On successful UI action, the server returns (safe fields only):

| Field | Example / shape |
|-------|-----------------|
| ok | `true` |
| created | `true` |
| module_key | `dummy_worker` |
| job_type | `DUMMY_RUN` |
| job.status | `PENDING` |
| job.id | UUID (e.g. `a1b2c3d4-....`) |
| job.created_at | ISO timestamp |
| real_bot_scope | `false` |
| phase_label | `PHASE-0` |

The UI displays: job id, status, created_at, module, job type, and confirms no real bot.

---

## Safety confirmations

| Check | Result |
|-------|--------|
| Module is `dummy_worker` only | **PASS** — hardcoded server lookup by `module_key` |
| Job type restricted | **PASS** — `DUMMY_RUN` only |
| No real bot tables/modules | **PASS** — reuses Phase 0 automation tables only |
| No external platform calls | **PASS** — DB insert only |
| Service role in browser | **PASS** — `client.server.ts` not imported from UI; server function only |
| Audit log | **PASS** — `automation_dummy_job_enqueued` written server-side |

---

## Manual test path (operator)

1. Sign in as admin or manager.
2. Navigate to **مدیریت سیستم → اتوماسیون فاز صفر** (`/admin/automation`).
3. Click **ایجاد دستور dummy**.
4. Confirm on-page result shows job id, `PENDING` status, and `created_at`.
5. Optional DB verify (admin RLS or Studio):

```sql
SELECT j.id, j.status, j.job_type, j.created_at, m.module_key
FROM public.automation_jobs j
JOIN public.automation_modules m ON m.id = j.module_id
WHERE m.module_key = 'dummy_worker'
ORDER BY j.created_at DESC
LIMIT 5;
```

Expected: newest row `job_type = DUMMY_RUN`, `status = PENDING`, `module_key = dummy_worker`.

6. Optional: run worker smoke to consume job:

```bash
node automation/worker-dummy/run-e2e.mjs
```

(Uses separate idempotency key unless operator coordinates keys.)

---

## Build / lint

| Step | Result | Notes |
|------|--------|-------|
| `npm run build` | PASS | Verified 2026-06-07 |
| `npm run lint` | FAIL | Known baseline prettier/lint debt; unchanged |

---

## Gate impact

| Row | Action |
|-----|--------|
| E1 | **Checked** — UI command creates `automation_jobs` row via server function |
| E2, E3 | Unchanged (already checked) |
| Phase 0 | **OPEN** — sign-off still pending |
| Phase 1 | **BLOCKED** |

**No secrets recorded in this document.**

---

## Related

- [PHASE0_ACCEPTANCE_GATE.md](../automation/PHASE0_ACCEPTANCE_GATE.md)
- [PHASE0_E1_E3_BLOCKER_2026_06_07.md](./PHASE0_E1_E3_BLOCKER_2026_06_07.md)
- [PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md](./PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md)
