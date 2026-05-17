-- AfraKala - Phase 3/B2 / Task AFRA-20260517-PURCHASE-PRICES-U02-S02
-- Safe Cloud -> LAN import of purchase price data using a staging schema and
-- explicit registered_by remapping to LAN admin.
--
-- Tables in scope (in insert order):
--   1) public.suppliers
--   2) public.price_change_reasons
--   3) public.purchase_prices
--
-- Required psql variables (-v key=value):
--   ON_ERROR_STOP=1
--   dry_run=true|false
--   lan_admin_user_id=<uuid>                -- maps all Cloud registered_by -> this LAN admin
--   suppliers_csv=<full path>
--   price_change_reasons_csv=<full path>
--   purchase_prices_csv=<full path>
--
-- Behavior:
--   * Cloud UUIDs are preserved for suppliers / reasons / purchase_prices.
--   * ON CONFLICT (id) DO NOTHING on every public.* insert.
--   * registered_by is rewritten unconditionally to :lan_admin_user_id.
--   * supplier_id / reason_id pass through (NULL stays NULL).
--   * currency cast to public.currency_code enum (toman/usd/aed seen in Cloud).
--   * Generated columns: NONE in these three tables (verified via
--     information_schema.columns where is_generated <> 'NEVER').
--   * No COMMIT or ROLLBACK here; the wrapper terminates the transaction.
--   * dry_run=true -> all writes are skipped via WHERE :'dry_run' = 'false',
--     and the wrapper issues ROLLBACK at the end. public.* untouched.

\set ON_ERROR_STOP on

BEGIN;

-- --- 0) Preflight ----------------------------------------------------------
DROP TABLE IF EXISTS _import_params;
CREATE TEMP TABLE _import_params (
  lan_admin_user_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _import_params (lan_admin_user_id)
VALUES (:'lan_admin_user_id'::uuid);

DO $preflight$
DECLARE
  v_admin uuid;
BEGIN
  SELECT lan_admin_user_id INTO v_admin FROM _import_params;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'lan_admin_user_id is required - abort import';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin) THEN
    RAISE EXCEPTION 'LAN admin user % not found - abort import', v_admin;
  END IF;
END
$preflight$;

-- --- 1) Staging schema and raw tables --------------------------------------
CREATE SCHEMA IF NOT EXISTS _staging_import;

DROP TABLE IF EXISTS _staging_import.suppliers_raw;
DROP TABLE IF EXISTS _staging_import.price_change_reasons_raw;
DROP TABLE IF EXISTS _staging_import.purchase_prices_raw;
DROP TABLE IF EXISTS _staging_import.registered_by_map;

CREATE TABLE _staging_import.suppliers_raw (
  id uuid, name text, phone text, email text, address text,
  contact_name text, city text, notes text, trust_level text,
  is_active boolean, status text, created_by uuid,
  created_at timestamptz, updated_at timestamptz
);

CREATE TABLE _staging_import.price_change_reasons_raw (
  id uuid, title text, description text, is_active boolean,
  created_at timestamptz, updated_at timestamptz
);

CREATE TABLE _staging_import.purchase_prices_raw (
  id uuid, product_id uuid, supplier_id uuid,
  purchase_price numeric,
  currency text,                  -- text in staging; cast to enum on insert
  effective_at timestamptz, expires_at timestamptz,
  reason_id uuid, private_note text,
  registered_by uuid,             -- ignored for insert; rewritten to LAN admin
  is_active boolean,
  created_at timestamptz, updated_at timestamptz
);

-- --- 2) Load CSVs ----------------------------------------------------------
\copy _staging_import.suppliers_raw            FROM :'suppliers_csv'            WITH (FORMAT csv, HEADER true)
\copy _staging_import.price_change_reasons_raw FROM :'price_change_reasons_csv' WITH (FORMAT csv, HEADER true)
\copy _staging_import.purchase_prices_raw      FROM :'purchase_prices_csv'      WITH (FORMAT csv, HEADER true)

-- --- 3) registered_by mapping (all Cloud registrars -> LAN admin) ----------
CREATE TABLE _staging_import.registered_by_map AS
SELECT DISTINCT registered_by AS cloud_user_id,
       :'lan_admin_user_id'::uuid AS lan_user_id
FROM _staging_import.purchase_prices_raw
WHERE registered_by IS NOT NULL;

-- --- 4) Staging counts -----------------------------------------------------
\echo '-- staging row counts --'
SELECT 'suppliers_raw'             AS t, count(*) FROM _staging_import.suppliers_raw
UNION ALL SELECT 'price_change_reasons_raw', count(*) FROM _staging_import.price_change_reasons_raw
UNION ALL SELECT 'purchase_prices_raw',      count(*) FROM _staging_import.purchase_prices_raw
UNION ALL SELECT 'registered_by_map',        count(*) FROM _staging_import.registered_by_map;

-- --- 5) Orphan / consistency checks ----------------------------------------
\echo '-- orphan checks --'
SELECT 'purchase_prices.product_id missing in LAN public.products' AS check, count(*)
FROM _staging_import.purchase_prices_raw pp
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pp.product_id);

SELECT 'purchase_prices.supplier_id not in LAN suppliers and not in incoming suppliers' AS check, count(*)
FROM _staging_import.purchase_prices_raw pp
WHERE pp.supplier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM _staging_import.suppliers_raw s WHERE s.id = pp.supplier_id)
  AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = pp.supplier_id);

