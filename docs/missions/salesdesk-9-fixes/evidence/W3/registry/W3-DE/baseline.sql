SELECT version
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260921%'
   OR version LIKE '20260922%'
ORDER BY version;

SELECT count(*) AS null_salesperson_request
FROM public.sales_interactions
WHERE salesperson_id IS NULL AND kind = 'request';

SELECT count(*) AS null_salesperson_any
FROM public.sales_interactions
WHERE salesperson_id IS NULL;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_interactions'
  AND column_name IN ('won_at','lost_at','lost_reason_id','lost_reason_note','lost_reason_other','deal_id')
ORDER BY column_name;

SELECT to_regclass('public.deal_lost_reasons') AS deal_lost_reasons;
SELECT to_regclass('public.sales_interaction_items') AS sales_interaction_items;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_quotes'
  AND column_name = 'interaction_id';
