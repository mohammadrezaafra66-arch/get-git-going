# Integration 3100 report — 2026-09-22

> **Rule for all agents:** From now on, deploy to 3100 only from `integration/3100-20260922` (merge your feature branch into it first); never deploy a single feature branch to 3100.

**3100 status: NOT READY** (deploy pending)

**STATUS: IN PROGRESS** — Phase 2 exempted; continuing Phase 3+.

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

## Phase 2 — Migration ledger check → **EXEMPTED by owner**

Compared every `supabase/migrations/<14-digit>_*.sql` version on integration HEAD to `supabase_migrations.schema_migrations` on `afrakala`.

- Disk unique versions: **745**
- Ledger rows: **741**
- Gaps found: **5**

### Pre-existing ledger gaps (exempted)

Owner decision: these gaps are pre-existing on 3100, unrelated to this release, and this deploy changes no DB state. **Do not apply or record any of them.**

| Version | File | Disposition |
|---------|------|-------------|
| `20260912140000` | `523_close_anon_table_grants_for_production_shape.sql` | **Production-only by design** — must never be applied or recorded on test |
| `20260913101000` | `533_pg_cron_http_scheduler.sql` | Owner follow-up (exempted) |
| `20260913102000` | `534_cron_run_log.sql` | Owner follow-up (exempted); `cron_run_log` absent on afrakala |
| `20260916210000` | `557_person_merge_overview_paged.sql` | Owner follow-up (exempted); paginated overview fn already live |
| `20260916220000` | `558_person_merge_helper_grants.sql` | Owner follow-up (exempted) |

**Salesdesk issue (flagged):** migration `558` intent is not fully live — `authenticated` EXECUTE on `public._person_merge_repoint(text,text,uuid,uuid)` measured **false** (while `_person_merge_count_refs` is true). Persons merge from UI may hit `permission denied for function _person_merge_repoint`. Track as a salesdesk follow-up; out of scope for this integration deploy.

Gate for this release: **PASS (exempted)** — proceed to Phase 3.

---

## Phases 3–5

| Phase | Status |
|-------|--------|
| 3 Typecheck | **PASS** — 74 errors (≤74); merge-changed `registry.ts` person-merge-pending is pre-existing |
| 4 Deploy | pending |
| 5 Collab / salesdesk / auth verify | pending |
| 5.4 Pricing smoke | **EXCLUDED** |
| READY gate | pending |

---

## Prior Phase 1 note

Purchase was previously aborted on `src/` conflicts (`_app.persons_.merge.tsx`, `routeTree.gen.ts`). Owner later excluded purchase entirely for this integration — those conflicts were not revisited.

---

## Worktree

- Path: `D:\AfraKalaTest\wt-integration-3100`
- Branch: `integration/3100-20260922` @ `b0caa21b`
- Main repo `D:\AfraKalaTest\app` untouched for git ops
