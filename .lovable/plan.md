## AFRA-20260517-PRODUCTS-U02-S02 — Correction Plan

### Root cause (confirmed from LAN schema)

Staging table `_staging_import.products_raw` holds three columns as `text`, but `public.products` declares them as ENUM types. PostgreSQL does not implicitly coerce `text → enum`, so the INSERT fails with:

```
ERROR: column "product_type" is of type product_type but expression is of type text
```

### Exact enum types in LAN (verified via pg_type / information_schema)

| products column | LAN data type    | Valid labels                                       |
|-----------------|------------------|----------------------------------------------------|
| `product_type`  | `product_type`   | `iranian`, `foreign`                               |
| `stock_status`  | `stock_status`   | `available`, `unavailable`, `limited`, `unknown`   |
| `status`        | `product_status` | `active`, `inactive`, `discontinued`               |

### Files to change

- `deploy/migration/sql/import-products-staged.sql` — **only this file**.

No other file changes. No schema changes outside `_staging_import`. No Auth/RBAC/RLS changes. No mapping changes.

### Change 1 — Cast the three enum columns in the `public.products` INSERT

In the `SELECT` block feeding `INSERT INTO public.products` (currently lines 210–217), replace:

```sql
p.product_type, p.base_currency, p.stock_status, p.status,
```

with:

```sql
p.product_type::public.product_type,
p.base_currency,
p.stock_status::public.stock_status,
p.status::public.product_status,
```

`base_currency` stays as-is (it is `text` in LAN; only the three real enums are cast).

### Change 2 — Pre-insert enum validation (runs in dry-run too)

Add a new validation block right after the existing `-- orphan checks --` section and before `-- 6) Conditional real insert --`. It runs unconditionally (no `WHERE :'dry_run' = 'false'`), so any invalid CSV value fails the dry-run loudly instead of waiting until a real run.

```sql
\echo '-- enum validation (fails dry-run on any invalid label) --'
DO $enum_check$
DECLARE
  bad_product_type  int;
  bad_stock_status  int;
  bad_status        int;
  sample_pt text;
  sample_ss text;
  sample_st text;
BEGIN
  SELECT count(*), min(product_type)
    INTO bad_product_type, sample_pt
  FROM _staging_import.products_raw
  WHERE product_type IS NOT NULL
    AND product_type NOT IN (
      SELECT unnest(enum_range(NULL::public.product_type))::text
    );

  SELECT count(*), min(stock_status)
    INTO bad_stock_status, sample_ss
  FROM _staging_import.products_raw
  WHERE stock_status IS NOT NULL
    AND stock_status NOT IN (
      SELECT unnest(enum_range(NULL::public.stock_status))::text
    );

  SELECT count(*), min(status)
    INTO bad_status, sample_st
  FROM _staging_import.products_raw
  WHERE status IS NOT NULL
    AND status NOT IN (
      SELECT unnest(enum_range(NULL::public.product_status))::text
    );

  IF bad_product_type > 0 THEN
    RAISE EXCEPTION
      'products_raw has % rows with invalid product_type (e.g. %)',
      bad_product_type, sample_pt;
  END IF;
  IF bad_stock_status > 0 THEN
    RAISE EXCEPTION
      'products_raw has % rows with invalid stock_status (e.g. %)',
      bad_stock_status, sample_ss;
  END IF;
  IF bad_status > 0 THEN
    RAISE EXCEPTION
      'products_raw has % rows with invalid status (e.g. %)',
      bad_status, sample_st;
  END IF;
END
$enum_check$;
```

This satisfies requirement #2 (“If any value in CSV is not a valid enum value, fail clearly during dry-run”). Because validation lives outside the conditional insert and the wrapper still issues `ROLLBACK` for dry-run, nothing in `public.*` changes.

### What this plan does NOT change

- No change to mappings (Cloud computed prices → LAN `cash_price`; Cloud users → LAN admin).
- No change to `purchase_price_id` / `pricing_rule_id` handling.
- No change to dry-run default (still `true`).
- No new psql variables.
- No change to PowerShell wrapper `deploy/lan/scripts/import-products-staged.ps1`.
- No real import is executed at any point. Wrapper continues to send `ROLLBACK` in dry-run.

### Exact dry-run command (unchanged)

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\lan\scripts\import-products-staged.ps1" `
  -StagingDir "C:\afra\dumps\products-20260517" `
  -UseDocker `
  -DbContainerName "afrakala-lan-db"
```

### Verification expected after correction

1. `COPY` counts unchanged: brands=27, categories=9, products=168, pcp=531; `pcp_dedup=123`.
2. Orphan checks all return 0.
3. New `-- enum validation --` block prints; if every CSV value is valid, it prints nothing extra and proceeds; otherwise dry-run aborts with a clear Persian-readable message naming the column and a sample bad value.
4. `-- DRY RUN -- no rows inserted, no COMMIT --` is printed.
5. Post-step `public.* counts` still show 0/0/0/0.
6. Wrapper sends `ROLLBACK`; `_staging_import` schema disappears with the transaction.

### Stop conditions

- If the validation block reports an invalid label, do NOT proceed to real import. Either fix the source CSV at Cloud side or extend the LAN enum via a separate, approved migration. Plan does NOT silently coalesce unknown values.
- If the cast still errors on a row that passed validation (extremely unlikely), stop and report the row id; do not retry.

### Remaining risks

- `enum_range` requires the target enums to exist in LAN; verified present (`product_type`, `stock_status`, `product_status`).
- If Cloud later adds a new enum label that LAN does not have, dry-run will fail loudly — this is the intended behavior, not a regression.
- Casts assume the staging text is trimmed and lowercase as exported. The current CSVs already match (we listed labels from `pg_enum`); the validation block makes any future drift visible.
- No data loss risk: dry-run path still does zero writes; real-run still uses `ON CONFLICT (id) DO NOTHING`.

### Self-host acceptance

- Linux + Docker + Supabase Self-host compatible (script and SQL only).
- Idempotent on rerun (staging tables are dropped/recreated; public inserts are ON CONFLICT DO NOTHING).
- No secrets touched. No CDN / external dependency.
- Reversible: change is in a one-shot import script; no LAN schema state changes.

Please approve to switch to Agent mode and apply only the two changes above to `deploy/migration/sql/import-products-staged.sql`.