SELECT 'purchase_prices.reason_id not in LAN reasons and not in incoming reasons' AS check, count(*)
FROM _staging_import.purchase_prices_raw pp
WHERE pp.reason_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM _staging_import.price_change_reasons_raw r WHERE r.id = pp.reason_id)
  AND NOT EXISTS (SELECT 1 FROM public.price_change_reasons r WHERE r.id = pp.reason_id);

SELECT 'purchase_prices.registered_by without a map row' AS check, count(*)
FROM _staging_import.purchase_prices_raw pp
LEFT JOIN _staging_import.registered_by_map m ON m.cloud_user_id = pp.registered_by
WHERE pp.registered_by IS NOT NULL AND m.cloud_user_id IS NULL;

\echo '-- LAN price_change_reasons rows that share id with incoming (compare titles) --'
SELECT lan.id, lan.title AS lan_title, inc.title AS incoming_title
FROM public.price_change_reasons lan
JOIN _staging_import.price_change_reasons_raw inc ON inc.id = lan.id;

\echo '-- LAN price_change_reasons rows whose id is NOT in incoming (left untouched) --'
SELECT lan.id, lan.title AS lan_title
FROM public.price_change_reasons lan
LEFT JOIN _staging_import.price_change_reasons_raw inc ON inc.id = lan.id
WHERE inc.id IS NULL;

-- --- 6) Currency enum validation -------------------------------------------
DO $enum_check$
DECLARE
  bad_currency int;
  sample_cur text;
BEGIN
  SELECT count(*), min(currency)
    INTO bad_currency, sample_cur
  FROM _staging_import.purchase_prices_raw
  WHERE currency IS NULL
     OR currency NOT IN (
          SELECT unnest(enum_range(NULL::public.currency_code))::text
        );
  IF bad_currency > 0 THEN
    RAISE EXCEPTION
      'purchase_prices_raw has % rows with invalid/NULL currency (e.g. %)',
      bad_currency, sample_cur;
  END IF;
END
$enum_check$;

-- --- 7) Conditional real insert (only when dry_run=false) ------------------
\if :{?dry_run}
\else
  \set dry_run true
\endif

SELECT CASE WHEN :'dry_run' = 'false'
            THEN '-- INSERTING into public.* (ON CONFLICT DO NOTHING) --'
            ELSE '-- DRY RUN -- no rows inserted, no COMMIT --'
       END AS mode;

-- 7a) suppliers: id preserved
INSERT INTO public.suppliers (
  id, name, phone, email, address, contact_name, city, notes, trust_level,
  is_active, status, created_by, created_at, updated_at
)
SELECT
  s.id, s.name, s.phone, s.email, s.address, s.contact_name, s.city, s.notes, s.trust_level,
  s.is_active, s.status,
  :'lan_admin_user_id'::uuid,                 -- created_by rewritten to LAN admin
  s.created_at, s.updated_at
FROM _staging_import.suppliers_raw s
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- 7b) price_change_reasons: insert only ids NOT already present in LAN.
--     LAN rows are NEVER overwritten in this script (corrupted titles are
--     handled by a separate, U01-approved cleanup step if needed).
INSERT INTO public.price_change_reasons (
  id, title, description, is_active, created_at, updated_at
)
SELECT r.id, r.title, r.description, r.is_active, r.created_at, r.updated_at
FROM _staging_import.price_change_reasons_raw r
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- 7c) purchase_prices: registered_by remapped, currency cast to enum
INSERT INTO public.purchase_prices (
  id, product_id, supplier_id, purchase_price, currency,
  effective_at, expires_at, reason_id, private_note,
  registered_by, is_active, created_at, updated_at
)
SELECT
  pp.id, pp.product_id, pp.supplier_id, pp.purchase_price,
  pp.currency::public.currency_code,
  pp.effective_at, pp.expires_at, pp.reason_id, pp.private_note,
  :'lan_admin_user_id'::uuid,                 -- registered_by rewritten to LAN admin
  pp.is_active, pp.created_at, pp.updated_at
FROM _staging_import.purchase_prices_raw pp
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- --- 8) Post-insert verification (unchanged in dry-run) --------------------
\echo '-- public.* counts after step (unchanged in dry-run) --'
SELECT 'public.suppliers'             AS t, count(*) FROM public.suppliers
UNION ALL SELECT 'public.price_change_reasons', count(*) FROM public.price_change_reasons
UNION ALL SELECT 'public.purchase_prices',      count(*) FROM public.purchase_prices;

\echo '-- purchase_prices product coverage --'
SELECT count(DISTINCT product_id) AS distinct_products_with_pp FROM public.purchase_prices;

\echo '-- sample 10 purchase_prices joined to product/supplier/reason --'
SELECT pp.id, p.name AS product, s.name AS supplier, r.title AS reason,
       pp.purchase_price, pp.currency, pp.effective_at
FROM public.purchase_prices pp
LEFT JOIN public.products p             ON p.id = pp.product_id
LEFT JOIN public.suppliers s            ON s.id = pp.supplier_id
LEFT JOIN public.price_change_reasons r ON r.id = pp.reason_id
ORDER BY pp.created_at DESC NULLS LAST
LIMIT 10;

-- NOTE: this script does NOT issue COMMIT or ROLLBACK. The wrapper decides:
--   dry_run=true  -> wrapper sends ROLLBACK (no public.* change at all)
--   dry_run=false -> wrapper sends COMMIT on success, ROLLBACK on any error