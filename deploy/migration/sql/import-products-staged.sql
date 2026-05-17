-- AfraKala - Phase 3 / Task AFRA-20260517-PRODUCTS-U02-S02 (Corrected)
-- Safe Cloud -> LAN import of products using a staging schema and explicit mapping.
--
-- Run on LAN (target). Required psql variables (-v key=value):
--   ON_ERROR_STOP=1
--   dry_run=true|false
--   lan_cash_price_id=<uuid>
--   lan_admin_user_id=<uuid>
--   brands_csv=<full path to brands.csv>
--   categories_csv=<full path to categories.csv>
--   products_csv=<full path to products.csv>
--   product_computed_prices_csv=<full path to product_computed_prices.csv>
--
-- This file:
--   1) Creates the _staging_import schema and raw tables.
--   2) Loads CSV files via \copy using explicit per-file psql variables
--      (Windows-safe; no path concatenation, no glob).
--   3) Builds price_type_map and created_by_map.
--   4) Runs preflight without using :variables inside a dollar-quoted block.
--      psql variable substitution does not happen inside $$...$$, so the IDs
--      are first persisted in a TEMP table (substitution works in INSERT),
--      then the DO block reads them via plpgsql.
--   5) When dry_run=true the script does NOT touch any public.* table and
--      the wrapper rolls back at the end. No commit happens here.
--   6) When dry_run=false rows are inserted into public.* with
--      ON CONFLICT (id) DO NOTHING. COMMIT/ROLLBACK is decided by wrapper.

\set ON_ERROR_STOP on

BEGIN;

-- --- 0) Preflight (psql-safe; no :variable inside dollar-quoted block) -----
DROP TABLE IF EXISTS _import_params;
CREATE TEMP TABLE _import_params (
  lan_admin_user_id uuid NOT NULL,
  lan_cash_price_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _import_params (lan_admin_user_id, lan_cash_price_id)
VALUES (:'lan_admin_user_id'::uuid, :'lan_cash_price_id'::uuid);

DO $preflight$
DECLARE
  v_admin uuid;
  v_price uuid;
BEGIN
  SELECT lan_admin_user_id, lan_cash_price_id
    INTO v_admin, v_price
  FROM _import_params;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'lan_admin_user_id is required - abort import';
  END IF;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'lan_cash_price_id is required - abort import';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin) THEN
    RAISE EXCEPTION 'LAN admin user % not found - abort import', v_admin;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_price_types WHERE id = v_price) THEN
    RAISE EXCEPTION 'LAN cash_price sale_price_type % not found - abort import', v_price;
  END IF;
END
$preflight$;

-- --- 1) Staging schema and raw tables --------------------------------------
CREATE SCHEMA IF NOT EXISTS _staging_import;

DROP TABLE IF EXISTS _staging_import.brands_raw;
DROP TABLE IF EXISTS _staging_import.categories_raw;
DROP TABLE IF EXISTS _staging_import.products_raw;
DROP TABLE IF EXISTS _staging_import.product_computed_prices_raw;
DROP TABLE IF EXISTS _staging_import.product_computed_prices_dedup;
DROP TABLE IF EXISTS _staging_import.price_type_map;
DROP TABLE IF EXISTS _staging_import.created_by_map;

CREATE TABLE _staging_import.brands_raw (
  id uuid, name text, slug text, description text,
  is_active boolean, created_at timestamptz, updated_at timestamptz
);

CREATE TABLE _staging_import.categories_raw (
  id uuid, name text, slug text, parent_id uuid, description text,
  is_active boolean, created_at timestamptz, updated_at timestamptz,
  naming_template text, primary_spec_label text
);

CREATE TABLE _staging_import.products_raw (
  id uuid, sku text, name text, description text, unit text,
  category text, is_active boolean, created_by uuid,
  created_at timestamptz, updated_at timestamptz,
  brand_id uuid, category_id uuid, product_type text, base_currency text,
  stock_status text, status text, technical_notes text, updated_by uuid,
  color text, capacity text, model text, primary_spec text, dedup_key text
);

