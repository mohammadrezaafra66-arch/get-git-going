SET client_encoding='UTF8';

-- =============================================================================
-- 235-down — rollback for migration 235 (Group A product/purchasing person FKs)
-- =============================================================================
--
-- Everything 235 added is additive and DERIVED: supplier_person_id is computed
-- from supplier_id, which this script does not touch. Dropping it destroys no
-- source data, and re-applying 235 rebuilds the columns byte-for-byte.
--
-- HOW TO RUN:
--   docker cp docs\verification\235-down.sql afrakala-lan-db:/tmp/235-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/235-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

DROP TRIGGER IF EXISTS trg_product_suppliers_derive_person ON public.product_suppliers;
DROP TRIGGER IF EXISTS trg_purchase_prices_derive_person ON public.purchase_prices;
DROP FUNCTION IF EXISTS public.tg_product_suppliers_derive_person();
DROP FUNCTION IF EXISTS public.tg_purchase_prices_derive_person();

ALTER TABLE public.purchase_prices
  DROP CONSTRAINT IF EXISTS purchase_prices_supplier_person_requires_supplier_chk;

DROP INDEX IF EXISTS public.product_suppliers_supplier_person_id_idx;
DROP INDEX IF EXISTS public.purchase_prices_supplier_person_id_idx;

ALTER TABLE public.product_suppliers DROP COLUMN IF EXISTS supplier_person_id;
ALTER TABLE public.purchase_prices   DROP COLUMN IF EXISTS supplier_person_id;

DO $$
DECLARE v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND column_name='supplier_person_id'
     AND table_name IN ('product_suppliers','purchase_prices');
  IF v_cols > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % column(s) remain', v_cols;
  END IF;
  RAISE NOTICE 'Migration 235 rolled back cleanly.';
END
$$;

NOTIFY pgrst, 'reload schema';
