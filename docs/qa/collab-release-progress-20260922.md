# Collaboration release progress — 2026-09-22

## HANDOFF STATE

```
PHASE: 2 complete; starting 3
WORKTREE: D:\AfraKalaTest\wt-collab-release
BRANCH: release/collab-20260922
HEAD: 8d608784 (plan v2 on 8f4ef3ee)
DEPLOYED_APP_GIT_SHA: c96791df  (**NOT** ancestor of HEAD — Phase 5 will STOP)
COMPOSE_PROJECT: afrakala-lan
ENV_FILE: D:\AfraKalaTest\app\deploy\lan\.env.lan
TICK_PROBE: PASS (ROLLBACK, no 42P10)
OPEN_GT_10M: 0
D6_CRON: not yet scheduled
BLOCKERS: Phase 5 ancestry precheck will fail (c96791df on feature/purchase-prices-single-active)
```

---

## Phase 0 — Worktree and preflight

| Item | Value |
|------|-------|
| Worktree | `D:\AfraKalaTest\wt-collab-release` |
| Branch | `release/collab-20260922` from `8f4ef3ee` |
| Plan v2 commit | `8d608784` (`docs(collab): plan v2 — 42P10 check`) |
| Deployed `APP_GIT_SHA` | `c96791df` (mission said `f9c57d0e`; live differs) |
| Compose project | `afrakala-lan` |
| Compose config | `D:\AfraKalaTest\app\deploy\lan\docker-compose.yml` |
| `.env.lan` | `D:\AfraKalaTest\app\deploy\lan\.env.lan` (not in worktree) |
| Hygiene draft | `docs/qa/collab-rollout-hygiene-20260922.sql` — **NOT used** (direct UPDATE; mission requires RPC) |

### Migration / cron convention

- Ledger: `supabase_migrations.schema_migrations` in DB `afrakala`. Direct `psql` apply does **not** auto-record — insert version in same breath.
- Latest ledger version seen: `20260922160000` (ahead of worktree files ending at 559).
- Next migration timestamp chosen: `20260922180000` / series `560`.
- `pg_cron` lives in DB `postgres`. Jobs targeting the app use `cron.schedule_in_database(..., 'afrakala', 'supabase_admin', true)`.
- Pattern: tracked migration COMMENT on afrakala (445-style) + `deploy/lan/scripts/cron-*-schedule-*.sql` applied against **postgres** (idempotent unschedule-then-schedule).
- After migrations touching REST-visible objects: `docker restart afrakala-lan-rest`.
- SQL delivery: stdin Buffer into `docker exec -i` (docker cp broken on this host).

### Gate

- Worktree clean on `release/collab-20260922` after plan commit: **PASS**
- Conventions recorded: **PASS**

---

## Phase 1 — `tick_inquiries` probe

```
BEGIN;
SELECT public.tick_inquiries() AS tick_result;
ROLLBACK;
```

Result: one row, empty `tick_result`, **ROLLBACK** — **no error / no 42P10**.

Gate: **PASS** — scheduling may proceed.

---

## Phase 2 — Test data hygiene

### Before

| Metric | Count |
|--------|------:|
| open >10m (SLA open statuses) | 11 |
| non-prefix inquiries | 5 |
| prefix groups active | 90 |
| non-prefix groups | 11 |

11× `transfer_available`, all assignee `test.manager@afrakala.local`.

### Actions

1. `update_inquiry_status(..., 'expired')` via PostgREST RPC.
   - Admin JWT: denied (admin not a group member on these 11).
   - Manager JWT (assignee + member): **11× HTTP 204**.
2. Soft-deactivate only: `docs/qa/collab-e2e-cleanup-20260921-2352.sql` → `UPDATE 94` on prefix groups. Hard DELETEs remain commented.

### After

| Metric | Count |
|--------|------:|
| open >10m | **0** |
| non-prefix inquiries | **5** (unchanged) |
| prefix groups active | **0** |
| non-prefix groups | **11** (unchanged) |

Gate: **PASS**. `performance_penalties` left untouched.

---

## Phase 3+

(pending)
