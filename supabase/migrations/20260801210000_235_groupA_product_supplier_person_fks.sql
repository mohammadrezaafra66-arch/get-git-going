SET client_encoding='UTF8';

-- =============================================================================
-- 235 — Phase 7.1 (Group A): person FKs on product/purchasing supplier links
-- =============================================================================
--
-- SCOPE (from the authoritative pg_constraint enumeration, not a guess)
--   product_suppliers.supplier_id   31 rows, 31 non-null, legacy col NOT NULL
--   purchase_prices.supplier_id     3551 rows, 241 non-null, legacy col nullable
--
-- These are structural joins — no money arithmetic keys off the identity column
-- itself — which is why Group A goes first.
--
-- -----------------------------------------------------------------------------
-- PATTERN: the new columns are DERIVED, exactly as in migration 231 (Phase 5).
--
-- A BEFORE INSERT/UPDATE trigger recomputes <role>_person_id from the legacy FK
-- on every write, whatever the path. Consequences, both deliberate:
--   * no application write path has to change for the column to be populated,
--     so nothing breaks while the app is still legacy-first;
--   * the two columns cannot drift, because the client never authors the person
--     column at all.
-- This is the same "database is authoritative" contract migration 228 set for
-- person_identifiers.value_normalized.
--
-- NULLABILITY mirrors the legacy column, per the phase rule "only set NOT NULL
-- if the old column was NOT NULL":
--   product_suppliers.supplier_person_id  NOT NULL (legacy is NOT NULL)
--   purchase_prices.supplier_person_id    nullable (legacy is nullable, and
--                                         3310 of 3551 rows have no supplier)
--
-- ON DELETE: RESTRICT on both. A person must not be deletable out from under a
-- catalogue link or a price record. Note this is intentionally STRICTER than the
-- legacy columns (CASCADE / SET NULL): those cascade from the supplier row,
-- which is a commercial role and may legitimately be removed, whereas the person
-- is the identity behind it and removing it silently would lose provenance.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT — every supplier must already resolve to a person (Phase 6 made
--    suppliers.person_id NOT NULL, so this should be trivially true; assert it
--    rather than assume it).
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM public.suppliers WHERE person_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % supplier(s) still have no person_id.', v_bad;
  END IF;
  RAISE NOTICE 'Preflight OK: every supplier resolves to a person.';
END
$$;

-- -----------------------------------------------------------------------------
-- 1. COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE public.product_suppliers
  ADD COLUMN IF NOT EXISTS supplier_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_prices
  ADD COLUMN IF NOT EXISTS supplier_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 2. BACKFILL
-- -----------------------------------------------------------------------------
UPDATE public.product_suppliers ps
   SET supplier_person_id = s.person_id
  FROM public.suppliers s
 WHERE s.id = ps.supplier_id
   AND ps.supplier_person_id IS DISTINCT FROM s.person_id;

UPDATE public.purchase_prices pp
   SET supplier_person_id = s.person_id
  FROM public.suppliers s
 WHERE s.id = pp.supplier_id
   AND pp.supplier_person_id IS DISTINCT FROM s.person_id;

-- -----------------------------------------------------------------------------
-- 3. COMPLETENESS ASSERTION — abort if any row with a legacy FK lacks a person
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_ps integer;
  v_pp integer;
BEGIN
  SELECT count(*) INTO v_ps FROM public.product_suppliers
   WHERE supplier_id IS NOT NULL AND supplier_person_id IS NULL;
  SELECT count(*) INTO v_pp FROM public.purchase_prices
   WHERE supplier_id IS NOT NULL AND supplier_person_id IS NULL;

  IF v_ps + v_pp > 0 THEN
    RAISE EXCEPTION 'ABORT: orphans after backfill — product_suppliers=%, purchase_prices=%',
      v_ps, v_pp;
  END IF;
  RAISE NOTICE 'Group A backfill verified: 0 orphans in both tables.';
END
$$;

-- -----------------------------------------------------------------------------
-- 4. DERIVATION TRIGGERS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_product_suppliers_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    NEW.supplier_person_id := NULL;
  ELSE
    SELECT s.person_id INTO NEW.supplier_person_id
      FROM public.suppliers s WHERE s.id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_product_suppliers_derive_person() IS
  'Migration 235 (Phase 7.1). Keeps product_suppliers.supplier_person_id in sync with suppliers.person_id. The database is authoritative; a client-supplied value is ignored.';

DROP TRIGGER IF EXISTS trg_product_suppliers_derive_person ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_derive_person
  BEFORE INSERT OR UPDATE OF supplier_id ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_suppliers_derive_person();

CREATE OR REPLACE FUNCTION public.tg_purchase_prices_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    NEW.supplier_person_id := NULL;
  ELSE
    SELECT s.person_id INTO NEW.supplier_person_id
      FROM public.suppliers s WHERE s.id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_purchase_prices_derive_person() IS
  'Migration 235 (Phase 7.1). Keeps purchase_prices.supplier_person_id in sync with suppliers.person_id.';

DROP TRIGGER IF EXISTS trg_purchase_prices_derive_person ON public.purchase_prices;
CREATE TRIGGER trg_purchase_prices_derive_person
  BEFORE INSERT OR UPDATE OF supplier_id ON public.purchase_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_prices_derive_person();

-- -----------------------------------------------------------------------------
-- 5. CONSTRAINTS
--    product_suppliers.supplier_id is NOT NULL, so its person column can be too.
--    purchase_prices.supplier_id is nullable, so only a consistency guard.
-- -----------------------------------------------------------------------------
ALTER TABLE public.product_suppliers ALTER COLUMN supplier_person_id SET NOT NULL;

ALTER TABLE public.purchase_prices
  DROP CONSTRAINT IF EXISTS purchase_prices_supplier_person_requires_supplier_chk;
ALTER TABLE public.purchase_prices
  ADD CONSTRAINT purchase_prices_supplier_person_requires_supplier_chk
  CHECK (supplier_person_id IS NULL OR supplier_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 6. INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS product_suppliers_supplier_person_id_idx
  ON public.product_suppliers (supplier_person_id);
CREATE INDEX IF NOT EXISTS purchase_prices_supplier_person_id_idx
  ON public.purchase_prices (supplier_person_id)
  WHERE supplier_person_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.product_suppliers.supplier_person_id IS
  'Unified person behind supplier_id. Derived by trg_product_suppliers_derive_person (migration 235) - do not write directly. Prefer this over supplier_id in new queries.';
COMMENT ON COLUMN public.purchase_prices.supplier_person_id IS
  'Unified person behind supplier_id. Derived by trg_purchase_prices_derive_person (migration 235) - do not write directly. NULL exactly when supplier_id is NULL.';

NOTIFY pgrst, 'reload schema';
