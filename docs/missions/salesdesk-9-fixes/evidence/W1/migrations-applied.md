# migrations-applied — Wave 1 (560/561/562)

Date: 2026-09-21T19:00:22.362Z
DB: `afrakala` (`afrakala-lan-db`) — staging/test computer only
Apply path: Node Buffer → `docker exec -i` (AGENTS.md); password from container `$POSTGRES_PASSWORD`

## Versions

| NNN | File | version | md5 | bytes |
|-----|------|---------|-----|------:|
| 560 | `supabase/migrations/20260921220000_560_work_item_events.sql` | `20260921220000` | `7b92c361b34fcdea195ccff18fbed3c7` | 4432 |
| 561 | `supabase/migrations/20260921220100_561_purchases_require_supplier.sql` | `20260921220100` | `5cda27c1e18760b86c127ed055ad5b22` | 1784 |
| 562 | `supabase/migrations/20260921220200_562_work_items_completed_at_closed.sql` | `20260921220200` | `11aeeb9ad8f233c16b0bb21318bdce34` | 1857 |

Ledger after clean (orphan `20260921120000` deleted):

```
20260921220000
20260921220100
20260921220200
```

Source: `evidence/W1/ledger-clean.txt`

## Reverts

- `docs/missions/salesdesk-9-fixes/revert/560_work_item_events.sql`
- `docs/missions/salesdesk-9-fixes/revert/561_purchases_require_supplier.sql`
- `docs/missions/salesdesk-9-fixes/revert/562_work_items_completed_at_closed.sql`

## Verify queries (live)

```
trig=trg_work_items_before_write
trig=trg_work_items_log_events
trig=trg_work_items_updated_at
purch=trg_purchases_require_supplier
cols=id,work_item_id,actor_id,event_at,field,old_value,new_value
fn_has_cancelled=yes
persist_test9fix=0
persist_wi_test9fix=0
```

Source: `evidence/W1/verify-all.txt`

## A4 probe (BEGIN…ROLLBACK)

```
NOTICE:  A4_PROBE_OK err=SUPPLIER_REQUIRED
BEGIN
DO
ROLLBACK
rc=0
```

Insert with `supplier_id NULL` fails with ASCII `SUPPLIER_REQUIRED`. Rolled back. No persistent `[TEST-9FIX]` purchase rows (`persist_test9fix=0`).

## A2 / 562 decision

Live `work_items_before_write` (from 543) set `completed_at` only for `status='done'`. Board `openOnly` treats both `done` and `cancelled` as closed, so «بسته شده» / «تاریخ بسته شدن» need `completed_at` for cancelled too → **562 applied** (not skipped).

Pre-replace dump: `evidence/W1/before-work_items_before_write.sql`

Probe (BEGIN…ROLLBACK):

```
NOTICE:  A2_PROBE_OK completed_at=2026-09-21 19:00:22.046693+00
BEGIN
DO
ROLLBACK
rc=0
```

## Notes

- Concurrent applies briefly left two AFTER UPDATE loggers; final 560 is a single writer: `trg_work_items_log_events` → `work_items_log_events()`, field name `assignee_id`.
- UI `src/lib/work/history.ts` may still map label key `assignee` — update UI to `assignee_id` (out of data-layer scope).
