-- Down script for migration 309 (P2.1b - order-independent Asan-code mirroring).
--
-- 309 added one function and two BEFORE INSERT triggers. It changed no column,
-- no constraint and no existing function, so dropping the three objects returns
-- the schema to its post-308 state.
--
-- WHAT REVERTING COSTS. 308's propagation survives, but it only works in one
-- order: identifier written while the mirror row already exists. After this
-- rollback, a supplier or customer created through person_create_inline WITH an
-- Asan code gets the identifier and a NULL mirror again, silently - that is the
-- exact defect 309 exists to fix. The Asan purchase export is unaffected either
-- way, because it reads person_identifiers.value_normalized directly rather than
-- the mirror column.
--
-- Rows already filled by 309 keep their value; this only removes the mechanism.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_customers_pull_asan_code ON public.customers;
DROP TRIGGER IF EXISTS trg_suppliers_pull_asan_code ON public.suppliers;
DROP FUNCTION IF EXISTS public.trg_mirror_pull_asan_code();

-- 308's direction must survive this rollback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_person_identifiers_propagate_asan_code'
       AND tgrelid = 'public.person_identifiers'::regclass
  ) THEN
    RAISE EXCEPTION 'Rollback error: 308 propagation trigger is missing - it must survive.';
  END IF;
END $$;
