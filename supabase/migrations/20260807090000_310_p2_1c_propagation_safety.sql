SET client_encoding='UTF8';

-- 310 - P2.1c. Fix two defects in 308's propagation, and clean the row they
-- polluted. Found by the P2 gate e2e run, not by review.
--
-- ============================================================================
-- WHAT WENT WRONG
-- ============================================================================
-- e2e\asan\export-purchase.spec.ts:408 failed with:
--
--   ERROR: duplicate key value violates unique constraint
--          "suppliers_accounting_code_unique_idx"
--   DETAIL: Key (accounting_code)=(99900001) already exists.
--   CONTEXT: SQL statement "UPDATE public.suppliers SET accounting_code = ..."
--            PL/pgSQL function trg_person_identifiers_propagate_asan_code()
--
-- That spec had been passing. Two separate mistakes in 308 combined:
--
-- DEFECT 1 - DELETE was not handled, and the assumption behind that was wrong.
--   308 says, in its own comment: "Not handled, deliberately: DELETE of an
--   identifier row. Identifiers are audited and revoked rather than deleted in
--   this schema." The e2e helpers delete them outright. So a spec created a
--   temporary asan identifier, the trigger copied it into a REAL supplier's
--   mirror, the spec deleted its identifier, and the mirror kept the test code.
--   Live proof before this migration: supplier b05f3194 (صباح روشناس, a real
--   supplier) held accounting_code 99900001 while no person_identifiers row
--   with that value existed anywhere.
--
-- DEFECT 2 - a mirror conflict aborted an unrelated transaction.
--   With the stale code sitting on a real supplier, the next spec that tried to
--   use 99900001 hit the mirror's unique index and the whole write failed. A
--   convenience mirror must never be able to break the write that feeds it.
--   The identifier is the source of truth and asan_list_purchase_export reads
--   the identifier, so refusing to mirror costs nothing functional; raising an
--   exception costs the caller their transaction.
--
-- ============================================================================
-- THE FIX
-- ============================================================================
--   1. Handle DELETE: clear the mirror wherever it still carries the value that
--      was removed.
--   2. Never raise on conflict: only write the mirror when no OTHER row already
--      holds that code. Otherwise leave it alone, silently.
--   3. Clean the one polluted row this created.
--
-- Live definition snapshotted to
-- docs/verification/pre-310/ before replacing (rule 2.3). Signature unchanged,
-- so CREATE OR REPLACE genuinely replaces and cannot overload (rule 2.5).
--
-- Down script: docs/verification/310-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).

CREATE OR REPLACE FUNCTION public.trg_person_identifiers_propagate_asan_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _person uuid;
  _value  text;
BEGIN
  -- DELETE arrives with OLD only; everything else uses NEW.
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind <> 'asan_person_code' THEN
      RETURN OLD;
    END IF;
    UPDATE public.customers
       SET accounting_code = NULL
     WHERE person_id = OLD.person_id
       AND accounting_code IS NOT DISTINCT FROM OLD.value_raw;
    UPDATE public.suppliers
       SET accounting_code = NULL
     WHERE person_id = OLD.person_id
       AND accounting_code IS NOT DISTINCT FROM OLD.value_raw;
    RETURN OLD;
  END IF;

  IF NEW.kind <> 'asan_person_code' THEN
    RETURN NEW;
  END IF;

  _person := NEW.person_id;

  IF NEW.status = 'revoked' THEN
    -- Clear only where the mirror still carries the value being revoked; a
    -- blanket NULL would wipe a code some other active row provides.
    UPDATE public.customers
       SET accounting_code = NULL
     WHERE person_id = _person
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    UPDATE public.suppliers
       SET accounting_code = NULL
     WHERE person_id = _person
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    RETURN NEW;
  END IF;

  IF NEW.value_raw IS NULL THEN
    RETURN NEW;
  END IF;

  _value := NEW.value_raw;

  -- NOT EXISTS is the whole point of this migration: if another row already
  -- holds the code, skip the mirror rather than raising. The identifier still
  -- records the truth and the export still reads it.
  UPDATE public.customers c
     SET accounting_code = _value
   WHERE c.person_id = _person
     AND c.accounting_code IS DISTINCT FROM _value
     AND NOT EXISTS (
       SELECT 1 FROM public.customers o
        WHERE o.accounting_code = _value AND o.id <> c.id);

  UPDATE public.suppliers s
     SET accounting_code = _value
   WHERE s.person_id = _person
     AND s.accounting_code IS DISTINCT FROM _value
     AND NOT EXISTS (
       SELECT 1 FROM public.suppliers o
        WHERE o.accounting_code = _value AND o.id <> s.id);

  RETURN NEW;
END;
$function$;

-- The trigger must now fire on DELETE too. Recreated rather than altered
-- because the event list is part of the trigger definition.
DROP TRIGGER IF EXISTS trg_person_identifiers_propagate_asan_code ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_propagate_asan_code
  AFTER INSERT OR UPDATE OF value_raw, value_normalized, status, person_id OR DELETE
  ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_identifiers_propagate_asan_code();

-- 309's pull trigger has the same conflict exposure on insert: it copies a code
-- into a new row without checking whether another row holds it. Same treatment.
CREATE OR REPLACE FUNCTION public.trg_mirror_pull_asan_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _taken boolean;
BEGIN
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

  IF _code IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'suppliers' THEN
    SELECT EXISTS (SELECT 1 FROM public.suppliers o
                    WHERE o.accounting_code = _code AND o.id IS DISTINCT FROM NEW.id)
      INTO _taken;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.customers o
                    WHERE o.accounting_code = _code AND o.id IS DISTINCT FROM NEW.id)
      INTO _taken;
  END IF;

  IF NOT _taken THEN
    NEW.accounting_code := _code;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Clean the pollution. Only rows whose code has no live identifier behind it,
-- i.e. exactly what defect 1 produced. A code that IS backed by an identifier
-- is left alone.
-- ---------------------------------------------------------------------------
UPDATE public.suppliers s
   SET accounting_code = NULL
 WHERE s.accounting_code IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.person_identifiers i
      WHERE i.person_id = s.person_id
        AND i.kind = 'asan_person_code'
        AND i.status <> 'revoked'
        AND i.value_raw = s.accounting_code);

UPDATE public.customers c
   SET accounting_code = NULL
 WHERE c.accounting_code IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.person_identifiers i
      WHERE i.person_id = c.person_id
        AND i.kind = 'asan_person_code'
        AND i.status <> 'revoked'
        AND i.value_raw = c.accounting_code);

-- Assert the end state.
DO $$
DECLARE _orphans int; _customers int;
BEGIN
  SELECT count(*) INTO _orphans
    FROM public.suppliers s
   WHERE s.accounting_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.person_identifiers i
                      WHERE i.person_id=s.person_id AND i.kind='asan_person_code'
                        AND i.status<>'revoked' AND i.value_raw=s.accounting_code);
  IF _orphans > 0 THEN
    RAISE EXCEPTION '310 failed: % supplier mirror(s) still unbacked', _orphans;
  END IF;

  -- The 11 real customer codes must survive: each is backed by an identifier.
  SELECT count(*) INTO _customers FROM public.customers WHERE accounting_code IS NOT NULL;
  IF _customers <> 11 THEN
    RAISE EXCEPTION '310 failed: expected 11 coded customers, found %', _customers;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_person_identifiers_propagate_asan_code'
                    AND tgrelid='public.person_identifiers'::regclass) THEN
    RAISE EXCEPTION '310 failed: propagation trigger missing';
  END IF;
END $$;
