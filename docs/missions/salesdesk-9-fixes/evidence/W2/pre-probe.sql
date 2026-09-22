SELECT 'user_caller_id_settings' AS tbl, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_caller_id_settings'
ORDER BY ordinal_position;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales_interactions' AND column_name = 'deal_id';

SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '%563%' OR version LIKE '%564%'
   OR version IN ('20260921220000', '20260921220100', '20260921220200')
ORDER BY version;
