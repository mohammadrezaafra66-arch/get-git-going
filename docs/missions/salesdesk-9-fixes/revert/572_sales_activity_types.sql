SET client_encoding='UTF8';

-- 572-down: reverse sales_activity_types (copy/staging only).

DROP POLICY IF EXISTS sales_activity_types_select ON public.sales_activity_types;
DROP POLICY IF EXISTS sales_activity_types_insert ON public.sales_activity_types;
DROP POLICY IF EXISTS sales_activity_types_update ON public.sales_activity_types;

DROP INDEX IF EXISTS public.sales_activity_types_sort_order_uidx;

DROP TABLE IF EXISTS public.sales_activity_types;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922050000';
