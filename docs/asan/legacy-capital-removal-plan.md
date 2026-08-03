# Legacy capital allocation path — blast radius and removal plan

ASAN mission M1, phase 1.2. Written before anything was changed, from live database state
(`pg_class`, `pg_constraint`, `pg_trigger`, `pg_policies`, `pg_get_functiondef`) rather than
from migration files.

## The two paths, side by side

| | legacy | dynamic (keep) |
|---|---|---|
| salesperson table | `salesperson_capital_allocations` — **0 rows** | `salesperson_capital_allocations_dynamic` — **182 rows** |
| customer table | `customer_capital_allocations` — **0 rows** | `customer_capital_allocations_dynamic` — **4 rows** |
| driven by | `daily_capital_snapshots` (FK) | `daily_capital_settings` (FK) |
| read by the app | nothing | `useDynamicCapital.ts`, `useDynamicScoring.ts`, `/accounting/dynamic-capital` |
| views | none | `v_dynamic_salesperson_capital_balances`, `v_dynamic_customer_capital_balances` |

The legacy tables have never held a row. `save_salesperson_capital_allocations` even says so
in its own body: *"salesperson_capital_allocations has 0 rows: this path never worked."*

## What gets removed

### Tables (dropped child-first)
- `public.customer_capital_allocations`
- `public.salesperson_capital_allocations`

Their indexes (`ccap_customer_date_idx`, `ccap_salesperson_date_idx`, `ccap_snapshot_idx`,
`customer_capital_allocations_customer_person_id_idx`, `scap_capital_date_idx`,
`scap_salesperson_date_idx`), primary keys and foreign keys go with them.

### Foreign keys pointing *into* the legacy tables
Only one, and it is internal to the pair:
`customer_capital_allocations_salesperson_allocation_id_fkey`. Nothing outside the legacy
pair references either table, so the drop cannot cascade into live data.

### RLS policies (5, all on the dropped tables)
`ccap_read_privileged`, `ccap_write_privileged`, `scap_insert`, `scap_select`, `scap_update`.

### Triggers
On the dropped tables: `trg_ccap_updated`, `trg_ccap_validate_override`,
`trg_customer_capital_allocations_derive_person`, `trg_validate_cca_amounts`,
`trg_allocation_not_overridable`, `trg_scap_updated_at`, `trg_validate_sca_amounts`.

On a surviving table: **`trg_archive_prior_allocations` on `daily_capital_snapshots`** — it
only writes to the two dropped tables, so it is dropped explicitly.

### Functions (legacy-only; verified to have no other caller and no other trigger)
- `compute_salesperson_capital_allocations(uuid)`
- `compute_customer_capital_allocations(uuid)`
- `save_salesperson_capital_allocations(uuid, jsonb)`
- `save_customer_capital_allocations(uuid, jsonb)`
- `_archive_prior_allocations_on_active()`
- `_validate_allocation_amounts()`
- `enforce_allocation_not_overridable()`
- `validate_customer_capital_alloc_override()`

### Shared functions edited, not dropped
- `person_merge(uuid, uuid, text)` — drop the `'customer_capital_allocations.customer_person_id'`
  entry from its rewrite map, keeping the `_dynamic` one.
- `person_fk_drift_report()` — drop the `customer_capital_allocations` branch, keep the
  `_dynamic` branch.

Both are rebuilt from their **live** `pg_get_functiondef` output, snapshotted first into
`docs/verification/pre-280/`, per rule 2.3.

### Kept deliberately — not part of the allocation path
- `tg_credit_derive_customer_person()` and `set_updated_at()` are shared with nine and many
  other tables respectively.
- `daily_capital_snapshots` (10 rows), `daily_capital_inputs` (2 rows) and their functions
  `save_daily_capital_snapshot`, `compute_daily_capital`, `upsert_daily_capital_input`,
  `enforce_daily_capital_not_overridable`, `audit_daily_capital_*`. These hold live data, so
  rule 3 forbids dropping them, and `e2e/capital/no-override.spec.ts` asserts against
  `daily_capital_snapshots` directly. They are the capital *input/snapshot* chain, not the
  allocation path.

