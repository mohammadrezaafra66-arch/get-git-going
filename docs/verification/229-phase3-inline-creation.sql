SET client_encoding='UTF8';
\set ON_ERROR_STOP on

-- =============================================================================
-- Verification suite for migration 229 (Phase 3 — inline person creation)
-- Runs entirely inside BEGIN ... ROLLBACK. Nothing persists.
--
-- Test users (single-role, from user_roles):
--   admin      05098088-2849-43f4-8eb5-7c473c3832ec
--   manager    e534b94d-a1a5-4614-991f-f4803eace751
--   sales      00ebe9d3-b467-453c-89d6-08bab46335c2
--   accountant 90c0479f-410d-4fff-9e00-34bbba1cce2b
--   viewer     20303d30-ab9d-4fc6-be96-ec5db1dcb647
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
-- T1  Supplier created inline is IMMEDIATELY visible to PurchaseForm's query.
--     This is the whole point of the phase.
-- ============================================================================
SAVEPOINT t1;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _r jsonb; _pid uuid; _sid uuid; _seen int;
BEGIN
  _r := public.person_create_inline(
          'شرکت سپاهان', 'supplier', 'organization',
          '[{"kind":"mobile_e164","value_raw":"09121234567","is_primary":true}]'::jsonb);
  _pid := (_r->>'person_id')::uuid;
  _sid := (_r->>'legacy_id')::uuid;

  IF _r->>'legacy_table' <> 'suppliers' THEN
    RAISE EXCEPTION 'FAIL: T1 legacy_table = % (expected suppliers)', _r->>'legacy_table';
  END IF;

  -- Exactly the query PurchaseForm runs.
  SELECT count(*) INTO _seen
  FROM public.suppliers
  WHERE id = _sid AND is_active = true;
  IF _seen <> 1 THEN
    RAISE EXCEPTION 'FAIL: T1 new supplier not visible to the dropdown query';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _sid AND person_id = _pid) THEN
    RAISE EXCEPTION 'FAIL: T1 supplier not bridged to person';
  END IF;
  RAISE NOTICE 'PASS: T1 inline supplier is selectable in PurchaseForm immediately';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t1;

-- ============================================================================
-- T2  Identifier normalized by the Phase 2 trigger (caller sent raw only).
-- ============================================================================
SAVEPOINT t2;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _pid uuid; _norm text;
BEGIN
  _pid := (public.person_create_inline(
            'تولیدکننده الف', 'supplier', 'organization',
            '[{"kind":"mobile_e164","value_raw":"۰۹۱۲۱۲۳۴۵۶۷"}]'::jsonb)->>'person_id')::uuid;
  SELECT value_normalized INTO _norm
  FROM public.person_identifiers WHERE person_id = _pid;
  IF _norm <> '+989121234567' THEN
    RAISE EXCEPTION 'FAIL: T2 Persian-digit mobile normalized to % (expected +989121234567)', _norm;
  END IF;
  RAISE NOTICE 'PASS: T2 Persian-digit mobile normalized to +989121234567';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t2;

-- ============================================================================
-- T3  Provenance context link points at the REAL legacy row.
-- ============================================================================
SAVEPOINT t3;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.person_create_inline('زنجیره تأمین ب', 'supplier', 'organization');
  IF NOT EXISTS (
    SELECT 1 FROM public.person_context_links l
    JOIN public.suppliers s ON s.id = l.ref_id
    WHERE l.person_id = (_r->>'person_id')::uuid
      AND l.context_kind = 'supplier'
      AND l.ref_table = 'suppliers'
      AND l.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: T3 context link does not resolve to a real supplier row';
  END IF;
  RAISE NOTICE 'PASS: T3 context link references a real suppliers row';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t3;

-- ============================================================================
-- T4  Customer context creates a customers row bridged by person_id.
-- ============================================================================
SAVEPOINT t4;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.person_create_inline(
          'مشتری آزمایشی', 'customer', 'individual',
          '[{"kind":"mobile_e164","value_raw":"09131234567"}]'::jsonb);
  IF _r->>'legacy_table' <> 'customers' THEN
    RAISE EXCEPTION 'FAIL: T4 legacy_table = %', _r->>'legacy_table';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = (_r->>'legacy_id')::uuid
      AND person_id = (_r->>'person_id')::uuid
      AND phone = '09131234567'
  ) THEN
    RAISE EXCEPTION 'FAIL: T4 customer row missing or not bridged';
  END IF;
  RAISE NOTICE 'PASS: T4 sales user created a bridged customer inline';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t4;

