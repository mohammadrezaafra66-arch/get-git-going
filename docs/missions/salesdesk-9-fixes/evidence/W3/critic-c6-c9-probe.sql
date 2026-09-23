-- Critic C6: search_product_ids('287') should hit X287-named products
\echo === C6_search_287 ===
SELECT id, name, sku, stock_status, is_active
  FROM public.search_product_ids('287', 20)
 ORDER BY name
 LIMIT 10;

-- Critic C9: interaction_id column nullability + default quote status enum
\echo === C9_quote_status_default ===
SELECT column_name, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_quotes'
   AND column_name IN ('interaction_id','status','salesperson_id');
