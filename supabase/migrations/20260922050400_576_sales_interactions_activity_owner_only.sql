SET client_encoding='UTF8';

-- ============================================================================
-- 576 - sales_interactions: only owner may change done_at / result_note (D3 / F1)
-- ============================================================================
-- BEFORE UPDATE: when done_at or result_note IS DISTINCT FROM OLD, require
-- auth.uid() = OLD.salesperson_id. auth.uid() IS NULL (system) is exempt.
-- No admin/manager exemption — reassign activity to self first.
-- Business code: ACTIVITY_OWNER_ONLY (ERRCODE P0001).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/576_sales_interactions_activity_owner_only.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sales_interactions_activity_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid;
BEGIN
  IF NEW.done_at IS DISTINCT FROM OLD.done_at
     OR NEW.result_note IS DISTINCT FROM OLD.result_note THEN
    uid := auth.uid();
    IF uid IS NOT NULL AND uid IS DISTINCT FROM OLD.salesperson_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVITY_OWNER_ONLY';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_interactions_activity_owner_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interactions_activity_owner_only() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interactions_activity_owner_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interactions_activity_owner_only() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_interactions_activity_owner_only ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_activity_owner_only
  BEFORE UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_activity_owner_only();
