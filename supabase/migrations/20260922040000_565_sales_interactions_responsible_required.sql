SET client_encoding='UTF8';

-- ============================================================================
-- 565 - sales_interactions: salesperson_id required for kind='request' (C2)
-- ============================================================================
-- BEFORE INSERT/UPDATE: request rows must keep a non-null salesperson_id.
-- YES_BACKFILL: NULL salesperson_id on kind='request' → author_id.
-- Snapshot table for reversible restore of those ids.
-- Business code: RESPONSIBLE_REQUIRED (ERRCODE P0001).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/565_sales_interactions_responsible_required.sql
-- ============================================================================

SET lock_timeout = '60s';

-- Snapshot ids that will be backfilled (for revert)
CREATE TABLE IF NOT EXISTS public._mig_565_salesperson_null_ids (
  id uuid PRIMARY KEY
);

INSERT INTO public._mig_565_salesperson_null_ids (id)
SELECT id
  FROM public.sales_interactions
 WHERE salesperson_id IS NULL
   AND kind = 'request'
ON CONFLICT DO NOTHING;

UPDATE public.sales_interactions si
   SET salesperson_id = si.author_id
  FROM public._mig_565_salesperson_null_ids s
 WHERE si.id = s.id
   AND si.salesperson_id IS NULL;

CREATE OR REPLACE FUNCTION public.sales_interactions_require_responsible()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'request' AND NEW.salesperson_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RESPONSIBLE_REQUIRED';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.kind = 'request'
       AND NEW.salesperson_id IS NULL
       AND NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RESPONSIBLE_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_interactions_require_responsible() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interactions_require_responsible() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interactions_require_responsible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interactions_require_responsible() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_interactions_require_responsible ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_require_responsible
  BEFORE INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_require_responsible();
