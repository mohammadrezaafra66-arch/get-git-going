SET client_encoding='UTF8';

-- ============================================================================
-- 561 - purchases: supplier_id required on INSERT; cannot clear on UPDATE (A4)
-- ============================================================================
-- Legacy NULL supplier_id rows remain editable for other columns.
-- Business code: SUPPLIER_REQUIRED (ERRCODE P0001).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/561_purchases_require_supplier.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.purchases_require_supplier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.supplier_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_REQUIRED';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.supplier_id IS NOT NULL AND NEW.supplier_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purchases_require_supplier() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchases_require_supplier() FROM anon;
GRANT EXECUTE ON FUNCTION public.purchases_require_supplier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchases_require_supplier() TO service_role;

DROP TRIGGER IF EXISTS trg_purchases_require_supplier ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_supplier_required ON public.purchases;
DROP FUNCTION IF EXISTS public.tg_purchases_supplier_required();

CREATE TRIGGER trg_purchases_require_supplier
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.purchases_require_supplier();