CREATE TABLE _staging_import.product_computed_prices_raw (
  id uuid, product_id uuid, sale_price_type_id uuid,
  purchase_price_id uuid, pricing_rule_id uuid,
  input_purchase_price numeric, input_currency text,
  currency_rate numeric, purchase_price_toman numeric,
  shipping_cost numeric, margin_amount numeric,
  final_sale_price numeric, rounded_sale_price numeric,
  computed_at timestamptz, computed_by uuid, source text
);

-- --- 2) Load CSVs via explicit per-file variables (Windows-safe) -----------
\copy _staging_import.brands_raw                  FROM :'brands_csv'                  WITH (FORMAT csv, HEADER true)
\copy _staging_import.categories_raw              FROM :'categories_csv'              WITH (FORMAT csv, HEADER true)
\copy _staging_import.products_raw                FROM :'products_csv'                WITH (FORMAT csv, HEADER true)
\copy _staging_import.product_computed_prices_raw FROM :'product_computed_prices_csv' WITH (FORMAT csv, HEADER true)

-- --- 3) Mapping tables -----------------------------------------------------
CREATE TABLE _staging_import.price_type_map AS
SELECT DISTINCT
  sale_price_type_id AS cloud_sale_price_type_id,
  :'lan_cash_price_id'::uuid AS lan_sale_price_type_id
FROM _staging_import.product_computed_prices_raw;

CREATE TABLE _staging_import.created_by_map AS
SELECT DISTINCT cloud_user_id, :'lan_admin_user_id'::uuid AS lan_user_id
FROM (
  SELECT created_by AS cloud_user_id FROM _staging_import.products_raw WHERE created_by IS NOT NULL
  UNION
  SELECT updated_by FROM _staging_import.products_raw WHERE updated_by IS NOT NULL
  UNION
  SELECT computed_by FROM _staging_import.product_computed_prices_raw WHERE computed_by IS NOT NULL
) u;

-- --- 4) Dedupe product_computed_prices -------------------------------------
-- All Cloud sale_price_type_id values are mapped to LAN cash_price, so each
-- product collapses to a single row. Deterministic pick: latest computed_at,
-- then id as tie-breaker (computed_at is NOT NULL in the source).
CREATE TABLE _staging_import.product_computed_prices_dedup AS
SELECT DISTINCT ON (product_id)
  id, product_id,
  :'lan_cash_price_id'::uuid AS sale_price_type_id,
  NULL::uuid AS purchase_price_id,    -- purchase_prices not in this bundle
  NULL::uuid AS pricing_rule_id,      -- pricing_rules not in this bundle
  input_purchase_price, input_currency, currency_rate, purchase_price_toman,
  shipping_cost, margin_amount, final_sale_price, rounded_sale_price,
  computed_at,
  :'lan_admin_user_id'::uuid AS computed_by,
  source
FROM _staging_import.product_computed_prices_raw
ORDER BY product_id, computed_at DESC, id;

-- --- 5) Verification counters (always printed) -----------------------------
\echo '-- staging row counts --'
SELECT 'brands_raw'                           AS t, count(*) FROM _staging_import.brands_raw
UNION ALL SELECT 'categories_raw',                    count(*) FROM _staging_import.categories_raw
UNION ALL SELECT 'products_raw',                      count(*) FROM _staging_import.products_raw
UNION ALL SELECT 'pcp_raw',                           count(*) FROM _staging_import.product_computed_prices_raw
UNION ALL SELECT 'pcp_dedup (= distinct products)',   count(*) FROM _staging_import.product_computed_prices_dedup;

\echo '-- orphan checks --'
SELECT 'products with brand_id missing in incoming brands' AS check, count(*)
FROM _staging_import.products_raw p
WHERE p.brand_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM _staging_import.brands_raw b WHERE b.id = p.brand_id)
  AND NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.id = p.brand_id);

SELECT 'products with category_id missing in incoming categories' AS check, count(*)
FROM _staging_import.products_raw p
WHERE p.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM _staging_import.categories_raw c WHERE c.id = p.category_id)
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = p.category_id);

