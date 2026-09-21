SET client_encoding='UTF8';

-- 565-down: reverse responsible_required + restore backfilled salesperson_id to NULL
-- (copy/staging only — never production).

DROP TRIGGER IF EXISTS trg_sales_interactions_require_responsible ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.sales_interactions_require_responsible();

UPDATE public.sales_interactions si
   SET salesperson_id = NULL
  FROM public._mig_565_salesperson_null_ids s
 WHERE si.id = s.id;

DROP TABLE IF EXISTS public._mig_565_salesperson_null_ids;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922040000';
