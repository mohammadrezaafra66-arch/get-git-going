# Integration 3100 report — 2026-09-22

> **Rule for all agents:** From now on, deploy to 3100 only from `integration/3100-20260922` (merge your feature branch into it first); never deploy a single feature branch to 3100.

**3100 status: NOT READY**

**STATUS: PARTIAL** — stopped at Phase 2 (migration ledger gaps). Purchase branch excluded by owner decision.

---

## Owner decision (follow-up)

| Branch | Status |
|--------|--------|
| `release/collab-20260922` (`d78a5c4e`) | **Integrated** |
| `feature/salesdesk-9-fixes` (`106ae89a`) | **Integrated** |
| `feature/purchase-prices-single-active` (`40db298b`) | **Not integrated — owner follow-up** (excluded; conflicts/migrations not touched) |

Pricing Phase 5 item 4: **EXCLUDED**.

---

## Branches merged

| Step | Result | Commit |
|------|--------|--------|
| Worktree from `origin/release/collab-20260922` | OK | `integration/3100-20260922` |
| `--no-ff` `origin/feature/salesdesk-9-fixes` | OK | `92a5f5af` |
| Purchase merge | **Not attempted** (owner exclude) | — |
| Stop docs | OK | `c7096026` |

Integration HEAD at Phase 2: **`c7096026`**.  
Deployed 3100: **`106ae89a`** (unchanged; deploy not reached).  
Ancestry precheck would PASS (`106ae89a` ⊂ HEAD).

---

## Migration timestamp collisions (kept for owner follow-up)

When purchase is re-integrated later, these same-timestamp collisions remain:

| Timestamp | On salesdesk / collab / integration | On purchase |
|-----------|-------------------------------------|-------------|
| `20260916210000` | `557_person_merge_overview_paged.sql` | `557_torob_ops_path_a.sql` |
| `20260916220000` | `558_person_merge_helper_grants.sql` | `558_torob_ops_correlation.sql` |

Series-number overlap (different timestamps):

| Version | File |
|---------|------|
| `20260922160000` | purchase: `560_purchase_prices_single_active.sql` (ledger already has this version) |
| `20260922180000` | collab: `560_schedule_tick_inquiries.sql` (in ledger; cron job 26 live) |

---

## Phase 2 — Migration ledger check → **STOP**

Compared every `supabase/migrations/<14-digit>_*.sql` version on integration HEAD to `supabase_migrations.schema_migrations` on `afrakala`.

- Disk unique versions: **745**
- Ledger rows: **741**
- **Missing from ledger: 5** (gate requires 0)

| Version | File on disk | Introduced / present on | Live DB evidence (read-only) |
|---------|--------------|-------------------------|------------------------------|
| `20260912140000` | `523_close_anon_table_grants_for_production_shape.sql` | main/staging/salesdesk/collab/integration (old #437) | Not verified as applied; anon still has 60 public table grants (may be expected residual) |
| `20260913101000` | `533_pg_cron_http_scheduler.sql` | convergence / all above | Designed as afrakala no-op for cron DDL; no `run_issabel*` on afrakala |
| `20260913102000` | `534_cron_run_log.sql` | convergence / all above | **`public.cron_run_log` does NOT exist** → likely never applied on afrakala |
| `20260916210000` | `557_person_merge_overview_paged.sql` | salesdesk / collab / integration | **Applied in effect:** `person_merge_candidates_overview(p_limit,p_offset)` exists — **ledger row missing** |
| `20260916220000` | `558_person_merge_helper_grants.sql` | salesdesk / collab / integration | **Incomplete:** `authenticated` EXECUTE on `_person_merge_repoint` = **false**; on `_person_merge_count_refs` = true |

**Per mission: did NOT apply any of these. STOP.**

### Owner must do (Phase 2 unblock)

1. For each of the five: decide **record-only** (if already applied) vs **apply then record** (if not). Never re-run a destructive/idempotent-unsafe file blindly.
2. Priority: **558** (repoint grant false — persons merge UI can fail with permission denied) and **534** (table absent) if still wanted on test.
3. After ledger matches disk for these five, re-run from Phase 3 (typecheck → deploy → Phase 5). Do **not** apply purchase migrations here.

---

## Phases after Phase 2

| Phase | Status |
|-------|--------|
| 3 Typecheck | SKIPPED |
| 4 Deploy | SKIPPED |
| 5 Collab / salesdesk / auth verify | SKIPPED |
| 5.4 Pricing smoke | **EXCLUDED** |
| READY gate | NOT MET |

---

## Prior Phase 1 note

Purchase was previously aborted on `src/` conflicts (`_app.persons_.merge.tsx`, `routeTree.gen.ts`). Owner later excluded purchase entirely for this integration — those conflicts were not revisited.

---

## Worktree

- Path: `D:\AfraKalaTest\wt-integration-3100`
- Branch: `integration/3100-20260922` @ `c7096026`
- Main repo `D:\AfraKalaTest\app` untouched for git ops
