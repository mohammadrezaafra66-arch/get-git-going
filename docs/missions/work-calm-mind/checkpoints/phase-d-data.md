# phase-d-data — work_taxonomies (migration 551)

**Agent:** dev-data-engineer  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**Branch:** `feature/work-calm-mind`  
**Baseline HEAD:** `5cbe46457680e4bc6c2f75f971b9c4275b1e19e4`  
**Deadline (B-8):** 2026-09-16T06:15:00+05:00  

## Objects created

| Object | Kind |
|--------|------|
| `public.work_taxonomies` | table (soft-delete via `deleted_at`) |
| `uq_work_taxonomies_kind_name_active` | partial unique index `(kind, name) WHERE deleted_at IS NULL` |
| `idx_work_taxonomies_kind_active_sort` | partial index `(kind, sort_order, name) WHERE deleted_at IS NULL AND is_active` |
| `trg_work_taxonomies_updated_at` | BEFORE UPDATE → `set_updated_at()` |
| `work_taxonomies_select/insert/update/delete` | RLS (544 role allowlist) |
| seed rows | 6 groups + 4 sections + 4 kind_labels |

**Not touched:** `public.tasks`, `public.work_items` schema.

## Migration paths

- Forward: `supabase/migrations/20260916150000_551_work_taxonomies.sql`
- Reverse (copy/staging only): `docs/verification/551-down.sql`

## How to apply on LAN (copy DB `afrakala` / container `afrakala-lan-db`)

Do **not** apply on production.

Helper used this run: `checkpoints/_551-apply.cjs` (local).

```text
node docs/missions/work-calm-mind/checkpoints/_551-apply.cjs
# ledger version: 20260916150000
```

## Evidence

### Baseline (pre-apply) — E3

- `work_taxonomies` absent; `work_test_reports` present; `tasks` cols=15
- Artifact: `checkpoints/_551-baseline.out.txt` (`exit=0`)

### Forward apply — E3

- md5 local=remote=`b6de6aac83e4226d7534d18f34f5fdfe`
- `apply_exit=0`, ledger `20260916150000` inserted, `INSERT 0 14` seeds
- Artifact: `checkpoints/_551-apply.out.txt`

### Query behavior (BEGIN…ROLLBACK) — E4

| Probe | Result |
|-------|--------|
| seed group `فروش` present | `PROBE_SEED_OK` |
| unique live `(kind,name)` | `PROBE_UNIQUE_OK` |
| deactivate bumps `updated_at` | `PROBE_DEACTIVATE_OK` |
| soft-delete `deleted_at` | `PROBE_SOFT_DELETE_OK` |
| reuse name after soft-delete | `PROBE_REUSE_AFTER_SOFT_OK` |
| kind CHECK rejects `bogus` | `PROBE_KIND_CHECK_OK` |
| `public.tasks` column count unchanged (15) | `PROBE_TASKS_UNTOUCHED_OK` |
| anon SELECT false; authenticated SELECT/INSERT/UPDATE true | catalog OK |
| live counts: 6 groups / 4 sections / 4 kind_labels | OK |

Artifact: `checkpoints/_551-probe.out.txt` (`probe_exit=0`)

### Reverse then re-apply — E3

- DOWN_exit=0 → `to_regclass` null + ledger row deleted
- UP_AGAIN_exit=0 → table + 14 live rows + ledger again
- Artifact: `checkpoints/_551-down-up.out.txt`

## Consumers (app code — for Phase D FE; not changed here)

No client callers yet for `work_taxonomies` (new surface). Existing UI still uses free-text `work_items.group_name` / `section` (`CreateWorkWizard.tsx`, `WorkBoardPage.tsx`, `classify.ts`).

## Risks & rollback

- Soft history preferred; hard DELETE policy = admin only.
- Down SQL **DROP TABLE** — destroys taxonomy rows; use only on copy.
- LAN ledger includes `20260916150000`; production not applied.

## حکم

**COMPLETE** for migration authoring + LAN copy apply + down/up + rolled-back behavioral probes.  
**Not claimed:** production apply; UI settings page wiring.
