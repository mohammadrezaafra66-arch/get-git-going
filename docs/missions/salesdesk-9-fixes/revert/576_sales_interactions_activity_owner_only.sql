SET client_encoding='UTF8';

-- 576-down: reverse activity owner-only done_at/result_note trigger (copy/staging only).

DROP TRIGGER IF EXISTS trg_sales_interactions_activity_owner_only ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.sales_interactions_activity_owner_only();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922050400';
