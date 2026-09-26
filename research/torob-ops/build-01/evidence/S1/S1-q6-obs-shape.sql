SET client_encoding TO 'UTF8';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='dynamic_table_cells'
ORDER BY ordinal_position;

SELECT c.column_key, count(cel.id) AS n, count(cel.value_text) AS n_text, count(cel.value_boolean) AS n_bool
  FROM public.dynamic_table_columns c
  LEFT JOIN public.dynamic_table_cells cel ON cel.column_id = c.id
 WHERE c.table_id = (SELECT id FROM public.dynamic_tables WHERE slug = 'afrakala-product-price-observatory')
   AND c.column_key IN ('afrakala_product_id','is_watch_active')
 GROUP BY 1;

SELECT left(cel.value_text, 80) AS sample
  FROM public.dynamic_table_columns c
  JOIN public.dynamic_table_cells cel ON cel.column_id = c.id
 WHERE c.column_key = 'afrakala_product_id'
   AND c.table_id = (SELECT id FROM public.dynamic_tables WHERE slug = 'afrakala-product-price-observatory')
 LIMIT 5;
