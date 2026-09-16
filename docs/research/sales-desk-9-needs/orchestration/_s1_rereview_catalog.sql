SELECT current_database() AS db, current_user;
SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260916033000';
SELECT tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.sales_interactions'::regclass
   AND tgname = 'trg_sales_interactions_lock_author_id'
   AND NOT tgisinternal;
SELECT pg_get_functiondef('public.tg_sales_interactions_lock_author_id'::regproc) AS fndef;
SELECT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE') AS authenticated_has_delete;
