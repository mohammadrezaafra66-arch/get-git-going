-- Critic C6/C9 without auth-gated RPC
\echo === C6_products_ilike_287 ===
SELECT id, name, sku, stock_status, is_active
  FROM public.products
 WHERE name ILIKE '%287%' OR sku ILIKE '%287%' OR barcode ILIKE '%287%'
 ORDER BY name
 LIMIT 10;

\echo === C6_search_fn_src_has_ilike ===
SELECT
  (pg_get_functiondef('public.search_product_ids(text,integer)'::regprocedure)
   ILIKE '%ILIKE%') AS has_ilike,
  position('p_term' in pg_get_functiondef('public.search_product_ids(text,integer)'::regprocedure)) AS p_term_pos;

\echo === C9_quote_cols ===
SELECT column_name, column_default, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_quotes'
   AND column_name IN ('interaction_id','status','salesperson_id')
 ORDER BY 1;

\echo === C9_create_fn_draft ===
SELECT position('draft' in lower(pg_get_functiondef(
  (SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_sales_quote_with_items'
   LIMIT 1)
))) AS draft_pos;
