SET client_encoding='UTF8';

-- 568-down: reverse sales_interaction_items (copy/staging only).

DROP POLICY IF EXISTS sales_interaction_items_select ON public.sales_interaction_items;
DROP POLICY IF EXISTS sales_interaction_items_insert ON public.sales_interaction_items;
DROP POLICY IF EXISTS sales_interaction_items_update ON public.sales_interaction_items;
DROP POLICY IF EXISTS sales_interaction_items_delete ON public.sales_interaction_items;

DROP TABLE IF EXISTS public.sales_interaction_items;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922040300';
