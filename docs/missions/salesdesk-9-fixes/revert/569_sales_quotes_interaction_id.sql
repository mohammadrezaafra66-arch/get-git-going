SET client_encoding='UTF8';

-- 569-down: reverse sales_quotes.interaction_id (copy/staging only).

DROP INDEX IF EXISTS public.sales_quotes_interaction_id_idx;

ALTER TABLE public.sales_quotes
  DROP CONSTRAINT IF EXISTS sales_quotes_interaction_id_fkey;

ALTER TABLE public.sales_quotes
  DROP COLUMN IF EXISTS interaction_id;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922040400';
