SET client_encoding='UTF8';

-- =============================================================================
-- 231-down — rollback for migration 231 (Phase 5 person FK transition)
-- =============================================================================
--
-- Reverses 20260801160000_231_phase5_person_fk_transition.sql completely.
--
-- SAFETY
--   Everything migration 231 created is additive and derived. Dropping it
--   destroys no source data: customer_person_id / supplier_person_id /
--   payee_person_id are computed from customer_id / supplier_id /
--   payee_supplier_id / payee_customer_id, which this script does not touch.
--   Re-applying 231 rebuilds the columns byte-for-byte from the legacy FKs.
--
--   This script therefore does NOT violate the "no DROP/TRUNCATE/DELETE on a
--   table holding data" rule: it drops only columns and objects that migration
--   231 itself added, and no row is deleted.
--
-- HOW TO RUN (same rules as any migration - never pipe Persian SQL through
-- PowerShell):
--   docker cp docs\verification\231-down.sql afrakala-lan-db:/tmp/231-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/231-down.sql
--   docker restart afrakala-lan-rest
--
-- IF THIS IS NOT ENOUGH
--   Full restore from the pre-Phase-5 backup:
--     D:\backups\afrakala\afrakala-pre-phase5-20260801-151045.sql.gz
--     sha256 ef4ca51e6553ba6a1b49bcb6a853a3d0069d56a96961e3a6bb6805810374705b
--   Restore into a NEW database and rename; do not restore over a live one.
--   See D:\backups\BACKUP_LOG.txt.
-- =============================================================================

-- 1. Triggers first, so nothing tries to write the columns while they go away.
DROP TRIGGER IF EXISTS trg_sales_quotes_derive_person ON public.sales_quotes;
DROP TRIGGER IF EXISTS trg_purchases_derive_person ON public.purchases;
DROP TRIGGER IF EXISTS trg_payment_vouchers_derive_person ON public.payment_vouchers;

DROP FUNCTION IF EXISTS public.tg_sales_quotes_derive_person();
DROP FUNCTION IF EXISTS public.tg_purchases_derive_person();
DROP FUNCTION IF EXISTS public.tg_payment_vouchers_derive_person();

-- 2. Guard constraints.
ALTER TABLE public.sales_quotes
  DROP CONSTRAINT IF EXISTS sales_quotes_customer_person_requires_customer_chk;
ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_supplier_person_requires_supplier_chk;
ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_payee_person_requires_payee_chk;

-- 3. Indexes.
DROP INDEX IF EXISTS public.sales_quotes_customer_person_id_idx;
DROP INDEX IF EXISTS public.purchases_supplier_person_id_idx;
DROP INDEX IF EXISTS public.payment_vouchers_payee_person_id_idx;

-- 4. Drift report helper.
DROP FUNCTION IF EXISTS public.person_fk_drift_report();

-- 5. The derived columns. Their FKs to persons(id) go with them.
ALTER TABLE public.sales_quotes     DROP COLUMN IF EXISTS customer_person_id;
ALTER TABLE public.purchases        DROP COLUMN IF EXISTS supplier_person_id;
ALTER TABLE public.payment_vouchers DROP COLUMN IF EXISTS payee_person_id;

-- 6. Restore the pre-231 comments on customers / suppliers.
--    Captured from the live database before 231 was applied. The two TABLE
--    comments did not exist before 231, so they reset to NULL; the two COLUMN
--    comments did exist and are restored verbatim rather than erased.
COMMENT ON TABLE public.customers IS NULL;
COMMENT ON TABLE public.suppliers IS NULL;
COMMENT ON COLUMN public.customers.person_id IS
  'Optional link to public.persons unified person record. Added for Phase 2 customer-person integration (S17). Nullable until controlled backfill/linking steps.';
COMMENT ON COLUMN public.suppliers.person_id IS
  'Bridge to the unified person record (item 229). Nullable: legacy suppliers predate the persons model and are backfilled in a later phase. Mirrors customers.person_id.';

-- 7. Confirm the rollback is complete.
DO $$
DECLARE
  v_cols     integer;
  v_triggers integer;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (   (table_name = 'sales_quotes'     AND column_name = 'customer_person_id')
          OR (table_name = 'purchases'        AND column_name = 'supplier_person_id')
          OR (table_name = 'payment_vouchers' AND column_name = 'payee_person_id'));

  SELECT count(*) INTO v_triggers
    FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('trg_sales_quotes_derive_person',
                    'trg_purchases_derive_person',
                    'trg_payment_vouchers_derive_person');

  IF v_cols > 0 OR v_triggers > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % column(s), % trigger(s) remain', v_cols, v_triggers;
  END IF;

  RAISE NOTICE 'Migration 231 rolled back cleanly: 0 columns, 0 triggers remain.';
END
$$;

NOTIFY pgrst, 'reload schema';