### `role_permissions`
No `capital` module row exists for any role — the modules are `credit`/`accounting`.
Nothing to remove. (Note for later phases: rule 2.5's `has_dynamic_permission` fallback means
a module with no row is open to everyone.)

### Navigation
Already removed. `src/lib/navigation/registry.ts:484` records that the three legacy pages were
taken out of navigation in item 141 and that `/accounting/dynamic-capital` is the single
official page.

### Frontend
No component or hook touches the legacy tables. The only remaining files are three
route stubs that `redirect` to `/accounting/dynamic-capital`:
`_app.accounting.customer-capital-allocations.tsx`,
`_app.accounting.salesperson-capital-allocations.tsx`,
`_app.accounting.daily-capital.tsx`.

**Decision: keep the three redirect stubs.** They contain no legacy implementation, they cost
nothing, and deleting them would turn existing bookmarks and deep links into 404s. The mission
asks for the legacy *path* to be removed; these files are the opposite — they are what routes
users onto the surviving path.

`src/integrations/supabase/types.ts` is generated and still declares the two dropped tables and
the four dropped functions; those declarations are removed by hand.

### e2e
- `e2e/capital/no-override.spec.ts` — its fourth case posts to
  `/rpc/save_salesperson_capital_allocations` to prove the override argument is rejected. With
  the RPC gone, PostgREST answers 404, so the assertion `status >= 400` still holds, but for the
  wrong reason. The case is rewritten to assert what is now true: the legacy RPC no longer
  exists. The other three cases are untouched and keep covering the surviving snapshot chain.
- `e2e/persons/credit-uses-person.spec.ts` — lists `customer_capital_allocations` among the
  credit tables it checks for person drift. That entry is removed; the `_dynamic` one stays.

## Found during execution, not during the survey

The first `DROP TABLE` was refused: *"policy cal_select_sales on table
capital_allocation_ledger depends on table customer_capital_allocations"*.

`capital_allocation_ledger` is **not** legacy — it is the dynamic path's ledger.
`_capital_alloc_used(text, uuid)` reads it, `v_dynamic_customer_capital_balances` and
`v_dynamic_salesperson_capital_balances` depend on that, and
`hold/consume/release/refund_capital_allocation` write it. It merely had one RLS policy left
pointing at the legacy tables:

```
cal_select_sales: sales may read ledger rows whose allocation_id is theirs
                  -- looked up in salesperson_capital_allocations / customer_capital_allocations
```

Because both legacy tables were empty, that policy had been silently granting a salesperson
**no** ledger rows at all since the dynamic path took over — rule 2.5's "RLS on SELECT never
errors, it returns zero rows". Migration 280 repoints it at
`salesperson_capital_allocations_dynamic` / `customer_capital_allocations_dynamic`, same shape
and same intent. `cal_select_admin` is untouched.

This is an **RLS widening for the `sales` role**: a salesperson can now see ledger rows for
their own dynamic allocations, which is what the policy was always meant to do. Admin,
manager and accountant access is unchanged.

## BLOCKED

Nothing. No live financial chain depends on the legacy allocation path: both tables are empty,
nothing outside the pair holds a foreign key to them, no surviving function calls the legacy
functions, and no frontend file references them.

## Backup

`docs/asan/legacy-capital-data-backup.sql` — `pg_dump --data-only` of both tables, taken before
the drop. Both `COPY` blocks are empty because both tables have zero rows; the file is kept as
evidence that the check was made rather than assumed.

`docs/verification/pre-280/legacy-capital-schema.sql` — `pg_dump --schema-only` of both tables,
which is what makes `docs/verification/280-down.sql` able to rebuild them exactly.
