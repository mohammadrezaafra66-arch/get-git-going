# Checkpoint D1 — sales-desk migrations 545/546/547

| Field | Value |
|---|---|
| **Status** | COMPLETE |
| **Agent** | dev-data-engineer |
| **Branch** | `feature/sales-desk` |
| **HEAD at start** | `edd55fb95e865c8feb4e437eddc8d73cc3dec0f2` |
| **Worktree** | `D:\AfraKalaTest\app` |
| **Deadline** | 2026-09-16T04:30:00+05:00 |
| **Written** | 2026-09-16 (local) |

## Files created (locked numbers [B-4])

1. `supabase/migrations/20260916030000_545_sales_interactions.sql`
2. `supabase/migrations/20260916031000_546_sales_interaction_rpcs.sql`
3. `supabase/migrations/20260916032000_547_sales_interaction_assign_notify.sql`

Reverse scripts (orchestration):

- `docs/research/sales-desk-9-needs/orchestration/545-down.sql`
- `docs/research/sales-desk-9-needs/orchestration/546-down.sql`
- `docs/research/sales-desk-9-needs/orchestration/547-down.sql`

## Apply to LAN DB (`afrakala-lan-db` / db `afrakala` / user `supabase_admin`)

Password: **from env** (`deploy/lan/.env.lan` `POSTGRES_PASSWORD`) — not printed.

Delivery: Node Buffer → base64 stdin → `base64 -d` in container → `md5sum` match → `psql -v ON_ERROR_STOP=1 --single-transaction -f` → ledger `INSERT … ON CONFLICT DO NOTHING`.

| Migration | MD5 (local=remote) | Apply rc | Ledger INSERT |
|---|---|---:|---|
| 545 `20260916030000` | `8d09fbac8a5ffde694383e722dbcafc5` | **0** | `INSERT 0 1` |
| 546 `20260916031000` | `e5ecb67d01f9706928494ac836c4b2c2` | **0** | `INSERT 0 1` |
| 547 `20260916032000` | first apply then fix+reapply `51ba6465e5a52eac04b63b46a8da9ac0` | **0** | `INSERT 0 1` then `INSERT 0 0` |

547 fix before commit: live `notification_queue.reference_id` is **uuid** (catalog), not text — trigger inserts `NEW.id` without `::text`.

## Reverse + re-apply cycle [E3]

| Step | rc |
|---|---:|
| 547-down | 0 |
| 547 up | 0 |
| 546-down | 0 |
| 546 up | 0 |
| 545-down (restore pre-545 `person_merge`, DROP TABLE) | 0 + NOTICE `545-down OK` |
| 545 + 547 + 546 up restore | 0 |

## Verification excerpts [E3]

- Table `public.sales_interactions` exists; 16 columns; kind/status CHECKs; 5 indexes + PK; RLS on; 3 policies.
- Registry: `sales_interactions.person_id` → `verdict=ok`.
- RPCs: `sales_interaction_create`, `sales_interaction_update_status`, `sales_interaction_set_follow_up`, `sales_my_month_stats` — anon EXECUTE=f, authenticated=t.
- CHECK includes `sales_interaction_assigned` and prior types including `daily_accrual_summary`.
- Trigger `trg_notify_sales_interaction_assigned` enabled.
- Ledger versions: `20260916030000`, `20260916031000`, `20260916032000`.

## Behaviour probe [E4]

Rolled-back INSERT with `salesperson_id` set → NOTICE `probe OK: … notify_rows=1` (rc=0), then `ROLLBACK`. Re-confirmed after reverse cycle.

## Notify path (documented in 547)

**AFTER INSERT OR UPDATE OF salesperson_id** trigger `notify_sales_interaction_assigned` (SECURITY DEFINER) → `notification_queue` row. Covers RPC and direct writes. Skips self-assign (`salesperson_id = auth.uid()`).

## What was not done

- No product TS/TSX edits.
- No `git push`.
- No production DB.
- E5 independent third-party review not run in this session.

## Out of scope notes

- `call_logs` has no FK constraints in live catalog; `sales_interactions.call_log_id` still REFERENCES `call_logs(id)`.
- Historical migrations 126/224 cast `reference_id` as text; live column is uuid — prefer live catalog ([A-7]).
