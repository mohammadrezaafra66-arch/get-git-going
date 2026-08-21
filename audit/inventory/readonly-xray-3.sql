SELECT proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_sales_quote_with_items',
    'update_sales_quote_status',
    'post_receipt_accounting',
    'person_create_full',
    'person_merge'
  )
ORDER BY 1;
