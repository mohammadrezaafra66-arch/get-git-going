-- Products with watch-active + computed BASE. No names of secrets.
SET client_encoding TO 'UTF8';

WITH obs AS (
  SELECT id AS table_id
  FROM public.dynamic_tables
  WHERE slug = 'afrakala-product-price-observatory'
),
watch_col AS (
  SELECT c.id AS column_id, c.table_id
  FROM public.dynamic_table_columns c
  JOIN obs ON obs.table_id = c.table_id
  WHERE c.column_key = 'is_watch_active'
),
pid_col AS (
  SELECT c.id AS column_id, c.table_id
  FROM public.dynamic_table_columns c
  JOIN obs ON obs.table_id = c.table_id
  WHERE c.column_key = 'afrakala_product_id'
),
watched AS (
  SELECT pid.value_text::uuid AS product_id
  FROM watch_col w
  JOIN public.dynamic_table_cells wc
    ON wc.column_id = w.column_id AND wc.table_id = w.table_id
  JOIN pid_col p ON p.table_id = w.table_id
  JOIN public.dynamic_table_cells pid
    ON pid.column_id = p.column_id AND pid.table_id = p.table_id AND pid.row_id = wc.row_id
  WHERE wc.value_boolean IS TRUE
    AND pid.value_text IS NOT NULL
)
SELECT
  (SELECT count(*) FROM watched) AS watch_active_rows,
  (SELECT count(*) FROM watched w
    JOIN public.products p ON p.id = w.product_id
    WHERE p.is_active) AS watch_active_and_active_product,
  (SELECT count(*) FROM watched w
    JOIN public.products p ON p.id = w.product_id
    WHERE p.is_active
      AND p.torob_url IS NOT NULL AND btrim(p.torob_url) <> '') AS watch_active_with_torob_url,
  (SELECT count(*) FROM watched w
    JOIN public.products p ON p.id = w.product_id
    WHERE p.is_active
      AND EXISTS (
        SELECT 1
        FROM public.product_computed_prices_public pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = p.id
          AND spt.code = 'cash_price'
          AND pcp.rounded_sale_price IS NOT NULL
          AND pcp.rounded_sale_price > 0
      )
  ) AS watch_active_with_computed_base;
