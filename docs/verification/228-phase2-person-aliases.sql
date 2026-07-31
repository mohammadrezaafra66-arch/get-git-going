SET client_encoding='UTF8';
\set ON_ERROR_STOP on

-- =============================================================================
-- Verification suite for migration 228 (Phase 2)
-- Runs entirely inside BEGIN ... ROLLBACK. Nothing persists.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond THEN RAISE NOTICE 'PASS: %', _label;
  ELSE RAISE EXCEPTION 'FAIL: %', _label;
  END IF;
END $$;

-- ============================================================================
-- P1  normalize_identifier() parity with identifiers-normalize.ts
--     Every accepted mobile spelling must collapse to one E.164 value.
-- ============================================================================
SELECT pg_temp.assert(
  public.normalize_identifier('mobile_e164','09021234567') = '+989021234567'
  AND public.normalize_identifier('mobile_e164','9021234567')      = '+989021234567'
  AND public.normalize_identifier('mobile_e164','989021234567')    = '+989021234567'
  AND public.normalize_identifier('mobile_e164','00989021234567')  = '+989021234567'
  AND public.normalize_identifier('mobile_e164','۰۹۰۲۱۲۳۴۵۶۷')      = '+989021234567'
  AND public.normalize_identifier('mobile_e164','0902-123-4567')   = '+989021234567',
  'P1 mobile variants all normalize to +989021234567');

SELECT pg_temp.assert(
  public.normalize_identifier('email','  Ali@Example.COM ') = 'ali@example.com'
  AND public.normalize_identifier('landline','02112345678') = '02112345678'
  AND public.normalize_identifier('tax_id_ir','۱۲۳۴۵۶۷۸۹۰') = '1234567890'
  AND public.normalize_identifier('custom','  a   b  ') = 'a b',
  'P1b email/landline/tax_id/custom normalize correctly');

-- ============================================================================
-- P2  National ID checksum is actually enforced
-- ============================================================================
SELECT pg_temp.assert(
  public.normalize_identifier('national_id_ir','1234567891') = '1234567891',
  'P2a valid national ID 1234567891 accepted');

SELECT pg_temp.assert(
  public.normalize_identifier('national_id_ir','1234567890', false) IS NULL,
  'P2b invalid national ID 1234567890 rejected (checksum)');

SELECT pg_temp.assert(
  public.normalize_identifier('national_id_ir','1111111111', false) IS NULL,
  'P2c all-identical-digit national ID rejected');

-- ============================================================================
-- P3  The TRIGGER is authoritative: a direct INSERT that supplies a WRONG
--     value_normalized must be corrected by the database, not trusted.
--     This is the whole point of making plpgsql authoritative.
-- ============================================================================
SAVEPOINT p3;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _pid uuid; _stored text;
BEGIN
  _pid := (public.person_create_full('تست تریگر')->>'person_id')::uuid;
  INSERT INTO public.person_identifiers(person_id, kind, value_raw, value_normalized)
  VALUES (_pid, 'mobile_e164', '09021234567', 'GARBAGE-NOT-NORMALIZED');

  SELECT value_normalized INTO _stored
  FROM public.person_identifiers WHERE person_id = _pid;

  IF _stored <> '+989021234567' THEN
    RAISE EXCEPTION 'FAIL: P3 DB trusted client value_normalized (got %)', _stored;
  END IF;
  RAISE NOTICE 'PASS: P3 trigger overrode client-supplied value_normalized';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p3;

-- ============================================================================
-- P4  B3 FIX: two DIFFERENT people may hold the same PROVISIONAL mobile
--     (shared landline / not-yet-verified number must not block anyone)
-- ============================================================================
SAVEPOINT p4;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _a uuid; _b uuid;
BEGIN
  _a := (public.person_create_full('شخص الف','individual',NULL,'internal_general',NULL,true,
          '[{"kind":"mobile_e164","value_raw":"09021234567"}]'::jsonb)->>'person_id')::uuid;
  _b := (public.person_create_full('شخص ب','individual',NULL,'internal_general',NULL,true,
          '[{"kind":"mobile_e164","value_raw":"09021234567"}]'::jsonb)->>'person_id')::uuid;
  IF _a IS NULL OR _b IS NULL THEN
    RAISE EXCEPTION 'FAIL: P4 duplicate provisional mobile was blocked';
  END IF;
  RAISE NOTICE 'PASS: P4 duplicate PROVISIONAL mobile allowed for two persons';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p4;

-- ============================================================================
-- P5  ...but the same mobile may only be CONFIRMED once.
-- ============================================================================
SAVEPOINT p5;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _a uuid; _b uuid;
BEGIN
  _a := (public.person_create_full('شخص ج','individual',NULL,'internal_general',NULL,true,
          '[{"kind":"mobile_e164","value_raw":"09021234567","status":"confirmed"}]'::jsonb)->>'person_id')::uuid;
  BEGIN
    _b := (public.person_create_full('شخص د','individual',NULL,'internal_general',NULL,true,
            '[{"kind":"mobile_e164","value_raw":"09021234567","status":"confirmed"}]'::jsonb)->>'person_id')::uuid;
    RAISE EXCEPTION 'FAIL: P5 a second CONFIRMED holder of the same mobile was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: P5 second CONFIRMED holder of the same mobile rejected';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p5;

