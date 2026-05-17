
# Plan — AFRA-20260517-PURCHASE-PRICES-U02-S01 (Plan only)

## 1. Read-only Cloud inventory (live)

| Table | Rows |
|---|---|
| `purchase_prices` | **306** |
| `suppliers` | 5 |
| `product_suppliers` | 13 |
| `price_change_reasons` | 6 |
| `pricing_rules` | 15 |

`purchase_prices` distribution:
- supplier_id: **259 NULL / 47 set**
- reason_id: **176 NULL / 130 set**
- registered_by: **0 NULL / 306 set** — all rows have a registrar
- product_id: 129 distinct products; **0 orphans** vs Cloud `products`
- registrars (3 distinct): `b0a88a0e…` (263), `a13bbeb7…` (36), `aae63931…` (7)

`suppliers` referenced by purchase_prices (47 non-null rows): need to confirm the exact 3 used out of the 5 below.

| Cloud supplier | status | active |
|---|---|---|
| `fe99bd7c…` حاج حسن امین زاده | active | t |
| `bbb456fa…` مختار شاهمرادی | active | t |
| `fd5bb872…` ایوب احمدی | active | t |
| `866fffbb…` Farshid Soofizadeh | active | t |
| `4ba1a0ed…` محمدرضا افرا | pending | t |

`price_change_reasons` (6): تغییر نرخ ارز, اصلاح اشتباه, تغییر قیمت تأمین‌کننده, تغییر شرایط بازار, تغییر سیاست سود, تغییر هزینه حمل. All clean Persian titles, no test data. Mappable by title.

`pricing_rules` (15): heterogeneous business rules with `created_by`, `category_id`, `brand_id`, `settlement_type_id`, `sale_price_type_id` FKs. Several appear duplicated/dev (e.g., two rows named "پیش واریز", multiple "تسویه N روزه" with `is_active=f`). LAN almost certainly has its own canonical pricing_rules.

## 2. Decisions (proposed for U01 approval)

| # | Question | Decision |
|---|---|---|
| 1 | Import `purchase_prices` before suppliers/persons? | **Yes**, with sub-step 2a importing the 3–5 referenced suppliers first. Persons not required for this bundle. |
| 2 | Set `supplier_id = NULL` if suppliers deferred? | **Allowed by schema** (259 of 306 are already NULL). Acceptable fallback if any Cloud supplier collides with LAN. Default plan keeps the 47 non-null links via mapping. |
| 3 | Map `registered_by` to LAN admin? | **Yes — R2 mapping**: 3 Cloud uuids → 3 specific LAN profile uuids that U01 supplies. If U01 cannot provide all three, fall back to **R1**: all → single LAN "import admin" uuid. Schema allows NULL (R3) but loses attribution and is rejected. |
| 4 | Import `price_change_reasons` or map? | **Map by `title`**. For each Cloud row: if a LAN row with the same title exists, reuse LAN id; otherwise insert with Cloud id preserved. No row is deleted. |
| 5 | Import `pricing_rules` or use LAN canonical? | **Use LAN canonical**. Cloud pricing_rules look dev/duplicated. Do NOT migrate. This bundle does not need pricing_rules; they only matter when `product_computed_prices` is rebuilt (Phase 6 of master plan). |
| 6 | Relink `product_computed_prices.purchase_price_id`? | **Preserve Cloud uuids** on import (`INSERT … ON CONFLICT (id) DO NOTHING`). Because the smoke-test pcp rows already store Cloud purchase_price uuids, no UPDATE is needed — they will resolve automatically. Verification query in §6 confirms zero broken FKs after import. Recommended longer-term: rebuild pcp via recompute worker in master Phase 6. |

## 3. Bundle contents

