SET client_encoding='UTF8';

-- 308 - P2.1. Give suppliers an Asan code, symmetric with customers.
--
-- Goal (owner): unblock the Asan purchase export, which cannot emit a supplier
-- without an accounting code.
--
-- ============================================================================
-- CORRECTION TO THE MISSION FILE
-- ============================================================================
-- P2_ASAN_CODE.md phase 2.1 step 4 says "extend the trigger from phase 1.5".
-- There is no such trigger. P1.5 has not run, and no propagation trigger exists
-- anywhere: person_identifiers carries exactly five triggers, all of them audit,
-- updated_at, validate or normalise. customers.accounting_code is written by
-- CustomerForm.tsx directly, not by the database.
--
-- So this migration CREATES the propagation rather than extending it, and
-- covers both mirrors - which is what P2.2 step 4 asks for when it says the
-- identifier is the source and the mirror is a mirror.
--
-- ============================================================================
-- WHY THE MIRROR GETS value_raw AND NOT value_normalized
-- ============================================================================
-- normalize_identifier() deliberately strips leading zeros for this kind:
--
--     -- Leading zeros are stripped so '0102012' and '102012' cannot become two
--     -- codes for two different people
--     _v := ltrim(_v, '0');
--
-- That makes value_normalized the canonical form for UNIQUENESS, and value_raw
-- what the user actually typed. Propagating the normalised form would silently
-- rewrite a real code: person 190eeb0b holds raw '002', normalised '2', and the
-- Asan export would start emitting '2'.
--
-- Verified live before choosing: comparing the 11 coded customers against
-- value_normalized shows 10 agree / 1 disagrees; against value_raw, 11 agree and
-- 0 disagree. The existing convention in this database is raw, and the single
-- apparent "drift" was this normalisation artefact, not real drift.
--
-- ============================================================================
-- SHAPE, MIRRORED FROM customers
-- ============================================================================
--   column     text NULL
--   CHECK      (accounting_code IS NULL OR ~ '^[A-Za-z0-9_-]{1,30}$')
--   UNIQUE     partial, WHERE accounting_code IS NOT NULL
-- These are copied from customers_accounting_code_format and
-- customers_accounting_code_unique_idx so the two tables behave identically.
--
-- Down script: docs/verification/308-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS accounting_code text;

COMMENT ON COLUMN public.suppliers.accounting_code IS
  'Asan account code mirror. Source of truth is person_identifiers(kind=asan_person_code).value_raw; maintained by trg_person_identifiers_propagate_asan_code.';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_accounting_code_format;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_accounting_code_format
  CHECK (accounting_code IS NULL OR accounting_code ~ '^[A-Za-z0-9_-]{1,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_accounting_code_unique_idx
  ON public.suppliers (accounting_code)
  WHERE accounting_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill. Expected to touch 0 rows: no person holding an asan_person_code has
-- a suppliers row today (verified live - 11 coded persons, 0 of them suppliers).
-- Written anyway so the migration is correct on any database, not just this one.
-- ---------------------------------------------------------------------------
WITH src AS (
  SELECT s.id AS supplier_id, i.value_raw
    FROM public.suppliers s
    JOIN public.person_identifiers i
      ON i.person_id = s.person_id
     AND i.kind = 'asan_person_code'
     AND i.status <> 'revoked'
   WHERE s.accounting_code IS NULL
     AND i.value_raw IS NOT NULL
)
UPDATE public.suppliers s
   SET accounting_code = src.value_raw
  FROM src
 WHERE s.id = src.supplier_id;

-- ---------------------------------------------------------------------------
-- Propagation. person_identifiers is the source; both mirrors follow.
--
-- SECURITY DEFINER because the trigger writes customers/suppliers on behalf of
-- whoever wrote the identifier, and that user is not guaranteed to hold UPDATE
-- on the mirror tables. search_path is pinned for the usual reason.
--
-- Not handled, deliberately: DELETE of an identifier row. Identifiers are
-- audited and revoked rather than deleted in this schema, and inventing a
-- delete path here would be guessing at a flow that does not exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_person_identifiers_propagate_asan_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind <> 'asan_person_code' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'revoked' THEN
    -- Clear the mirror only where it still carries the value being revoked.
    -- A blanket NULL would wipe a code that some other active row provides.
    UPDATE public.customers
       SET accounting_code = NULL
     WHERE person_id = NEW.person_id
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    UPDATE public.suppliers
       SET accounting_code = NULL
     WHERE person_id = NEW.person_id
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    RETURN NEW;
  END IF;

  IF NEW.value_raw IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers
     SET accounting_code = NEW.value_raw
   WHERE person_id = NEW.person_id
     AND accounting_code IS DISTINCT FROM NEW.value_raw;

  UPDATE public.suppliers
     SET accounting_code = NEW.value_raw
   WHERE person_id = NEW.person_id
     AND accounting_code IS DISTINCT FROM NEW.value_raw;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_person_identifiers_propagate_asan_code ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_propagate_asan_code
  AFTER INSERT OR UPDATE OF value_raw, value_normalized, status, person_id
  ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_identifiers_propagate_asan_code();

-- ---------------------------------------------------------------------------
-- Assert the intended end state inside the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int; _bad int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='suppliers' AND column_name='accounting_code';
  IF _n <> 1 THEN RAISE EXCEPTION '308 failed: suppliers.accounting_code missing'; END IF;

  SELECT count(*) INTO _n FROM pg_indexes
   WHERE schemaname='public' AND indexname='suppliers_accounting_code_unique_idx';
  IF _n <> 1 THEN RAISE EXCEPTION '308 failed: partial unique index missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_person_identifiers_propagate_asan_code'
                    AND tgrelid='public.person_identifiers'::regclass) THEN
    RAISE EXCEPTION '308 failed: propagation trigger not installed';
  END IF;

  -- No supplier may now hold a code that disagrees with its person's identifier.
  SELECT count(*) INTO _bad
    FROM public.suppliers s
    JOIN public.person_identifiers i
      ON i.person_id = s.person_id AND i.kind='asan_person_code' AND i.status <> 'revoked'
   WHERE s.accounting_code IS DISTINCT FROM i.value_raw;
  IF _bad > 0 THEN
    RAISE EXCEPTION '308 failed: % supplier(s) disagree with their identifier', _bad;
  END IF;
END $$;