-- ============================================================================
-- P6  Strong identifiers stay globally unique even while PROVISIONAL.
-- ============================================================================
SAVEPOINT p6;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _a uuid;
BEGIN
  _a := (public.person_create_full('شخص ه','individual',NULL,'internal_general',NULL,true,
          '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb)->>'person_id')::uuid;
  BEGIN
    PERFORM public.person_create_full('شخص و','individual',NULL,'internal_general',NULL,true,
      '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: P6 duplicate PROVISIONAL national ID was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: P6 duplicate PROVISIONAL national ID rejected';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p6;

-- ============================================================================
-- P7  ALIASES: ZWNJ / spacing variants of one name match each other.
-- ============================================================================
SAVEPOINT p7;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _pid uuid; _hits int;
BEGIN
  _pid := (public.person_create_full('سحر شاهمرادی')->>'person_id')::uuid;
  INSERT INTO public.person_aliases(person_id, alias, alias_kind, created_by)
  VALUES (_pid, 'سحر شاه‌مرادی', 'misspelling', auth.uid());

  -- Searching the ZWNJ-free spelling must find the ZWNJ alias, and vice versa.
  SELECT count(*) INTO _hits
  FROM public.person_aliases
  WHERE person_id = _pid
    AND alias_normalized = public.normalize_fa_text('سحر شاهمرادی');
  IF _hits <> 1 THEN
    RAISE EXCEPTION 'FAIL: P7 ZWNJ alias did not match (hits=%)', _hits;
  END IF;
  RAISE NOTICE 'PASS: P7 «سحر شاهمرادی» and «سحر شاه‌مرادی» match as one identity';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p7;

-- ============================================================================
-- P8  Two DIFFERENT people may share a name (alias is not an identity claim).
-- ============================================================================
SAVEPOINT p8;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _a uuid; _b uuid;
BEGIN
  _a := (public.person_create_full('محمد رضایی')->>'person_id')::uuid;
  _b := (public.person_create_full('محمد رضایی')->>'person_id')::uuid;
  INSERT INTO public.person_aliases(person_id, alias) VALUES (_a, 'محمد رضایی');
  INSERT INTO public.person_aliases(person_id, alias) VALUES (_b, 'محمد رضایی');
  RAISE NOTICE 'PASS: P8 two distinct persons may share an alias';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p8;

-- ============================================================================
-- P9  ...but the SAME alias twice on ONE person is rejected.
-- ============================================================================
SAVEPOINT p9;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _a uuid;
BEGIN
  _a := (public.person_create_full('تکراری')->>'person_id')::uuid;
  INSERT INTO public.person_aliases(person_id, alias) VALUES (_a, 'سحر شاهمرادی');
  BEGIN
    -- ZWNJ variant normalizes to the same value -> must collide
    INSERT INTO public.person_aliases(person_id, alias) VALUES (_a, 'سحر شاه‌مرادی');
    RAISE EXCEPTION 'FAIL: P9 duplicate alias on one person accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: P9 duplicate alias on the same person rejected';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p9;

-- ============================================================================
-- P10 RLS on person_aliases: viewer cannot write.
-- ============================================================================
SAVEPOINT p10;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
CREATE TEMP TABLE _p10 AS
SELECT (public.person_create_full('هدف ویوئر')->>'person_id')::uuid AS id;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"20303d30-ab9d-4fc6-be96-ec5db1dcb647","role":"authenticated"}';
DO $$
DECLARE _pid uuid;
BEGIN
  SELECT id INTO _pid FROM _p10;
  BEGIN
    INSERT INTO public.person_aliases(person_id, alias) VALUES (_pid, 'نام جعلی');
    RAISE EXCEPTION 'FAIL: P10 viewer inserted an alias';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: P10 viewer blocked from inserting an alias';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p10;

-- ============================================================================
-- P11 Alias writes are audited.
-- ============================================================================
SAVEPOINT p11;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
CREATE TEMP TABLE _p11 AS
SELECT (public.person_create_full('ممیزی نام')->>'person_id')::uuid AS id;
INSERT INTO public.person_aliases(person_id, alias)
SELECT id, 'نام دوم' FROM _p11;
RESET ROLE;
DO $$
DECLARE _pid uuid;
BEGIN
  SELECT id INTO _pid FROM _p11;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_type = 'person_alias' AND action = 'person_alias.create'
      AND diff->>'person_id' = _pid::text
  ) THEN
    RAISE EXCEPTION 'FAIL: P11 no audit row for alias creation';
  END IF;
  RAISE NOTICE 'PASS: P11 alias creation is audited';
END $$;
ROLLBACK TO SAVEPOINT p11;

-- ============================================================================
-- P12 Phase 1 regression: person_create_full still works end-to-end under the
--     new trigger, and an INVALID identifier now fails cleanly with no orphan.
-- ============================================================================
SAVEPOINT p12;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _before bigint; _after bigint;
BEGIN
  SELECT count(*) INTO _before FROM public.persons;
  BEGIN
    PERFORM public.person_create_full('بد','individual',NULL,'internal_general',NULL,true,
      '[{"kind":"mobile_e164","value_raw":"12345"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: P12 invalid mobile accepted';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL;
  END;
  SELECT count(*) INTO _after FROM public.persons;
  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL: P12 orphan person left after invalid identifier';
  END IF;
  RAISE NOTICE 'PASS: P12 invalid identifier rejected atomically, no orphan';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p12;

\echo '=============== PHASE 2 TESTS PASSED — ROLLING BACK ==============='
ROLLBACK;

SELECT 'persons=' || count(*)::text FROM public.persons;
SELECT 'person_aliases_exists=' ||
       (SELECT count(*)::text FROM information_schema.tables
        WHERE table_schema='public' AND table_name='person_aliases');
