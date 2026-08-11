SET client_encoding='UTF8';
\set ON_ERROR_STOP on

-- Dry-run: apply the migration, exercise it, then throw it all away.
BEGIN;


\echo '=============== DDL APPLIED IN TX ==============='

-- Helper: impersonate a user as the `authenticated` role so RLS actually applies.
-- (supabase_admin is the table owner and would bypass every policy.)

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond THEN RAISE NOTICE 'PASS: %', _label;
  ELSE RAISE EXCEPTION 'FAIL: %', _label;
  END IF;
END $$;

-- ============================================================================
-- T1  admin creates an internal_general person  -> ALLOWED
-- ============================================================================
SAVEPOINT t1;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SELECT pg_temp.assert(
  (public.person_create_full('تست ادمین')->>'person_id') IS NOT NULL,
  'T1 admin can create internal_general person');
RESET ROLE;
ROLLBACK TO SAVEPOINT t1;

-- ============================================================================
-- T2  admin creates a restricted_executive person -> ALLOWED
-- ============================================================================
SAVEPOINT t2;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SELECT pg_temp.assert(
  (public.person_create_full('تست محرمانه', 'individual', NULL, 'restricted_executive')->>'person_id') IS NOT NULL,
  'T2 admin can create restricted_executive person');
RESET ROLE;
ROLLBACK TO SAVEPOINT t2;

-- ============================================================================
-- T3  sales creates an internal_general person -> ALLOWED  (THE REGRESSION FIX)
--     This is the case that was DENIED before this migration.
-- ============================================================================
SAVEPOINT t3;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
SELECT pg_temp.assert(
  (public.person_create_full('تست فروش')->>'person_id') IS NOT NULL,
  'T3 sales CAN create internal_general person');
RESET ROLE;
ROLLBACK TO SAVEPOINT t3;

-- ============================================================================
-- T4  sales creates a restricted_finance person -> DENIED (scope constraint)
-- ============================================================================
SAVEPOINT t4;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_full('تست محدود فروش', 'individual', NULL, 'restricted_finance');
  RAISE EXCEPTION 'FAIL: T4 sales was able to create a restricted_finance person';
EXCEPTION
  WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: T4 sales denied restricted_finance (42501)';
  WHEN check_violation THEN RAISE NOTICE 'PASS: T4 sales denied restricted_finance (23514)';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t4;

-- ============================================================================
-- T5  accountant creates an internal_general person -> ALLOWED
-- ============================================================================
SAVEPOINT t5;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90c0479f-410d-4fff-9e00-34bbba1cce2b","role":"authenticated"}';
SELECT pg_temp.assert(
  (public.person_create_full('تست حسابدار')->>'person_id') IS NOT NULL,
  'T5 accountant CAN create internal_general person');
RESET ROLE;
ROLLBACK TO SAVEPOINT t5;

-- ============================================================================
-- T6  viewer creates a person -> DENIED (no new capability)
-- ============================================================================
SAVEPOINT t6;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"20303d30-ab9d-4fc6-be96-ec5db1dcb647","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_full('تست ویوئر');
  RAISE EXCEPTION 'FAIL: T6 viewer was able to create a person';
EXCEPTION
  WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: T6 viewer denied (42501)';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t6;

-- ============================================================================
-- T7  sales creates person + identifier + context link atomically -> ALLOWED
-- ============================================================================
SAVEPOINT t7;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _r jsonb; _pid uuid;
BEGIN
  _r := public.person_create_full(
          'شرکت آزمایشی الف',
          'organization',
          'شرکت آزمایشی الف (سهامی خاص)',
          'internal_general',
          'ایجادشده حین ثبت خرید',
          true,
          '[{"kind":"mobile_e164","value_raw":"09121234567","value_normalized":"+989121234567","is_primary":true,"status":"provisional"}]'::jsonb,
          '[]'::jsonb,
          'purchase_owner');
  _pid := (_r->>'person_id')::uuid;

  IF (_r->>'identifiers_added')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: T7 identifier not recorded';
  END IF;
  IF (_r->>'context_link_id') IS NULL THEN
    RAISE EXCEPTION 'FAIL: T7 context link not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.person_identifiers WHERE person_id = _pid
                 AND value_normalized = '+989121234567') THEN
    RAISE EXCEPTION 'FAIL: T7 identifier row missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.person_context_links WHERE person_id = _pid
                 AND context_kind = 'purchase_owner' AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: T7 context link row missing';
  END IF;
  RAISE NOTICE 'PASS: T7 sales created person+identifier+context atomically';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t7;

