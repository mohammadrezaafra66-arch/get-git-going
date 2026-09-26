-- R5 observatory write path + watch-active. ASCII. No secrets.
SET client_encoding TO 'UTF8';

SELECT id, slug, is_active
FROM public.dynamic_tables
WHERE slug = 'afrakala-product-price-observatory';

SELECT column_key, label, data_type, is_editable_by_bot, sort_order
FROM public.dynamic_table_columns
WHERE table_id = (SELECT id FROM public.dynamic_tables WHERE slug = 'afrakala-product-price-observatory')
  AND column_key IN (
    'is_watch_active',
    'torob_min_price_toman',
    'torob_avg_price_toman',
    'torob_max_price_toman',
    'torob_seller_count',
    'torob_last_seen_at',
    'afrakala_product_id'
  )
ORDER BY sort_order;

SELECT
  count(*) FILTER (WHERE cel.value_boolean IS TRUE) AS watch_true,
  count(*) FILTER (WHERE cel.value_boolean IS FALSE) AS watch_false,
  count(*) FILTER (WHERE cel.value_boolean IS NULL AND cel.id IS NOT NULL) AS watch_null_cell,
  count(cel.id) AS watch_cells
FROM public.dynamic_table_columns c
LEFT JOIN public.dynamic_table_cells cel
  ON cel.column_id = c.id AND cel.table_id = c.table_id
WHERE c.table_id = (SELECT id FROM public.dynamic_tables WHERE slug = 'afrakala-product-price-observatory')
  AND c.column_key = 'is_watch_active';

SELECT name, is_active, created_at, last_used_at,
       cardinality(allowed_table_ids) AS allowed_table_n,
       managed_by_role
FROM public.bot_api_keys
ORDER BY name;

SELECT k.name, t.slug
FROM public.bot_api_keys k
LEFT JOIN public.dynamic_tables t ON t.id = ANY (k.allowed_table_ids)
ORDER BY k.name, t.slug;
