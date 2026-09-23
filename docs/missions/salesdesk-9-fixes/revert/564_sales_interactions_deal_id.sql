SET client_encoding='UTF8';

-- 564-down: reverse sales_interactions.deal_id
-- (copy/staging only — never production).

DROP INDEX IF EXISTS public.sales_interactions_deal_id_idx;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_deal_id_fkey;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS deal_id;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260921230100';
