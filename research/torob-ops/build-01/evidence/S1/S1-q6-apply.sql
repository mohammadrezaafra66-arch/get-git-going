SET client_encoding TO 'UTF8';

-- Pick 15 products that the scan our-price source (the view) returns.
-- Prefer the one with a torob_url, then spread by brand_id.
CREATE TEMP TABLE q6_pick AS
WITH priced AS (
  SELECT DISTINCT ON (p.id)
         p.id,
         p.brand_id,
         p.torob_url,
         pcp.rounded_sale_price
    FROM public.products p
    JOIN public.product_computed_prices_public pcp ON pcp.product_id = p.id
    JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
   WHERE p.is_active
     AND spt.code = 'cash_price'
     AND pcp.rounded_sale_price IS NOT NULL
     AND pcp.rounded_sale_price > 0
   ORDER BY p.id, pcp.computed_at DESC
),
ranked AS (
  SELECT id, brand_id, torob_url, rounded_sale_price,
         row_number() OVER (
           PARTITION BY brand_id
           ORDER BY CASE WHEN torob_url IS NOT NULL AND btrim(torob_url) <> '' THEN 0 ELSE 1 END, id
         ) AS brand_rn
    FROM priced
)
SELECT id, brand_id, torob_url, rounded_sale_price
  FROM ranked
 WHERE brand_rn = 1
    OR (torob_url IS NOT NULL AND btrim(torob_url) <> '')
 ORDER BY CASE WHEN torob_url IS NOT NULL AND btrim(torob_url) <> '' THEN 0 ELSE 1 END, brand_id, id
 LIMIT 15;

SELECT count(*) AS q6_n FROM q6_pick;
SELECT id, brand_id,
       (torob_url IS NOT NULL AND btrim(torob_url) <> '') AS has_url,
       rounded_sale_price
  FROM q6_pick
 ORDER BY has_url DESC, brand_id;

-- Turn watch on for those products' observatory rows (create cell if needed).
WITH obs AS (
  SELECT id AS table_id FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory'
),
pid_col AS (
  SELECT c.id AS column_id, c.table_id
    FROM public.dynamic_table_columns c
    JOIN obs ON obs.table_id = c.table_id
   WHERE c.column_key = 'afrakala_product_id'
),
watch_col AS (
  SELECT c.id AS column_id, c.table_id
    FROM public.dynamic_table_columns c
    JOIN obs ON obs.table_id = c.table_id
   WHERE c.column_key = 'is_watch_active'
),
target_rows AS (
  SELECT pid.row_id, pid.table_id, watch_col.column_id
    FROM pid_col
    JOIN public.dynamic_table_cells pid
      ON pid.column_id = pid_col.column_id AND pid.table_id = pid_col.table_id
    JOIN q6_pick ON q6_pick.id::text = pid.value_text
    CROSS JOIN watch_col
)
UPDATE public.dynamic_table_cells cel
   SET value_boolean = true, updated_at = now()
  FROM target_rows t
 WHERE cel.table_id = t.table_id
   AND cel.row_id = t.row_id
   AND cel.column_id = t.column_id;

INSERT INTO public.dynamic_table_cells (table_id, row_id, column_id, value_boolean)
SELECT t.table_id, t.row_id, t.column_id, true
  FROM target_rows t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.dynamic_table_cells cel
    WHERE cel.table_id = t.table_id
      AND cel.row_id = t.row_id
      AND cel.column_id = t.column_id
 );

SELECT count(*) AS watch_true_after
  FROM public.dynamic_table_columns c
  JOIN public.dynamic_table_cells cel
    ON cel.column_id = c.id AND cel.table_id = c.table_id
 WHERE c.column_key = 'is_watch_active'
   AND cel.value_boolean IS TRUE;

UPDATE public.torob_ops_settings
   SET eye_owner_user_id = (
         SELECT ur.user_id FROM public.user_roles ur
          WHERE ur.role = 'admin'
          LIMIT 1
       )
 WHERE id = 1
   AND eye_owner_user_id IS NULL;
