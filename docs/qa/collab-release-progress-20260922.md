# Collaboration release progress — 2026-09-22

## HANDOFF STATE

```
STATUS: PARTIAL — STOPPED at Phase 5 (ancestry)
PHASE: 5 STOP; 6 skipped; 7 docs+push
WORKTREE: D:\AfraKalaTest\wt-collab-release
BRANCH: release/collab-20260922
HEAD: a693edff
DEPLOYED_APP_GIT_SHA: 106ae89a  (changed during run; was c96791df at Phase 0)
ANCESTRY: FAIL — 106ae89a is NOT ancestor of HEAD
COMPOSE_PROJECT: afrakala-lan
ENV_FILE: D:\AfraKalaTest\app\deploy\lan\.env.lan
TICK_PROBE: PASS (ROLLBACK, no 42P10)
OPEN_GT_10M: 0
D6_CRON: LIVE on TEST — jobid=26 afrakala-tick-inquiries-1min active database=afrakala
SLA_GATE_INQUIRY: d2dc0de7-65eb-4d5a-9cb1-44ae59dc010e reached warning_5min without manual tick
TYPECHECK: 74 errors total; 0 in touched files
TEST_SERVER: NOT READY (code not deployed; E2E not re-run)
OWNER_NEXT:
  1) Resolve who owns deployed 106ae89a on 3100
  2) When clear, deploy from this worktree after ancestry check passes
  3) Run Phase 6 E2E; then use prod checklist (DB name postgres)
```

---

## Phase 0 — Worktree and preflight

| Item | Value |
|------|-------|
| Worktree | `D:\AfraKalaTest\wt-collab-release` |
| Branch | `release/collab-20260922` from `8f4ef3ee` |
| Plan v2 commit | `8d608784` |
| Deployed at Phase 0 | `c96791df` (later became `106ae89a`) |
| Compose project | `afrakala-lan` |
| `.env.lan` | `D:\AfraKalaTest\app\deploy\lan\.env.lan` |
| Hygiene draft | **NOT used** (direct UPDATE) |

### Migration / cron convention

- Ledger: `supabase_migrations.schema_migrations` in `afrakala`; record version after direct psql.
- Cron: register from DB `postgres` via `cron.schedule_in_database(..., target, 'supabase_admin', true)`.
- TEST target DB = `afrakala`; PROD target DB = `postgres`.
- Companion script: `deploy/lan/scripts/cron-560-schedule-tick-inquiries.sql`.
- SQL via stdin Buffer (docker cp broken). Restart `afrakala-lan-rest` after migrations.

Gate: **PASS**

---

## Phase 1 — tick_inquiries probe

`BEGIN; SELECT public.tick_inquiries(); ROLLBACK;` → 1 row, no error.

Gate: **PASS**

---

## Phase 2 — hygiene

Before: open>10m=11; non-prefix inquiries=5; prefix active groups=90; non-prefix groups=11.  
Actions: manager JWT `update_inquiry_status`→`expired` (admin not member); cleanup SQL soft-deactivate 94 groups.  
After: open>10m=0; non-prefix inquiries=5; prefix active=0; non-prefix groups=11.

Gate: **PASS**

---

## Phase 3 — SLA cron

- Migration `20260922180000_560_schedule_tick_inquiries.sql` committed then applied to afrakala (COMMENT) + ledger.
- Companion script applied to postgres → jobid **26**.
- Successful runs within minutes; inquiry `E2E-COLLAB-REL-20260922` → `warning_5min`.

Gate: **PASS**

---

## Phase 4 — code

Commits: `586fef0d` auth redirect; `c44d28d5` hub/nav; `a693edff` E2E.  
Typecheck: 74 total, 0 in touched files.

Gate: **PARTIAL** (count >70 baseline claim; no regressions in touched files)

---

## Phase 5 — STOP

`git merge-base --is-ancestor 106ae89a HEAD` → fail. No deploy. No overwrite.

---

## Phase 6 — skipped

---

## Phase 7

- Report: `docs/qa/collab-release-report-20260922.md`
- Prod checklist: `docs/qa/collab-prod-promotion-checklist-20260922.md`
- Push branch (no merge to staging/main)
