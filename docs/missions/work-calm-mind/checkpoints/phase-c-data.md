# phase-c-data — work_test_reports (migration 550)

**Agent:** dev-data-engineer  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**Branch:** `feature/work-calm-mind`  
**Baseline HEAD:** `a3c6384bac3311e8d5eb76a806393eaa521797e4`  
**Deadline (B-8):** 2026-09-16T05:00:00+05:00  

## Objects created

| Object | Kind |
|--------|------|
| `public.work_test_reports` | table (soft-delete via `deleted_at`) |
| `idx_work_test_reports_item` | index `(work_item_id)` |
| `idx_work_test_reports_created` | index `(created_at DESC)` |
| `idx_work_test_reports_item_active` | partial index `(work_item_id, created_at DESC) WHERE deleted_at IS NULL` |
| `work_test_reports_select/insert/update/delete` | RLS policies (544 role allowlist + `work_can_see_item` / reporter) |
| `public.work_submit_test_report(uuid,text,text,uuid,timestamptz)` | SECURITY DEFINER RPC |

**Not touched:** `public.tasks`, schema of `public.work_items` (status updates only via RPC).

## Migration paths

- Forward: `supabase/migrations/20260916140000_550_work_test_reports.sql`
- Reverse (copy/staging only): `docs/verification/550-down.sql`

## How to apply on LAN (copy DB `afrakala` / container `afrakala-lan-db`)

Do **not** apply on production (`postgres` DB on production laptop).

Byte-exact delivery (no PowerShell pipe; no `docker cp`):

```bash
# Node Buffer → docker exec -i cat
node -e "require('fs').readFileSync('supabase/migrations/20260916140000_550_work_test_reports.sql')" # prefer scripts below
# Then:
docker exec -e PGPASSWORD=$pw afrakala-lan-db \
  psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction \
  -f /tmp/550_work_test_reports.sql

# Ledger (same breath):
docker exec -e PGPASSWORD=$pw afrakala-lan-db \
  psql -U supabase_admin -d afrakala -c \
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260916140000') ON CONFLICT DO NOTHING;"
```

Helper used this run: `checkpoints/_550-apply.cjs` (local).

## Evidence

### Baseline (pre-apply) — E3

- `work_items` present; `work_test_reports` absent
- Artifact: `checkpoints/_550-baseline.out.txt` (`exit=0`)

### Forward apply — E3

- md5 local=remote=`79bb8322a4872559e3415b395e6658f6`
- `apply_exit=0`, ledger `20260916140000` inserted
- Artifact: `checkpoints/_550-apply.out.txt`

### Query / RPC behavior (BEGIN…ROLLBACK) — E4

| Probe | Result |
|-------|--------|
| approve → `work_items.status=done` + `completed_at` set by existing trigger | `PROBE_APPROVE_OK` |
| reject without ETA when `claimed_due_at` null | `PROBE_ETA_GATE_OK` (`check_violation`) |
| reject + `p_claimed_due_at` → `in_progress` | `PROBE_REJECT_OK` |
| soft-delete `deleted_at` | `PROBE_SOFT_DELETE_OK` |
| anon SELECT false; authenticated SELECT/INSERT true; anon EXECUTE false | catalog OK |
| `public.tasks` column count unchanged (15) | OK |

Artifact: `checkpoints/_550-probe.out.txt` (`probe_exit=0`)

### Reverse then re-apply — E3

- DOWN_exit=0 → `to_regclass` / RPC null
- UP_AGAIN_exit=0 → table + RPC present again
- Artifact: `checkpoints/_550-down-up.out.txt`

## Consumers (app code — for Phase C FE/BE; not changed here)

No client callers yet for `work_test_reports` / `work_submit_test_report` in this worktree at write time (new surface). Existing `work_items` writers/RPCs unchanged except RPC updates status through normal UPDATE (triggers remain).

## Risks & rollback

- Soft history preferred; hard DELETE policy = admin only.
- Down SQL **DROP TABLE** — destroys report rows; use only on copy.
- LAN ledger now includes `20260916140000`; production not applied.

## حکم

**COMPLETE** for migration authoring + LAN copy apply + down/up + rolled-back behavioral probes.  
**Not claimed:** production apply; client/UI wiring.
