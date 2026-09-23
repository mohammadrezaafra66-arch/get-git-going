SET client_encoding='UTF8';

-- 566-down: reverse won_at / lost_at (copy/staging only).

DROP TRIGGER IF EXISTS trg_sales_interactions_won_lost_at ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.sales_interactions_maintain_won_lost_at();

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS won_at,
  DROP COLUMN IF EXISTS lost_at;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922040100';
