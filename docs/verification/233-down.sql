SET client_encoding='UTF8';

-- =============================================================================
-- 233-down — rollback for migration 233 (person_id NOT NULL)
-- =============================================================================
--
-- Drops the two NOT NULL constraints. Data is deliberately left alone.
--
-- WHY NO DATA ROLLBACK
--   Migration 233 created persons for the orphan supplier/customer rows and
--   linked them. Those persons are real records, not scaffolding — deleting
--   them would destroy identity data and would also violate the project rule
--   against DELETE on tables holding data. Re-applying 233 after this rollback
--   is a no-op for the backfill (nothing is NULL any more) and simply re-adds
--   the constraints.
--
--   If you truly need the pre-233 row set, restore the backup instead:
--     D:\backups\afrakala\pre_phase6_3_20260801_180920.sql.gz
--     sha256 8edecb25d7ec7071641e54c253da6114f1f8e886c888efa17b6bb7f22baa12ce
--   Restore into a NEW database and rename; never over a live one.
--
-- HOW TO RUN:
--   docker cp docs\verification\233-down.sql afrakala-lan-db:/tmp/233-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/233-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

ALTER TABLE public.suppliers ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN person_id DROP NOT NULL;

-- Restore the migration-231 wording, which described the columns as nullable.
COMMENT ON COLUMN public.suppliers.person_id IS
  'The unified person this supplier role belongs to. 100% populated as of migration 231 but still nullable: SupplierForm.tsx and SupplierReferralModal.tsx can still insert without one. Phase 6 moves them onto person_create_inline, after which this becomes NOT NULL.';
COMMENT ON COLUMN public.customers.person_id IS
  'The unified person this customer role belongs to. 100% populated as of migration 231 but still nullable: CustomerForm.tsx and customers/functions.ts can still insert without one. Phase 6 moves them onto person_create_inline, after which this becomes NOT NULL.';

DO $$
DECLARE
  v_still_notnull integer;
BEGIN
  SELECT count(*) INTO v_still_notnull
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name = 'person_id'
     AND table_name IN ('suppliers', 'customers')
     AND is_nullable = 'NO';

  IF v_still_notnull > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % column(s) still NOT NULL', v_still_notnull;
  END IF;

  RAISE NOTICE 'Migration 233 rolled back: person_id is nullable again on both tables.';
END
$$;

NOTIFY pgrst, 'reload schema';
