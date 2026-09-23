SET client_encoding='UTF8';

-- 567-down: reverse deal_lost_reasons + lost_reason_* (copy/staging only).

DROP TRIGGER IF EXISTS trg_sales_interactions_require_lost_reason ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.sales_interactions_require_lost_reason();

DROP INDEX IF EXISTS public.sales_interactions_lost_reason_id_idx;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_lost_reason_id_fkey;

ALTER TABLE public.sales_interactions
  DROP COLUMN IF EXISTS lost_reason_id,
  DROP COLUMN IF EXISTS lost_reason_note,
  DROP COLUMN IF EXISTS lost_reason_other;

DROP POLICY IF EXISTS deal_lost_reasons_select ON public.deal_lost_reasons;
DROP POLICY IF EXISTS deal_lost_reasons_insert ON public.deal_lost_reasons;
DROP POLICY IF EXISTS deal_lost_reasons_update ON public.deal_lost_reasons;

DROP TABLE IF EXISTS public.deal_lost_reasons;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922040200';
