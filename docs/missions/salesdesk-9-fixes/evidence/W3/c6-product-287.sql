-- C6 probe without RPC auth gate: product X287 exists and matches term 287
SELECT id, name, sku, stock_status, is_active
  FROM public.products
 WHERE sku ILIKE '%287%'
    OR name ILIKE '%287%'
    OR sku ILIKE '%X287%'
 ORDER BY updated_at DESC NULLS LAST
 LIMIT 10;
