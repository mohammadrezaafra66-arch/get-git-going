SET client_encoding='UTF8';

-- ============================================================================
-- 569 - sales_quotes.interaction_id → sales_interactions (C9)
-- ============================================================================
-- Rollback: docs/missions/salesdesk-9-fixes/revert/569_sales_quotes_interaction_id.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS interaction_id uuid NULL
    REFERENCES public.sales_interactions(id);

CREATE INDEX IF NOT EXISTS sales_quotes_interaction_id_idx
  ON public.sales_quotes (interaction_id)
  WHERE interaction_id IS NOT NULL;

COMMENT ON COLUMN public.sales_quotes.interaction_id IS
  'Optional link from quote to a sales_interactions deal/request. Migration 569.';
