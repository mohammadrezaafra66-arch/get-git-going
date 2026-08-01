SET client_encoding='UTF8';

-- =============================================================================
-- 237-down — rollback for migration 237 (Group C credit person FKs)
-- =============================================================================
--
-- Safe by construction: 237 added only DERIVED columns, their triggers, indexes
-- and NOT NULL. It rewrote no function and changed no credit arithmetic (see the
-- 237 header for why the credit functions were deliberately left keyed on
-- customer_id), so there is no behaviour to restore — only columns to drop.
--
-- Backup taken before 237 was applied:
--   D:\backups\afrakala\pre_phase7_3_credit_20260801_194318.sql.gz
--   sha256 ce24ddb87153a5df7de3a3b4f919d28e15e398b3b59ea0bb6abc0b6c5786479f
-- Pre-237 function snapshots: docs/verification/pre-237/
--
-- HOW TO RUN:
--   docker cp docs\verification\237-down.sql afrakala-lan-db:/tmp/237-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/237-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

DO $$
DECLARE
  t      text;
  tables text[] := ARRAY[
    'credit_requests',
    'credit_score_snapshots',
    'customer_capital_allocations',
    'customer_capital_allocations_dynamic',
    'customer_credit_balance',
    'customer_credit_ledger',
    'customer_credit_profile'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_derive_person ON public.%I', t, t);
    EXECUTE format('DROP INDEX IF EXISTS public.%I', t || '_customer_person_id_idx');
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS customer_person_id', t);
  END LOOP;
  RAISE NOTICE 'Group C person columns, triggers and indexes dropped.';
END
$$;

DROP FUNCTION IF EXISTS public.tg_credit_derive_customer_person();

DO $$
DECLARE v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND column_name='customer_person_id'
     AND table_name IN ('credit_requests','credit_score_snapshots','customer_capital_allocations',
                        'customer_capital_allocations_dynamic','customer_credit_balance',
                        'customer_credit_ledger','customer_credit_profile');
  IF v_cols > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % credit column(s) remain', v_cols;
  END IF;
  RAISE NOTICE 'Migration 237 rolled back cleanly. No credit arithmetic was ever changed.';
END
$$;

NOTIFY pgrst, 'reload schema';
