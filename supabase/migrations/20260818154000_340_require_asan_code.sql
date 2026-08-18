-- 340 -- task 1.3 -- require_asan_code(p_person_id uuid)
--
-- Returns the party's Asan person code, or raises P0001 naming the party if there is none.
-- This is the single enforcement point for the mandatory-code rule; every create RPC calls it
-- before writing anything, so a document that would be silently withheld by the Asan export is
-- refused at the door instead (decisions.md D5 reasoning, applied to the code rule).
--
-- decisions.md D6: reads ONLY person_identifiers. It deliberately does NOT fall back to
-- customers.accounting_code or suppliers.accounting_code. Those mirrors can disagree with the
-- identifier -- one test customer has customers.accounting_code = 114067 and no identifier row
-- at all -- and the Asan export reads the identifier, so a fallback would let a document be
-- created that the export then refuses. Two sources of truth for an account code is how they
-- drift. Migration 295 already carries an explicit gate to the same effect.
--
-- Status is deliberately NOT filtered: all 11 existing codes are status='provisional' and the
-- export does not filter on status either (ground-truth section 12). Existence is the rule.
--
-- ROLLBACK: docs/verification/340-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.require_asan_code(p_person_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _name text;
BEGIN
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص برای بررسی کد آسان الزامی است'
      USING ERRCODE = '22023';
  END IF;

  SELECT NULLIF(btrim(pi.value_normalized), '')
    INTO _code
    FROM public.person_identifiers pi
   WHERE pi.person_id = p_person_id
     AND pi.kind = 'asan_person_code'
   LIMIT 1;

  IF _code IS NOT NULL THEN
    RETURN _code;
  END IF;

  -- Name the party. The accountant needs to know WHO to go and fix, not that "a code is
  -- missing". If the person row itself is gone, say so rather than printing a bare uuid.
  SELECT p.display_name INTO _name FROM public.persons p WHERE p.id = p_person_id;

  IF _name IS NULL THEN
    RAISE EXCEPTION 'شخص یافت نشد؛ بدون کد آسان نمی‌توان سند ثبت کرد'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE EXCEPTION 'کد آسان برای «%» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید', _name
    USING ERRCODE = 'P0001';
END;
$function$;

COMMENT ON FUNCTION public.require_asan_code(uuid) IS
  'Returns the person Asan code or raises P0001 naming the party. Reads person_identifiers only (D6).';

REVOKE ALL ON FUNCTION public.require_asan_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_asan_code(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.require_asan_code(uuid) TO authenticated;

DO $verify$
DECLARE
  _with    uuid;
  _without uuid;
  _got     text;
BEGIN
  -- A person that HAS a code must return it.
  SELECT pi.person_id INTO _with
    FROM public.person_identifiers pi
   WHERE pi.kind = 'asan_person_code'
     AND NULLIF(btrim(pi.value_normalized), '') IS NOT NULL
   LIMIT 1;

  IF _with IS NOT NULL THEN
    _got := public.require_asan_code(_with);
    IF _got IS NULL OR btrim(_got) = '' THEN
      RAISE EXCEPTION '340: require_asan_code returned empty for a person that has a code';
    END IF;
  END IF;

  -- A person that LACKS one must raise P0001.
  SELECT p.id INTO _without
    FROM public.persons p
   WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                      WHERE pi.person_id = p.id AND pi.kind = 'asan_person_code')
   LIMIT 1;

  IF _without IS NOT NULL THEN
    DECLARE
      _raised boolean := false;
    BEGIN
      BEGIN
        PERFORM public.require_asan_code(_without);
      EXCEPTION WHEN sqlstate 'P0001' THEN
        _raised := true;   -- expected
      END;
      -- Asserted OUTSIDE the handler on purpose. A bare RAISE EXCEPTION inside it would default
      -- to P0001 and be caught by the very handler under test, making this assertion unable to
      -- fail.
      IF NOT _raised THEN
        RAISE EXCEPTION '340: require_asan_code did NOT raise for a person with no code'
          USING ERRCODE = '39000';
      END IF;
    END;
  END IF;
END
$verify$;