-- ============================================================================
-- T8  ATOMICITY: duplicate identifier must leave NO orphan person.
--     This is the defect createPerson() documents and this RPC exists to fix.
-- ============================================================================
SAVEPOINT t8;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _before int; _after int;
BEGIN
  PERFORM public.person_create_full(
    'اولی', 'individual', NULL, 'internal_general', NULL, true,
    '[{"kind":"national_id_ir","value_raw":"0012345679","value_normalized":"0012345679"}]'::jsonb);

  SELECT count(*) INTO _before FROM public.persons;

  BEGIN
    PERFORM public.person_create_full(
      'دومی', 'individual', NULL, 'internal_general', NULL, true,
      '[{"kind":"national_id_ir","value_raw":"0012345679","value_normalized":"0012345679"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: T8 duplicate identifier was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  SELECT count(*) INTO _after FROM public.persons;
  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL: T8 ORPHAN PERSON LEFT BEHIND (before=% after=%)', _before, _after;
  END IF;
  IF EXISTS (SELECT 1 FROM public.persons WHERE display_name = 'دومی') THEN
    RAISE EXCEPTION 'FAIL: T8 orphan person "دومی" persisted';
  END IF;
  RAISE NOTICE 'PASS: T8 duplicate identifier rolled back cleanly, no orphan person';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t8;

-- ============================================================================
-- T9  blank display_name -> rejected with a clean error
-- ============================================================================
SAVEPOINT t9;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_full('   ');
  RAISE EXCEPTION 'FAIL: T9 blank display_name accepted';
EXCEPTION WHEN sqlstate '22023' THEN
  RAISE NOTICE 'PASS: T9 blank display_name rejected';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t9;

-- ============================================================================
-- T10 audit trail is written by the existing trigger
-- ============================================================================
-- NOTE: audit_logs SELECT is admin-only ("admins read audit logs"), so the
-- sales user that WRITES the audit row cannot read it back. The assertion is
-- therefore made after RESET ROLE, as the table owner, with RLS bypassed.
SAVEPOINT t10;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
CREATE TEMP TABLE _t10 AS
SELECT (public.person_create_full('تست ممیزی')->>'person_id')::uuid AS id;
RESET ROLE;
DO $$
DECLARE _pid uuid;
BEGIN
  SELECT id INTO _pid FROM _t10;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_type = 'person' AND entity_id = _pid::text AND action = 'person.create'
  ) THEN
    RAISE EXCEPTION 'FAIL: T10 no audit_logs row for person.create';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_id = _pid::text
      AND actor_id = '00ebe9d3-b467-453c-89d6-08bab46335c2'::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: T10 audit row does not attribute the sales actor';
  END IF;
  RAISE NOTICE 'PASS: T10 audit_logs row written and attributed to the sales actor';
END $$;
ROLLBACK TO SAVEPOINT t10;

-- ============================================================================
-- T11 sales cannot attach an identifier to a person it cannot SEE
--     (restricted_executive person created by admin)
-- ============================================================================
SAVEPOINT t11;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
CREATE TEMP TABLE _hidden AS
SELECT (public.person_create_full('شخص محرمانه', 'individual', NULL, 'restricted_executive')->>'person_id')::uuid AS id;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _hid uuid;
BEGIN
  SELECT id INTO _hid FROM _hidden;
  BEGIN
    INSERT INTO public.person_identifiers(person_id, kind, value_raw, value_normalized)
    VALUES (_hid, 'mobile_e164', '09129999999', '+989129999999');
    RAISE EXCEPTION 'FAIL: T11 sales attached identifier to an invisible person';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: T11 sales blocked from writing to an invisible person';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t11;

\echo '=============== ALL TESTS PASSED — ROLLING BACK ==============='
ROLLBACK;

-- Prove nothing persisted.
SELECT 'persons_after_rollback=' || count(*)::text FROM public.persons;
