SET client_encoding='UTF8';

-- =============================================================================
-- 237 — Phase 7.3 (Group C): person FKs on the credit tables
-- =============================================================================
--
-- SCOPE — all seven credit tables, every one with customer_id NOT NULL:
--   credit_requests                       0 rows
--   credit_score_snapshots                0 rows
--   customer_capital_allocations          0 rows
--   customer_capital_allocations_dynamic  1 row
--   customer_credit_balance               7 rows
--   customer_credit_ledger                1 row
--   customer_credit_profile               0 rows
--
-- =============================================================================
-- WHAT THIS MIGRATION DOES NOT DO, AND WHY — read before "finishing the job"
-- =============================================================================
-- The Phase 7 plan asks for the credit FUNCTIONS to be rewritten to read the new
-- person columns. This migration adds the columns but deliberately leaves every
-- credit function reading customer_id. That is not laziness; keying credit off
-- person_id today would be a money bug waiting to happen:
--
--   customers.person_id is INDEXED BUT NOT UNIQUE (customers_person_id_idx is a
--   plain btree). Two customer rows may legally point at the same person. The
--   data happens to be 1:1 right now — 0 shared persons — but nothing enforces
--   it, and person_merge_candidates (migration 234) exists precisely because
--   duplicate persons are expected and already has a pending pair.
--
--   Every credit function is keyed on a single customer:
--     get_customer_credit(p_customer_id) reads
--       customer_credit_balance WHERE customer_id = p_customer_id
--   Rewriting that to WHERE customer_person_id = <person of p_customer_id> is
--   identical ONLY while the mapping is 1:1. The first time two customers share
--   a person, that query silently sums two customers' balances and hands the
--   caller a larger available_credit than either customer owns. Sales decisions
--   are made on that number.
--
--   The input to these functions is still p_customer_id, so the rewrite would
--   also buy nothing today: it would resolve customer -> person and back again
--   to answer the same question.
--
-- The safe order is: add the columns now (Phase 8 needs them to turn customers
-- into a view), and switch the credit lookups to person only once person->role
-- cardinality is settled — either a UNIQUE constraint on customers.person_id, or
-- an explicit decision that credit aggregates across all of a person's customer
-- roles. That is a business question, not a refactor.
--
-- The numeric-parity gate the plan mandates is still run, as a regression guard
-- proving these column additions changed no credit number. Results are recorded
-- in PROGRESS.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM public.customers WHERE person_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % customer(s) have no person_id.', v_bad;
  END IF;
  RAISE NOTICE 'Preflight OK: every customer resolves to a person.';
END
$$;

-- -----------------------------------------------------------------------------
-- 1. COLUMNS — same shape on all seven tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.credit_requests
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.credit_score_snapshots
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.customer_capital_allocations
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.customer_capital_allocations_dynamic
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.customer_credit_balance
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.customer_credit_ledger
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.customer_credit_profile
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 2. BACKFILL + 3. ASSERTION, table by table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t          text;
  v_updated  integer;
  v_orphans  integer;
  v_total    integer := 0;
  tables     text[] := ARRAY[
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
    EXECUTE format(
      'UPDATE public.%I x SET customer_person_id = c.person_id
         FROM public.customers c
        WHERE c.id = x.customer_id
          AND x.customer_person_id IS DISTINCT FROM c.person_id', t);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;

    EXECUTE format(
      'SELECT count(*) FROM public.%I
        WHERE customer_id IS NOT NULL AND customer_person_id IS NULL', t)
      INTO v_orphans;

    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'ABORT: % has % row(s) with a customer but no person.', t, v_orphans;
    END IF;

    RAISE NOTICE '  %: % row(s) backfilled, 0 orphans.', t, v_updated;
  END LOOP;

  RAISE NOTICE 'Group C backfill verified: % row(s) across 7 tables, 0 orphans.', v_total;
END
$$;

-- -----------------------------------------------------------------------------
-- 4. DERIVATION TRIGGER
--    ONE function for all seven tables. plpgsql resolves NEW.customer_id at
--    runtime per table, and every Group C table uses the same column names, so
--    seven near-identical copies would be pure duplication.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_credit_derive_customer_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_person_id := NULL;
  ELSE
    SELECT c.person_id INTO NEW.customer_person_id
      FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_credit_derive_customer_person() IS
  'Migration 237 (Phase 7.3). Shared BEFORE trigger for every credit table: keeps customer_person_id in sync with customers.person_id. The database is authoritative; a client-supplied value is ignored. Credit MATH still keys on customer_id - see the migration header for why.';

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
    EXECUTE format(
      'CREATE TRIGGER trg_%I_derive_person
         BEFORE INSERT OR UPDATE OF customer_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_credit_derive_customer_person()', t, t);
    -- Legacy column is NOT NULL on every Group C table, so the person column can
    -- be too. Set after the trigger so any concurrent insert is already covered.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN customer_person_id SET NOT NULL', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (customer_person_id)',
      t || '_customer_person_id_idx', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.customer_person_id IS %L', t,
      'Unified person behind customer_id. Derived by trg_' || t ||
      '_derive_person (migration 237) - do not write directly. Credit arithmetic still keys on customer_id; see migration 237 header.');
  END LOOP;
  RAISE NOTICE 'Triggers, NOT NULL, indexes and comments applied to 7 credit tables.';
END
$$;

NOTIFY pgrst, 'reload schema';
