SET client_encoding = 'UTF8';

-- A4: supplier_id required on INSERT; may not clear non-null on UPDATE
CREATE OR REPLACE FUNCTION public.purchases_require_supplier()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.supplier_id IS NULL THEN
      RAISE EXCEPTION 'SUPPLIER_REQUIRED'
        USING ERRCODE = 'P0001', HINT = 'SUPPLIER_REQUIRED';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.supplier_id IS NOT NULL AND NEW.supplier_id IS NULL THEN
      RAISE EXCEPTION 'SUPPLIER_REQUIRED'
        USING ERRCODE = 'P0001', HINT = 'SUPPLIER_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_purchases_require_supplier ON public.purchases;
CREATE TRIGGER trg_purchases_require_supplier
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.purchases_require_supplier();
