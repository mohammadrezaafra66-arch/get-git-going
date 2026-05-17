-- AfraKala — Phase 3 / Task AFRA-20260517-PRODUCTS-U02-S02
-- Import امن محصولات Cloud → LAN با staging و mapping.
--
-- پیش‌فرض اجرا روی LAN (target):
--   psql -v ON_ERROR_STOP=1 \
--        -v dry_run=true \
--        -v staging_dir='/path/to/products-YYYYMMDD-HHMMSS' \
--        -v lan_cash_price_id='c70761f0-fcdc-4a7f-82a9-8c8cad00453d' \
--        -v lan_admin_user_id='4084224a-cd34-4632-9cbc-3b5f3581cf6e' \
--        -f import-products-staged.sql
--
-- این فایل:
--   1) schema _staging_import + جدول‌های raw را می‌سازد.
--   2) داده‌ی CSVها را با \COPY بارگیری می‌کند.
--   3) جدول‌های price_type_map و created_by_map را می‌سازد.
--   4) preflight چک می‌کند (وجود admin و cash_price در LAN).
--   5) در حالت dry_run=true فقط شمارش و نمونه نشان می‌دهد و COMMIT نمی‌کند.
--   6) در حالت dry_run=false داده را به public.brands/categories/products/
--      product_computed_prices درج می‌کند (ON CONFLICT DO NOTHING) و سپس
--      COMMIT نهایی توسط wrapper اجرا می‌شود.
--
-- نکته: اجرای واقعی نیازمند backup قبلی و تأیید U01 است.

\set ON_ERROR_STOP on

BEGIN;

-- ─── 0) Preflight ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = :'lan_admin_user_id'::uuid) THEN
    RAISE EXCEPTION 'LAN admin user % not found — abort import', :'lan_admin_user_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_price_types WHERE id = :'lan_cash_price_id'::uuid) THEN
    RAISE EXCEPTION 'LAN cash_price sale_price_type % not found — abort import', :'lan_cash_price_id';
  END IF;
END $$;

-- ─── 1) Staging schema ─────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS _staging_import;

DROP TABLE IF EXISTS _staging_import.brands_raw;
DROP TABLE IF EXISTS _staging_import.categories_raw;
DROP TABLE IF EXISTS _staging_import.products_raw;
DROP TABLE IF EXISTS _staging_import.product_computed_prices_raw;
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

-- ─── 2) Load CSVs ──────────────────────────────────────────────────────────
\copy _staging_import.brands_raw                 FROM :'staging_dir'/brands.csv                 WITH (FORMAT csv, HEADER true)
\copy _staging_import.categories_raw             FROM :'staging_dir'/categories.csv             WITH (FORMAT csv, HEADER true)
\copy _staging_import.products_raw               FROM :'staging_dir'/products.csv               WITH (FORMAT csv, HEADER true)
\copy _staging_import.product_computed_prices_raw FROM :'staging_dir'/product_computed_prices.csv WITH (FORMAT csv, HEADER true)

-- ─── 3) Mapping tables ─────────────────────────────────────────────────────
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

-- ─── 4) Dedupe product_computed_prices ─────────────────────────────────────
-- پس از mapping همه‌ی sale_price_type_id به cash_price، هر product به یک ردیف collapse می‌شود.
-- انتخاب deterministic: آخرین computed_at (computed_at NOT NULL در منبع تأیید شده).
DROP TABLE IF EXISTS _staging_import.product_computed_prices_dedup;
CREATE TABLE _staging_import.product_computed_prices_dedup AS
SELECT DISTINCT ON (product_id)
  id, product_id,
  :'lan_cash_price_id'::uuid AS sale_price_type_id,
  NULL::uuid AS purchase_price_id,    -- جدول purchase_prices در این bundle import نمی‌شود
  NULL::uuid AS pricing_rule_id,      -- جدول pricing_rules در این bundle import نمی‌شود
  input_purchase_price, input_currency, currency_rate, purchase_price_toman,
  shipping_cost, margin_amount, final_sale_price, rounded_sale_price,
  computed_at,
  :'lan_admin_user_id'::uuid AS computed_by,
  source
