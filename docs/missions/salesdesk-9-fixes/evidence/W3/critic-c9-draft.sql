-- Does create_sales_quote_with_items mention draft / sales_quote_status?
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%draft%') AS mentions_draft,
  (pg_get_functiondef(p.oid) ILIKE '%sales_quote_status%') AS mentions_enum,
  length(pg_get_functiondef(p.oid)) AS def_len
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_sales_quote_with_items'
LIMIT 1;

-- Sample of INSERT columns near status in function body
SELECT substring(
  pg_get_functiondef(p.oid)
  FROM 'INSERT INTO public\.sales_quotes[\s\S]{0,500}'
) AS insert_snip
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_sales_quote_with_items'
LIMIT 1;
