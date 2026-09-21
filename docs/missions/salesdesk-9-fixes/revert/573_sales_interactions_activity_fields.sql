SET client_encoding='UTF8';

-- 573-down: reverse sales_interactions activity fields (copy/staging only).
-- Clears backfill by dropping columns. Does NOT touch deal_id (owned by 564).
-- Does NOT change kind values.

DROP INDEX IF EXISTS public.sales_interactions_salesperson_due_open_idx;
DROP INDEX IF EXISTS public.sales_interactions_activity_type_id_idx;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_activity_type_id_fkey;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS activity_type_id;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS due_at;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS due_has_time;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS original_due_at;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS done_at;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS result_note;

-- Restore comments overwritten by 573 (best-effort; prior text may differ)
COMMENT ON COLUMN public.sales_interactions.salesperson_id IS NULL;
COMMENT ON COLUMN public.sales_interactions.author_id IS NULL;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922050100';