-- ============================================================================
-- T5  ATOMICITY: duplicate national ID leaves NO person AND NO supplier.
--     A half-created supplier would be worse than a failed create.
-- ============================================================================
SAVEPOINT t5;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _p0 bigint; _s0 bigint; _p1 bigint; _s1 bigint;
BEGIN
  PERFORM public.person_create_inline(
    'اولی', 'supplier', 'individual',
    '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb);

  SELECT count(*) INTO _p0 FROM public.persons;
  SELECT count(*) INTO _s0 FROM public.suppliers;

  BEGIN
    PERFORM public.person_create_inline(
      'دومی', 'supplier', 'individual',
      '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: T5 duplicate national ID accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT count(*) INTO _p1 FROM public.persons;
  SELECT count(*) INTO _s1 FROM public.suppliers;
  IF _p1 <> _p0 THEN RAISE EXCEPTION 'FAIL: T5 orphan person (% -> %)', _p0, _p1; END IF;
  IF _s1 <> _s0 THEN RAISE EXCEPTION 'FAIL: T5 orphan supplier (% -> %)', _s0, _s1; END IF;
  IF EXISTS (SELECT 1 FROM public.suppliers WHERE name = 'دومی') THEN
    RAISE EXCEPTION 'FAIL: T5 orphan supplier «دومی» persisted';
  END IF;
  RAISE NOTICE 'PASS: T5 duplicate national ID rolled back person AND supplier';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t5;

-- ============================================================================
-- T6  Duplicate PROVISIONAL mobile is ALLOWED (Phase 2 B3 semantics hold here).
-- ============================================================================
SAVEPOINT t6;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _a jsonb; _b jsonb;
BEGIN
  _a := public.person_create_inline('الف', 'supplier', 'individual',
          '[{"kind":"mobile_e164","value_raw":"09121234567"}]'::jsonb);
  _b := public.person_create_inline('ب', 'supplier', 'individual',
          '[{"kind":"mobile_e164","value_raw":"09121234567"}]'::jsonb);
  IF (_a->>'person_id') IS NULL OR (_b->>'person_id') IS NULL THEN
    RAISE EXCEPTION 'FAIL: T6 duplicate provisional mobile blocked';
  END IF;
  RAISE NOTICE 'PASS: T6 duplicate PROVISIONAL mobile allowed inline';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t6;

-- ============================================================================
-- T7  Invalid mobile rejected, nothing created.
-- ============================================================================
SAVEPOINT t7;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _s0 bigint; _s1 bigint;
BEGIN
  SELECT count(*) INTO _s0 FROM public.suppliers;
  BEGIN
    PERFORM public.person_create_inline('بد', 'supplier', 'individual',
      '[{"kind":"mobile_e164","value_raw":"12345"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: T7 invalid mobile accepted';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL;
  END;
  SELECT count(*) INTO _s1 FROM public.suppliers;
  IF _s1 <> _s0 THEN RAISE EXCEPTION 'FAIL: T7 supplier created despite bad mobile'; END IF;
  RAISE NOTICE 'PASS: T7 invalid mobile rejected, no supplier created';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t7;

-- ============================================================================
-- T8  Blank display_name rejected.
-- ============================================================================
SAVEPOINT t8;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_inline('   ', 'supplier');
  RAISE EXCEPTION 'FAIL: T8 blank display_name accepted';
EXCEPTION WHEN sqlstate '22023' THEN
  RAISE NOTICE 'PASS: T8 blank display_name rejected';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t8;

-- ============================================================================
-- T9  No identifiers at all is ALLOWED (answer to question B — a missing phone
--     must never be a precondition for introducing a person).
-- ============================================================================
SAVEPOINT t9;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.person_create_inline('تأمین‌کنندهٔ بی‌شماره', 'supplier', 'organization');
  IF (_r->>'legacy_id') IS NULL THEN
    RAISE EXCEPTION 'FAIL: T9 supplier without identifiers was blocked';
  END IF;
  RAISE NOTICE 'PASS: T9 person creatable with no identifiers (no mandatory gate)';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t9;

-- ============================================================================
-- T10 visibility_scope is locked for non-privileged roles (blocker B1 at the
--     DB layer — the UI lock is defence in depth, not the control).
-- ============================================================================
SAVEPOINT t10;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
DO $$
DECLARE _pid uuid;
BEGIN
  -- default scope succeeds
  _pid := (public.person_create_inline('مشتری عادی', 'customer')->>'person_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.persons
                 WHERE id = _pid AND visibility_scope = 'internal_general') THEN
    RAISE EXCEPTION 'FAIL: T10 default scope was not internal_general';
  END IF;

  -- escalation is refused
  BEGIN
    PERFORM public.person_create_inline(
      'مشتری محرمانه', 'customer', 'individual', '[]'::jsonb, 'restricted_finance');
    RAISE EXCEPTION 'FAIL: T10 sales escalated visibility_scope';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS: T10 sales locked to internal_general, escalation refused';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t10;

-- ============================================================================
-- T11 viewer cannot create inline.
-- ============================================================================
SAVEPOINT t11;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"20303d30-ab9d-4fc6-be96-ec5db1dcb647","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_inline('نفوذی', 'supplier');
  RAISE EXCEPTION 'FAIL: T11 viewer created a person inline';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: T11 viewer blocked from inline creation';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t11;

-- ============================================================================
-- T12 Invalid context_kind is rejected by the CHECK constraint, and nothing
--     is left behind.
-- ============================================================================
SAVEPOINT t12;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
DO $$
DECLARE _p0 bigint; _p1 bigint;
BEGIN
  SELECT count(*) INTO _p0 FROM public.persons;
  BEGIN
    PERFORM public.person_create_inline('زمینهٔ نامعتبر', 'not_a_real_context');
    RAISE EXCEPTION 'FAIL: T12 invalid context_kind accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT count(*) INTO _p1 FROM public.persons;
  IF _p1 <> _p0 THEN RAISE EXCEPTION 'FAIL: T12 orphan person after bad context'; END IF;
  RAISE NOTICE 'PASS: T12 invalid context_kind rejected atomically';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t12;

-- ============================================================================
-- T13 accountant can create a supplier inline (matches suppliers INSERT RLS).
-- ============================================================================
SAVEPOINT t13;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90c0479f-410d-4fff-9e00-34bbba1cce2b","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.person_create_inline('تأمین‌کنندهٔ حسابدار', 'supplier', 'organization');
  RAISE NOTICE 'PASS: T13 accountant can create a supplier inline';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT t13;

\echo '=============== PHASE 3 TESTS PASSED — ROLLING BACK ==============='
ROLLBACK;

SELECT 'persons=' || count(*)::text FROM public.persons;
SELECT 'suppliers=' || count(*)::text FROM public.suppliers;
SELECT 'customers=' || count(*)::text FROM public.customers;
