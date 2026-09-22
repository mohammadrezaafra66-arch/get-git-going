SELECT 'settings' AS kind, column_name, data_type, column_default::text, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='user_caller_id_settings'
  AND column_name IN ('display_seconds','only_my_extension','only_my_customers')
ORDER BY 2;
SELECT 'deal_id' AS kind, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions' AND column_name='deal_id';
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260921230000','20260921230100') ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.user_caller_id_settings'::regclass AND contype='c';
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.sales_interactions'::regclass AND contype='f' AND conname ILIKE '%deal%';