**Included in first purchase-price bundle (this task's future Agent run):**
- `suppliers` — only the subset actually referenced by `purchase_prices` (expected 3 of 5; confirm via Cloud preflight)
- `price_change_reasons` — only titles missing on LAN
- `purchase_prices` — all 306 rows

**Excluded (deferred):**
- `product_suppliers` (13) — needs persons/supplier-product relationship review; goes with Phase 3 of master plan
- `pricing_rules` (15) — LAN canonical
- `persons` / `customers` / `profiles` / `auth.users`
- `product_computed_prices` rebuild (Phase 6)

## 4. Staging schema design (LAN, read+write only by service role)

```sql
CREATE SCHEMA IF NOT EXISTS staging_pp;

-- Raw Cloud snapshots (loaded via COPY from CSV)
CREATE TABLE staging_pp.suppliers_cloud           (LIKE public.suppliers           INCLUDING ALL);
CREATE TABLE staging_pp.price_change_reasons_cloud(LIKE public.price_change_reasons INCLUDING ALL);
CREATE TABLE staging_pp.purchase_prices_cloud     (LIKE public.purchase_prices     INCLUDING ALL);

-- Mapping tables (built during dry-run)
CREATE TABLE staging_pp.map_supplier (cloud_id uuid PRIMARY KEY, lan_id uuid NOT NULL, strategy text NOT NULL);
CREATE TABLE staging_pp.map_reason   (cloud_id uuid PRIMARY KEY, lan_id uuid NOT NULL, strategy text NOT NULL);
CREATE TABLE staging_pp.map_user     (cloud_id uuid PRIMARY KEY, lan_id uuid NOT NULL, strategy text NOT NULL);

-- Final remapped purchase_prices (built from purchase_prices_cloud + maps)
CREATE TABLE staging_pp.purchase_prices_remapped  (LIKE public.purchase_prices    INCLUDING ALL);
```

All staging artifacts live in `staging_pp` and are dropped after successful real-run + retention window.

## 5. Mapping tables to capture before Agent run

U02 must collect these from LAN and post in the next Agent task:

```sql
-- LAN preflight
SELECT id, name FROM public.suppliers
WHERE name IN ('حاج حسن امین زاده','مختارشاهمرادی','ایوب احمدی',
               'Farshid Soofizadeh','محمدرضا افرا');

SELECT id, title FROM public.price_change_reasons;

SELECT id, email FROM auth.users
WHERE email IN (<emails for the 3 Cloud registrar uuids — U01 to provide>);

SELECT count(*) AS lan_pp_existing FROM public.purchase_prices;
SELECT id, product_id, effective_at FROM public.purchase_prices
  WHERE product_id IN (<sample of Cloud product_ids>) LIMIT 50;
```

Results feed `map_supplier`, `map_reason`, `map_user`.

## 6. Dry-run verification (LAN, against staging)

```sql
-- 6.1 No orphan product references
SELECT count(*) AS orphan_product
FROM staging_pp.purchase_prices_cloud pp
LEFT JOIN public.products p ON p.id = pp.product_id
WHERE p.id IS NULL;                                  -- must be 0

-- 6.2 Every non-null supplier_id has a map row
SELECT count(*) AS unmapped_supplier
FROM staging_pp.purchase_prices_cloud pp
LEFT JOIN staging_pp.map_supplier m ON m.cloud_id = pp.supplier_id
WHERE pp.supplier_id IS NOT NULL AND m.cloud_id IS NULL;  -- must be 0

-- 6.3 Every non-null reason_id has a map row
SELECT count(*) AS unmapped_reason
FROM staging_pp.purchase_prices_cloud pp
LEFT JOIN staging_pp.map_reason m ON m.cloud_id = pp.reason_id
WHERE pp.reason_id IS NOT NULL AND m.cloud_id IS NULL;    -- must be 0

-- 6.4 Every registered_by has a map row
SELECT count(*) AS unmapped_user
FROM staging_pp.purchase_prices_cloud pp
LEFT JOIN staging_pp.map_user m ON m.cloud_id = pp.registered_by
WHERE m.cloud_id IS NULL;                                  -- must be 0

-- 6.5 Remapped count equals source count
SELECT count(*) FROM staging_pp.purchase_prices_remapped;  -- must equal 306

-- 6.6 No id collision with LAN
SELECT count(*) AS id_collision
FROM staging_pp.purchase_prices_remapped r
JOIN public.purchase_prices p ON p.id = r.id;              -- must be 0

-- 6.7 No (product_id, effective_at) duplicate vs LAN
SELECT count(*) AS dup_business_key
FROM staging_pp.purchase_prices_remapped r
JOIN public.purchase_prices p
  ON p.product_id = r.product_id AND p.effective_at = r.effective_at;  -- must be 0

-- 6.8 Post-import smoke (predict): pcp FK resolution
SELECT count(*) AS broken_pcp_after_import
FROM public.product_computed_prices pcp
LEFT JOIN staging_pp.purchase_prices_remapped r ON r.id = pcp.purchase_price_id
LEFT JOIN public.purchase_prices p ON p.id = pcp.purchase_price_id
WHERE pcp.purchase_price_id IS NOT NULL
  AND r.id IS NULL AND p.id IS NULL;                       -- must be 0
```

Every check must return 0 / 306 as noted. Any miss = HALT.

## 7. Real-run (single transaction, after U01 approval — NOT part of this task)

```sql
BEGIN;
-- Suppliers (only referenced ones, id preserved)
INSERT INTO public.suppliers (...)
SELECT ... FROM staging_pp.suppliers_cloud
WHERE id IN (SELECT DISTINCT supplier_id FROM staging_pp.purchase_prices_cloud WHERE supplier_id IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

-- Reasons (only titles missing on LAN; id preserved when inserting)
INSERT INTO public.price_change_reasons (id, title, description, is_active, created_at, updated_at)
SELECT c.id, c.title, c.description, c.is_active, c.created_at, c.updated_at
FROM staging_pp.price_change_reasons_cloud c
LEFT JOIN public.price_change_reasons l ON l.title = c.title
WHERE l.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Purchase prices (remapped)
INSERT INTO public.purchase_prices (...)
SELECT ... FROM staging_pp.purchase_prices_remapped
ON CONFLICT (id) DO NOTHING;

-- Sanity checks inside same tx (raise + rollback if off)
COMMIT;
```

## 8. Post-run verification

```sql
SELECT count(*) FROM public.purchase_prices;                    -- prior + 306
SELECT count(*) FROM public.purchase_prices WHERE supplier_id IS NOT NULL;  -- expect 47
SELECT count(DISTINCT product_id) FROM public.purchase_prices;  -- expect prior_distinct + 129 (minus overlap)
SELECT count(*) FROM public.product_computed_prices pcp
LEFT JOIN public.purchase_prices p ON p.id = pcp.purchase_price_id
WHERE pcp.purchase_price_id IS NOT NULL AND p.id IS NULL;       -- must be 0
```

Functional smoke: open the LAN pricing workbench for 3 random products; confirm purchase price history shows imported rows; confirm recompute worker runs without errors.

## 9. Rollback plan

- Snapshot LAN with `deploy/backups/scripts/backup-postgres.sh` immediately before real-run (mandatory).
- Tagged delete inside a single window if anything goes wrong:
  ```sql
  -- Capture import window timestamp BEFORE real-run as a constant.
  DELETE FROM public.purchase_prices       WHERE id IN (SELECT id FROM staging_pp.purchase_prices_remapped);
  DELETE FROM public.price_change_reasons  WHERE id IN (SELECT id FROM staging_pp.price_change_reasons_cloud)
                                             AND id NOT IN (<LAN canonical ids>);
  DELETE FROM public.suppliers             WHERE id IN (SELECT id FROM staging_pp.suppliers_cloud)
                                             AND id NOT IN (<LAN canonical ids>);
  ```
- If anything more complex, restore from the full backup taken in step preflight.

## 10. Stop conditions

- `orphan_product`, `unmapped_*`, `id_collision`, or `dup_business_key` > 0 in §6.
- Any of the 3 Cloud suppliers has the **same name on LAN with a different uuid** → escalate to U01 (merge to LAN id or skip; do not duplicate).
- LAN already has `purchase_prices` rows for the same `(product_id, effective_at)` as Cloud → escalate.
- `auth.users` mapping for `registered_by` incomplete and R1/R3 fallback not approved.
- LAN backup verification fails.

## 11. Required U01 approvals before any Agent execution

1. Confirm bundle scope per §3 (suppliers + reasons + purchase_prices; exclude product_suppliers + pricing_rules).
2. Provide the 3 LAN profile uuids for the `registered_by` map (R2). Otherwise authorize R1 fallback to a named LAN admin uuid.
3. Authorize keeping Cloud uuids for inserted rows (`ON CONFLICT (id) DO NOTHING`) instead of regenerating ids — required for §6.8 to hold without an UPDATE on `product_computed_prices`.
4. Confirm decision to **not** migrate `pricing_rules` (LAN canonical wins) and to defer `product_computed_prices` rebuild to master Phase 6.
5. Authorize LAN full backup + freeze window for the real-run.

## 12. Next step

- U02: run §5 LAN preflight queries on LAN host and post results.
- U01: respond to the five approvals in §11.
- Only then: open `AFRA-20260517-PURCHASE-PRICES-U02-S02` in Agent mode to execute Cloud export → staging load → dry-run → real-run → verification.

No files were edited and no SQL was executed against either Cloud or LAN in this task.
