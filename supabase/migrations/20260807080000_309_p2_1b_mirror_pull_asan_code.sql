SET client_encoding='UTF8';

-- 309 - P2.1b. Make Asan-code propagation order-independent.
--
-- ============================================================================
-- THE DEFECT IN 308
-- ============================================================================
-- 308 propagates in one direction only: identifier written -> UPDATE the mirror
-- rows that exist. That silently does nothing when the mirror row does not exist
-- yet, and that is exactly the order person_create_inline uses:
--
--   person_create_inline
--     -> person_create_full   inserts persons + person_identifiers   (1st)
--     -> INSERT INTO suppliers / customers                            (2nd)
--
-- So a supplier created through the RPC with an Asan code got the identifier but
-- a NULL mirror. Proven live before writing this migration:
--
--   A) via the RPC, identifier then supplier row  -> mirror = NULL
--   B) supplier row first, then identifier        -> mirror = 00815
--
-- SupplierForm (P2.2) will use path A, so without this migration the field would
-- appear to work while leaving the mirror empty.
--
-- ============================================================================
-- THE FIX
-- ============================================================================
-- A BEFORE INSERT trigger on each mirror table that pulls the code from the
-- person's active identifier when the row is created without one. BEFORE, not
-- AFTER, so it sets NEW directly - no second UPDATE statement and no chance of
-- trigger recursion.
--
-- Together with 308 the two directions now cover every order:
--   identifier first, mirror second  -> this migration fills it on insert
--   mirror first, identifier second  -> 308 updates it on identifier write
--
-- WHY value_raw AGAIN
-- Same reason as 308: normalize_identifier() strips leading zeros deliberately,
-- so value_normalized is the uniqueness form and value_raw is what the user
-- typed. The mirror stores raw. Note that asan_list_purchase_export reads
-- value_normalized directly from person_identifiers, NOT the mirror, so the
-- export is unaffected by this choice either way.
--
-- Down script: docs/verification/309-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).

CREATE OR REPLACE FUNCTION public.trg_mirror_pull_asan_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
BEGIN
  -- An explicit code on the incoming row wins: the caller said what they meant.
  IF NEW.accounting_code IS NOT NULL OR NEW.person_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.value_raw INTO _code
    FROM public.person_identifiers i
   WHERE i.person_id = NEW.person_id
     AND i.kind = 'asan_person_code'
     AND i.status <> 'revoked'
   ORDER BY i.is_primary DESC, i.created_at ASC
   LIMIT 1;

  IF _code IS NOT NULL THEN
    NEW.accounting_code := _code;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trg_mirror_pull_asan_code() IS
  'Fills accounting_code on a new customers/suppliers row from the person''s asan_person_code identifier. Pairs with trg_person_identifiers_propagate_asan_code so propagation works in either insert order.';

DROP TRIGGER IF EXISTS trg_suppliers_pull_asan_code ON public.suppliers;
CREATE TRIGGER trg_suppliers_pull_asan_code
  BEFORE INSERT OR UPDATE OF person_id ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_mirror_pull_asan_code();

DROP TRIGGER IF EXISTS trg_customers_pull_asan_code ON public.customers;
CREATE TRIGGER trg_customers_pull_asan_code
  BEFORE INSERT OR UPDATE OF person_id ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_mirror_pull_asan_code();

-- Assert both triggers landed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_suppliers_pull_asan_code'
                    AND tgrelid='public.suppliers'::regclass) THEN
    RAISE EXCEPTION '309 failed: supplier pull trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_customers_pull_asan_code'
                    AND tgrelid='public.customers'::regclass) THEN
    RAISE EXCEPTION '309 failed: customer pull trigger missing';
  END IF;
END $$;
