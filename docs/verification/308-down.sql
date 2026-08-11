-- Down script for migration 308 (P2.1 - suppliers.accounting_code).
--
-- 308 was purely additive: one nullable column, one CHECK, one partial unique
-- index, one new trigger function and its trigger. It altered no existing
-- function and no existing column, so removing those five objects returns the
-- schema exactly to its pre-308 state.
--
-- DATA NOTE. The backfill touched 0 rows on this database (no person holding an
-- asan_person_code had a suppliers row). Dropping the column therefore loses
-- nothing here. On a database where suppliers HAVE been given codes, dropping
-- the column discards them - the source of truth survives in
-- person_identifiers, so re-running 308 would restore the mirror. Check first:
--
--   SELECT count(*) FROM public.suppliers WHERE accounting_code IS NOT NULL;
--
-- ORDER MATTERS. The trigger goes before the column: it writes
-- suppliers.accounting_code, so dropping the column while the trigger is live
-- would break any subsequent identifier write with a missing-column error.
--
-- customers.accounting_code is NOT touched. It predates 308 and is written by
-- CustomerForm.tsx directly; only the propagation trigger 308 added is removed.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_person_identifiers_propagate_asan_code
  ON public.person_identifiers;

DROP FUNCTION IF EXISTS public.trg_person_identifiers_propagate_asan_code();

DROP INDEX IF EXISTS public.suppliers_accounting_code_unique_idx;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_accounting_code_format;

ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS accounting_code;

-- Confirm the customer side survived untouched.
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='customers' AND column_name='accounting_code';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Rollback error: customers.accounting_code is missing - it must survive.';
  END IF;
END $$;
