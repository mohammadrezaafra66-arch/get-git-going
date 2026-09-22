SELECT to_regclass('public.sales_interaction_items') AS table_regclass;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales_interaction_items'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'sales_interaction_items'
ORDER BY 1;

SELECT polname, polcmd::text
FROM pg_policy
WHERE polrelid = 'public.sales_interaction_items'::regclass
ORDER BY 1;
