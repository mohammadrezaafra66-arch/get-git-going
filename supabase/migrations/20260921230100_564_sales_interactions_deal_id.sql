SET client_encoding='UTF8';

-- ============================================================================
-- 564 - sales_interactions.deal_id self-FK (B5)
-- ============================================================================
-- Links call/note activity rows to a deal (request) row on the same table.
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/564_sales_interactions_deal_id.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS deal_id uuid NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_interactions_deal_id_fkey'
      AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    ALTER TABLE public.sales_interactions
      ADD CONSTRAINT sales_interactions_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.sales_interactions(id);
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS sales_interactions_deal_id_idx
  ON public.sales_interactions (deal_id)
  WHERE deal_id IS NOT NULL;

COMMENT ON COLUMN public.sales_interactions.deal_id IS
  'Optional link from call/note activity to a deal (request) row; self-FK.';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'deal_id'
  ) THEN
    RAISE EXCEPTION '564: deal_id missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_interactions_deal_id_fkey'
      AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    RAISE EXCEPTION '564: sales_interactions_deal_id_fkey missing';
  END IF;
END
$do$;
