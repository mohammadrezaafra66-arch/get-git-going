SET client_encoding='UTF8';
-- =============================================================================
-- 240 tests — Phase 8.3 cardinality (one person = one customer / one supplier)
-- Runs inside a transaction that is ROLLED BACK. Nothing is persisted.
-- =============================================================================

BEGIN;

\echo '===== counts BEFORE ====='
SELECT (SELECT COUNT(*) FROM public.customers) customers,
       (SELECT COUNT(*) FROM public.suppliers) suppliers,
       (SELECT COUNT(*) FROM public.persons)   persons;

\i /tmp/240.sql

CREATE TEMP TABLE t_results(seq serial, name text, passed boolean, detail text);
GRANT ALL ON t_results TO authenticated;
GRANT ALL ON SEQUENCE t_results_seq_seq TO authenticated;

-- Fixture person that already owns a customer and a supplier.
INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
VALUES ('22222222-0000-4000-8000-000000000001','individual','آزمون یکتایی','internal_general',true);
INSERT INTO public.customers (name, person_id)
VALUES ('آزمون یکتایی مشتری','22222222-0000-4000-8000-000000000001');
INSERT INTO public.suppliers (name, person_id)
VALUES ('آزمون یکتایی تأمین‌کننده','22222222-0000-4000-8000-000000000001');

