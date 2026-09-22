# Collaboration release progress — 2026-09-22

## HANDOFF STATE

```
STATUS: PARTIAL — STOPPED at Phase 2 (5 migration versions not in ledger)
INTEGRATION_WORKTREE: D:\AfraKalaTest\wt-integration-3100
INTEGRATION_BRANCH: integration/3100-20260922 @ c7096026 (collab + salesdesk)
PURCHASE: EXCLUDED — owner follow-up (not integrated)
DEPLOYED_APP_GIT_SHA: 106ae89a (unchanged; deploy not reached)
LEDGER_MISSING:
  20260912140000 523_close_anon_table_grants_for_production_shape.sql
  20260913101000 533_pg_cron_http_scheduler.sql
  20260913102000 534_cron_run_log.sql (cron_run_log table ABSENT)
  20260916210000 557_person_merge_overview_paged.sql (fn live; ledger gap)
  20260916220000 558_person_merge_helper_grants.sql (repoint grant FALSE)
OWNER_NEXT:
  1) Record and/or apply the five ledger gaps (do not blind re-run)
  2) Resume Phase 3 typecheck → deploy → Phase 5 (pricing EXCLUDED)
  3) Purchase remains separate follow-up after renumber + conflict resolve
REPORT: docs/qa/integration-3100-report-20260922.md
```

### Integration resume 2026-09-22 (purchase excluded)

- Owner excluded `feature/purchase-prices-single-active`.
- Phase 2 ledger check: 5 versions on disk not in `schema_migrations` → STOP; nothing applied.
- Notable: 557 fn live but unrecorded; 558 `_person_merge_repoint` EXECUTE for authenticated is false; 534 `cron_run_log` absent.
- No deploy. See `docs/qa/integration-3100-report-20260922.md`.

### Integration attempt 2026-09-22 (append)

- Created `integration/3100-20260922` from `origin/release/collab-20260922`.
- Merged `origin/feature/salesdesk-9-fixes` (`--no-ff` → `92a5f5af`) cleanly.
- Merge of `origin/feature/purchase-prices-single-active` aborted: conflicts in `src/` (persons merge route + routeTree.gen.ts).
- Same-timestamp migration collisions: `20260916210000` / `20260916220000` (person_merge vs torob Path A).
- No deploy; 3100 remains `106ae89a`. Details: `docs/qa/integration-3100-report-20260922.md`.

---

## Prior HANDOFF (collab release stop at Phase 5 ancestry)

```
STATUS: PARTIAL — STOPPED at Phase 5 (ancestry)
PHASE: 5 STOP; 6 skipped; 7 docs+push
WORKTREE: D:\AfraKalaTest\wt-collab-release
BRANCH: release/collab-20260922
HEAD: a693edff / later d78a5c4e on remote
DEPLOYED_APP_GIT_SHA: 106ae89a
ANCESTRY: FAIL — 106ae89a is NOT ancestor of collab HEAD alone
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
