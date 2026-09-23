SET client_encoding='UTF8';

-- ============================================================================
-- 566 - sales_interactions: won_at / lost_at (C7)
-- ============================================================================
-- Trigger maintains timestamps on status transitions:
--   → won: won_at=now(), lost_at=NULL
--   → lost: lost_at=now(), won_at=NULL
--   → open: both NULL
-- Status CHECK unchanged (open,won,lost,cancelled,done).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/566_sales_interactions_won_lost_at.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS won_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz NULL;

COMMENT ON COLUMN public.sales_interactions.won_at IS
  'Set when status transitions to won; cleared on reopen to open. Migration 566.';
COMMENT ON COLUMN public.sales_interactions.lost_at IS
  'Set when status transitions to lost; cleared on reopen to open. Migration 566.';

CREATE OR REPLACE FUNCTION public.sales_interactions_maintain_won_lost_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'won' THEN
      NEW.won_at := now();
      NEW.lost_at := NULL;
    ELSIF NEW.status = 'lost' THEN
      NEW.lost_at := now();
      NEW.won_at := NULL;
    ELSIF NEW.status = 'open' THEN
      NEW.won_at := NULL;
      NEW.lost_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_interactions_maintain_won_lost_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interactions_maintain_won_lost_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interactions_maintain_won_lost_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interactions_maintain_won_lost_at() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_interactions_won_lost_at ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_won_lost_at
  BEFORE UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_maintain_won_lost_at();