FROM _staging_import.product_computed_prices_raw
ORDER BY product_id, computed_at DESC, id;

-- ─── 5) Verification (همیشه چاپ می‌شود) ───────────────────────────────────
\echo '── staging row counts ──'
SELECT 'brands_raw'             AS t, count(*) FROM _staging_import.brands_raw
UNION ALL SELECT 'categories_raw',          count(*) FROM _staging_import.categories_raw
UNION ALL SELECT 'products_raw',            count(*) FROM _staging_import.products_raw
UNION ALL SELECT 'pcp_raw',                 count(*) FROM _staging_import.product_computed_prices_raw
UNION ALL SELECT 'pcp_dedup (= distinct products)', count(*) FROM _staging_import.product_computed_prices_dedup;

\echo '── orphan checks ──'
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

-- ─── 6) Real insert (فقط وقتی dry_run=false) ──────────────────────────────
\if :{?dry_run}
\else
  \set dry_run true
\endif

SELECT CASE WHEN :'dry_run' = 'false'
            THEN '── INSERTING into public.* (ON CONFLICT DO NOTHING) ──'
            ELSE '── DRY RUN — no rows inserted, no COMMIT ──'
       END AS mode;

-- Insert brands
INSERT INTO public.brands (id, name, slug, description, is_active, created_at, updated_at)
SELECT id, name, slug, description, is_active, created_at, updated_at
FROM _staging_import.brands_raw
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- Insert categories (parent_id ممکن است self-reference باشد — ترتیب با CTE)
WITH ordered AS (
  SELECT id, name, slug, parent_id, description, is_active,
         created_at, updated_at, naming_template, primary_spec_label
  FROM _staging_import.categories_raw
)
INSERT INTO public.categories
  (id, name, slug, parent_id, description, is_active,
   created_at, updated_at, naming_template, primary_spec_label)
SELECT * FROM ordered
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- Insert products با map created_by/updated_by → LAN admin
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
  p.product_type, p.base_currency, p.stock_status, p.status,
  p.technical_notes,
  :'lan_admin_user_id'::uuid,
  p.color, p.capacity, p.model, p.primary_spec, p.dedup_key
FROM _staging_import.products_raw p
WHERE :'dry_run' = 'false'
ON CONFLICT (id) DO NOTHING;

-- Insert product_computed_prices (از جدول dedup شده)
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

-- ─── 7) Post-insert verification ──────────────────────────────────────────
\echo '── public.* counts after step ──'
SELECT 'public.brands'     AS t, count(*) FROM public.brands
UNION ALL SELECT 'public.categories', count(*) FROM public.categories
UNION ALL SELECT 'public.products',   count(*) FROM public.products
UNION ALL SELECT 'public.product_computed_prices', count(*) FROM public.product_computed_prices;

\echo '── displayable products in LAN ──'
SELECT count(*) AS displayable
FROM public.products
WHERE is_active = true AND stock_status IN ('available','limited');

\echo '── sample 5 visible products with cash_price ──'
SELECT p.id, p.name, p.stock_status, pcp.rounded_sale_price
FROM public.products p
LEFT JOIN public.product_computed_prices pcp
  ON pcp.product_id = p.id AND pcp.sale_price_type_id = :'lan_cash_price_id'::uuid
WHERE p.is_active = true AND p.stock_status IN ('available','limited')
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 5;

-- در dry_run یا real run، تصمیم COMMIT/ROLLBACK با wrapper است.
-- اگر این فایل مستقیماً اجرا شود و COMMIT صریح نخواهیم، transaction در پایان session باز می‌ماند؛
-- بنابراین wrapper PowerShell باید روی موفقیت COMMIT و در صورت خطا ROLLBACK کند.