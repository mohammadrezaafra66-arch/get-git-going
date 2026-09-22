-- Post-apply verify: 563 + 564

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_caller_id_settings'
  AND column_name IN ('display_seconds', 'only_my_extension', 'only_my_customers',
                      'enabled', 'show_inbound', 'show_outbound', 'show_others_outbound')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.user_caller_id_settings'::regclass
  AND conname = 'user_caller_id_settings_display_seconds_check';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_interactions'
  AND column_name = 'deal_id';

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.sales_interactions'::regclass
  AND conname = 'sales_interactions_deal_id_fkey';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'sales_interactions'
  AND indexname = 'sales_interactions_deal_id_idx';

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260921230000', '20260921230100')
ORDER BY version;