SELECT 'pcp_dedup rows whose product is missing from products_raw' AS check, count(*)
FROM _staging_import.product_computed_prices_dedup d
WHERE NOT EXISTS (SELECT 1 FROM _staging_import.products_raw p WHERE p.id = d.product_id);

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

-- --- 6) Conditional real insert (only when dry_run=false) ------------------
-- Default to "true" if the variable was not provided.
\if :{?dry_run}
\else
  \set dry_run true
\endif

SELECT CASE WHEN :'dry_run' = 'false'
            THEN '-- INSERTING into public.* (ON CONFLICT DO NOTHING) --'
            ELSE '-- DRY RUN -- no rows inserted, no COMMIT --'
       END AS mode;

-- IMPORTANT: in dry-run we skip all writes via WHERE :'dry_run' = 'false'.
-- The wrapper then issues ROLLBACK so even staging tables disappear.

INSERT INTO public.brands (id, name, slug, description, is_active, created_at, updated_at)
SELECT id, name, slug, description, is_active, created_at, updated_at
FROM _staging_import.brands_raw
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories
  (id, name, slug, parent_id, description, is_active,
   created_at, updated_at, naming_template, primary_spec_label)
SELECT id, name, slug, parent_id, description, is_active,
       created_at, updated_at, naming_template, primary_spec_label
FROM _staging_import.categories_raw
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (
  id, sku, name, description, unit, category, is_active,
  created_by, created_at, updated_at, brand_id, category_id,
  product_type, base_currency, stock_status, status,
  technical_notes, updated_by, color, capacity, model,
  primary_spec, dedup_key
)
SELECT
  p.id, p.sku, p.name, p.description, p.unit, p.category, p.is_active,
  :'lan_admin_user_id'::uuid,
  p.created_at, p.updated_at, p.brand_id, p.category_id,
  p.product_type::public.product_type,
  p.base_currency,
  p.stock_status::public.stock_status,
  p.status::public.product_status,
  p.technical_notes,
  :'lan_admin_user_id'::uuid,
  p.color, p.capacity, p.model, p.primary_spec, p.dedup_key
FROM _staging_import.products_raw p
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_computed_prices (
  id, product_id, sale_price_type_id, purchase_price_id, pricing_rule_id,
  input_purchase_price, input_currency, currency_rate, purchase_price_toman,
  shipping_cost, margin_amount, final_sale_price, rounded_sale_price,
  computed_at, computed_by, source
)
SELECT id, product_id, sale_price_type_id, purchase_price_id, pricing_rule_id,
       input_purchase_price, input_currency, currency_rate, purchase_price_toman,
       shipping_cost, margin_amount, final_sale_price, rounded_sale_price,
       computed_at, computed_by, source
FROM _staging_import.product_computed_prices_dedup
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- --- 7) Post-insert verification ------------------------------------------
\echo '-- public.* counts after step (unchanged in dry-run) --'
SELECT 'public.brands'                  AS t, count(*) FROM public.brands
UNION ALL SELECT 'public.categories',           count(*) FROM public.categories
UNION ALL SELECT 'public.products',             count(*) FROM public.products
UNION ALL SELECT 'public.product_computed_prices', count(*) FROM public.product_computed_prices;

\echo '-- displayable products in LAN --'
SELECT count(*) AS displayable
FROM public.products
WHERE is_active = true AND stock_status IN ('available','limited');

\echo '-- sample 5 visible products with cash_price --'
SELECT p.id, p.name, p.stock_status, pcp.rounded_sale_price
FROM public.products p
LEFT JOIN public.product_computed_prices pcp
  ON pcp.product_id = p.id AND pcp.sale_price_type_id = :'lan_cash_price_id'::uuid
WHERE p.is_active = true AND p.stock_status IN ('available','limited')
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 5;

-- NOTE: this script does NOT issue COMMIT or ROLLBACK. The wrapper decides:
--   dry_run=true  -> wrapper sends ROLLBACK (no public.* change at all)
--   dry_run=false -> wrapper sends COMMIT on success, ROLLBACK on any error