-- =============================================================================
-- A2 / A3 — a second legacy row for the same person must be rejected.
-- =============================================================================
DO $a2$
DECLARE _s text;
BEGIN
  BEGIN
    INSERT INTO public.customers (name, person_id)
    VALUES ('مشتری دوم برای همان شخص','22222222-0000-4000-8000-000000000001');
    INSERT INTO t_results(name,passed,detail)
      VALUES ('A2 second customer for the same person is rejected', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('A2 second customer for the same person is rejected',
              _s = '23505', 'sqlstate=' || _s || ' (expected 23505 unique_violation)');
  END;
END $a2$;

DO $a3$
DECLARE _s text;
BEGIN
  BEGIN
    INSERT INTO public.suppliers (name, person_id)
    VALUES ('تأمین‌کنندهٔ دوم برای همان شخص','22222222-0000-4000-8000-000000000001');
    INSERT INTO t_results(name,passed,detail)
      VALUES ('A3 second supplier for the same person is rejected', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('A3 second supplier for the same person is rejected',
              _s = '23505', 'sqlstate=' || _s || ' (expected 23505 unique_violation)');
  END;
END $a3$;

-- =============================================================================
-- A1 — the constraints exist and are real UNIQUE constraints.
-- =============================================================================
DO $a1$
DECLARE _c int;
BEGIN
  SELECT COUNT(*) INTO _c FROM pg_constraint
   WHERE conname IN ('uq_customers_person_id','uq_suppliers_person_id')
     AND contype = 'u';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A1 both UNIQUE constraints exist', _c = 2, 'found=' || _c || '/2');
END $a1$;

-- =============================================================================
-- Application-role tests for person_create_inline.
-- =============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- A4 — normal creation still works and reports legacy_reused = false.
DO $a4$
DECLARE _r jsonb;
BEGIN
  _r := public.person_create_inline(
    'آزمون ایجاد مشتری ۸۳', 'customer', 'individual',
    '[{"kind":"mobile_e164","value_raw":"09351110001"}]'::jsonb);
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A4 person_create_inline still creates a customer normally',
            (_r->>'legacy_id') IS NOT NULL AND (_r->>'legacy_reused')::boolean = false,
            'legacy_reused=' || COALESCE(_r->>'legacy_reused','<null>')
            || ' legacy_id=' || COALESCE(left(_r->>'legacy_id',8),'<null>'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A4 person_create_inline still creates a customer normally', false,
            SQLSTATE || ': ' || SQLERRM);
END $a4$;

-- A5 — calling it twice with the SAME mobile: the PRE-8.4 baseline.
--
-- WHAT THIS ACTUALLY PROVES, AND WHY THE BRIEF'S EXPECTATION DOES NOT APPLY YET
--   The brief expects the second call to hit 240's new reuse branch. It cannot,
--   for two independent reasons, both verified rather than assumed:
--
--   1. person_create_full unconditionally INSERTs a new person (checked against
--      pg_get_functiondef), so person_create_inline always receives a brand-new
--      person id and can never find an existing legacy row through this entry
--      point. The reuse branch is defensive correctness for a future caller
--      that resolves to an existing person; it is unreachable from here today.
--
--   2. The duplicate mobile is not rejected either, because migration 228's B3
--      decision made mobile_e164 unique only when status = 'confirmed'. Both
--      identifiers here are 'provisional', so both are allowed.
--
--   So the correct 8.3 behaviour is: two DIFFERENT persons, two DIFFERENT
--   customers, and no unique violation - uq_customers_person_id is not even
--   engaged, since the person ids differ. That is what is asserted below.
--
--   This is the baseline that checkpoint 8.4 deliberately reverses. Once 241
--   makes mobile globally unique regardless of status, this exact call must
--   start failing - and 8.4's test suite asserts that reversal explicitly.
DO $a5$
DECLARE
  _r jsonb; _before int; _after int; _raised boolean := false; _msg text := '';
  _persons_before int; _persons_after int;
BEGIN
  SELECT COUNT(*) INTO _before FROM public.customers;
  SELECT COUNT(*) INTO _persons_before FROM public.persons;
  BEGIN
    _r := public.person_create_inline(
      'آزمون ایجاد مشتری ۸۳ دوباره', 'customer', 'individual',
      '[{"kind":"mobile_e164","value_raw":"09351110001"}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    _raised := true; _msg := SQLERRM;
  END;
  SELECT COUNT(*) INTO _after FROM public.customers;
  SELECT COUNT(*) INTO _persons_after FROM public.persons;

  INSERT INTO t_results(name,passed,detail)
    VALUES ('A5 pre-8.4 baseline: duplicate provisional mobile still creates a separate person+customer',
            NOT _raised
              AND _after = _before + 1
              AND _persons_after = _persons_before + 1
              AND (_r->>'legacy_reused')::boolean = false,
            'raised=' || _raised::text
            || ' customers ' || _before || '->' || _after
            || ' persons ' || _persons_before || '->' || _persons_after
            || ' reused=' || COALESCE(_r->>'legacy_reused','<null>'));
END $a5$;

-- A5b — and the two customers genuinely belong to two different persons, so
-- the new UNIQUE constraint was never in play. Confirms A5's reasoning rather
-- than taking it on trust.
DO $a5b$
DECLARE _persons int;
BEGIN
  SELECT COUNT(DISTINCT i.person_id) INTO _persons
  FROM public.person_identifiers i
  WHERE i.kind = 'mobile_e164' AND i.value_normalized = '+989351110001';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A5b the shared mobile is held by two distinct persons (the 8.4 target)',
            _persons = 2, 'persons_sharing_mobile=' || _persons);
END $a5b$;

RESET ROLE;

-- =============================================================================
-- A6 — the pre-existing data survived unchanged (fixtures excluded).
-- =============================================================================
DO $a6$
DECLARE _c int; _s int;
BEGIN
  SELECT COUNT(*) INTO _c FROM public.customers
   WHERE person_id <> '22222222-0000-4000-8000-000000000001'
     AND name NOT LIKE 'آزمون%';
  SELECT COUNT(*) INTO _s FROM public.suppliers
   WHERE person_id <> '22222222-0000-4000-8000-000000000001'
     AND name NOT LIKE 'آزمون%';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A6 pre-existing customers/suppliers untouched',
            _c = 12 AND _s = 15, 'customers=' || _c || '/12 suppliers=' || _s || '/15');
END $a6$;

-- A7 — drift report still empty.
DO $a7$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.person_fk_drift_report();
  INSERT INTO t_results(name,passed,detail)
    VALUES ('A7 person_fk_drift_report empty', _n = 0, 'rows=' || _n);
END $a7$;

\echo ''
\echo '================ 240 TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail
FROM t_results ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total
FROM t_results;

ROLLBACK;
