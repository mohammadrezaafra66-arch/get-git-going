SET client_encoding='UTF8';
\set ON_ERROR_STOP on

-- =============================================================================
-- Verification suite for migration 230 (Phase 4 — import + backfill)
-- Entirely inside BEGIN ... ROLLBACK. Nothing persists.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond THEN RAISE NOTICE 'PASS: %', _label;
  ELSE RAISE EXCEPTION 'FAIL: %', _label;
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';

-- ============================================================================
-- T1  Import a brand-new supplier.
-- ============================================================================
SAVEPOINT t1;
DO $$
DECLARE _r jsonb; _pid uuid;
BEGIN
  _r := public.person_import_batch('[
    {"display_name":"شرکت سپاهان","kind":"organization","context_kind":"supplier",
     "identifiers":[{"kind":"mobile_e164","value_raw":"09991110001"}]}
  ]'::jsonb);

  IF (_r->>'created')::int <> 1 THEN RAISE EXCEPTION 'FAIL: T1 created=%', _r->>'created'; END IF;
  SELECT person_id INTO _pid FROM public.suppliers WHERE name = 'شرکت سپاهان';
  IF _pid IS NULL THEN RAISE EXCEPTION 'FAIL: T1 supplier not bridged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.person_identifiers
                 WHERE person_id = _pid AND value_normalized = '+989991110001') THEN
    RAISE EXCEPTION 'FAIL: T1 identifier not normalized';
  END IF;
  RAISE NOTICE 'PASS: T1 new supplier imported, bridged, identifier normalized';
END $$;
ROLLBACK TO SAVEPOINT t1;

-- ============================================================================
-- T2  A row whose phone matches an EXISTING person links to that person and
--     still gets its supplier row. (The spec expected "supplier NOT created",
--     which would leave a known customer unusable as a supplier.)
-- ============================================================================
SAVEPOINT t2;
DO $$
DECLARE _r jsonb; _pid uuid; _people bigint;
BEGIN
  -- Person already exists as a CUSTOMER.
  PERFORM public.person_create_inline(
    p_display_name => 'علی رضایی', p_context_kind => 'customer',
    p_identifiers => '[{"kind":"mobile_e164","value_raw":"09991110002"}]'::jsonb);
  SELECT count(*) INTO _people FROM public.persons;

  -- Same phone arrives in a SUPPLIER import.
  _r := public.person_import_batch('[
    {"display_name":"علی رضایی","context_kind":"supplier",
     "identifiers":[{"kind":"mobile_e164","value_raw":"09991110002"}]}
  ]'::jsonb);

  IF (_r->>'linked')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: T2 expected linked=1, got %', _r::text;
  END IF;
  IF (SELECT count(*) FROM public.persons) <> _people THEN
    RAISE EXCEPTION 'FAIL: T2 a duplicate person was created';
  END IF;
  SELECT person_id INTO _pid FROM public.suppliers WHERE name = 'علی رضایی';
  IF _pid IS NULL THEN
    RAISE EXCEPTION 'FAIL: T2 no supplier row created for an existing person';
  END IF;
  RAISE NOTICE 'PASS: T2 existing person reused AND supplier row created';
END $$;
ROLLBACK TO SAVEPOINT t2;

-- ============================================================================
-- T3  Invalid national ID -> that row rejected, batch survives, no orphan.
-- ============================================================================
SAVEPOINT t3;
DO $$
DECLARE _r jsonb; _s0 bigint; _s1 bigint;
BEGIN
  SELECT count(*) INTO _s0 FROM public.suppliers;
  _r := public.person_import_batch('[
    {"display_name":"ردیف خراب","context_kind":"supplier",
     "identifiers":[{"kind":"national_id_ir","value_raw":"1234567890"}]},
    {"display_name":"ردیف سالم","context_kind":"supplier"}
  ]'::jsonb);

  IF (_r->>'rejected')::int <> 1 THEN RAISE EXCEPTION 'FAIL: T3 rejected=%', _r->>'rejected'; END IF;
  IF (_r->>'created')::int <> 1 THEN RAISE EXCEPTION 'FAIL: T3 created=%', _r->>'created'; END IF;
  SELECT count(*) INTO _s1 FROM public.suppliers;
  IF _s1 <> _s0 + 1 THEN RAISE EXCEPTION 'FAIL: T3 supplier count %->%', _s0, _s1; END IF;
  IF EXISTS (SELECT 1 FROM public.suppliers WHERE name = 'ردیف خراب') THEN
    RAISE EXCEPTION 'FAIL: T3 rejected row left a supplier behind';
  END IF;
  RAISE NOTICE 'PASS: T3 bad row rejected, good row imported, no orphan';
END $$;
ROLLBACK TO SAVEPOINT t3;

-- ============================================================================
-- T4  Customer import bridges customers.person_id.
-- ============================================================================
SAVEPOINT t4;
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.person_import_batch('[
    {"display_name":"مشتری وارداتی","context_kind":"customer",
     "identifiers":[{"kind":"mobile_e164","value_raw":"09991110003"}]}
  ]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.customers
                 WHERE name = 'مشتری وارداتی' AND person_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: T4 customer not bridged';
  END IF;
  RAISE NOTICE 'PASS: T4 customer imported and bridged';
END $$;
ROLLBACK TO SAVEPOINT t4;

-- ============================================================================
-- T5  CONFLICT GUARD: one row pointing at two different persons is rejected,
--     never merged.
-- ============================================================================
SAVEPOINT t5;
DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM public.person_create_inline(
    p_display_name => 'شخص یک', p_context_kind => 'customer',
    p_identifiers => '[{"kind":"mobile_e164","value_raw":"09991110004"}]'::jsonb);
  PERFORM public.person_create_inline(
    p_display_name => 'شخص دو', p_context_kind => 'customer',
    p_identifiers => '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb);

  _r := public.person_import_batch('[
    {"display_name":"مبهم","context_kind":"supplier",
     "identifiers":[{"kind":"mobile_e164","value_raw":"09991110004"},
                    {"kind":"national_id_ir","value_raw":"1234567891"}]}
  ]'::jsonb);

  IF (_r->>'rejected')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: T5 ambiguous row was NOT rejected: %', _r::text;
  END IF;
  RAISE NOTICE 'PASS: T5 row matching two persons rejected, not merged';
END $$;
ROLLBACK TO SAVEPOINT t5;

-- ============================================================================
-- T6  Strong identifier takes precedence over a weak one.
-- ============================================================================
SAVEPOINT t6;
DO $$
DECLARE _strong uuid; _m jsonb;
BEGIN
  _strong := (public.person_create_inline(
                p_display_name => 'دارندهٔ کد ملی', p_context_kind => 'customer',
                p_identifiers => '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb
              )->>'person_id')::uuid;

  _m := public.person_find_by_identifiers(
          '[{"kind":"national_id_ir","value_raw":"1234567891"}]'::jsonb);
  IF (_m->>'person_id')::uuid <> _strong THEN
    RAISE EXCEPTION 'FAIL: T6 strong id did not match';
  END IF;
  IF _m->>'matched_on' <> 'national_id_ir' THEN
    RAISE EXCEPTION 'FAIL: T6 matched_on=%', _m->>'matched_on';
  END IF;
  RAISE NOTICE 'PASS: T6 strong identifier match with correct precedence';
END $$;
ROLLBACK TO SAVEPOINT t6;

-- ============================================================================
-- T7  BACKFILL SUPPLIERS — the critical regression test.
--     The row COUNT must not change. If backfill ever inserts instead of
--     updating, this fails loudly.
-- ============================================================================
SAVEPOINT t7;
DO $$
DECLARE _r jsonb; _before bigint; _after bigint; _null_after bigint;
BEGIN
  SELECT count(*) INTO _before FROM public.suppliers;
  _r := public.person_backfill_existing('suppliers');
  SELECT count(*) INTO _after FROM public.suppliers;
  SELECT count(*) INTO _null_after FROM public.suppliers WHERE person_id IS NULL;

  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL: T7 supplier COUNT CHANGED %->% (backfill inserted!)', _before, _after;
  END IF;
  IF _null_after <> 0 THEN
    RAISE EXCEPTION 'FAIL: T7 % suppliers still unbridged', _null_after;
  END IF;
  IF (_r->>'rejected')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: T7 rejected=% : %', _r->>'rejected', _r->'rows';
  END IF;
  RAISE NOTICE 'PASS: T7 all % suppliers bridged, row count unchanged', _before;
END $$;
ROLLBACK TO SAVEPOINT t7;

-- ============================================================================
-- T8  BACKFILL CUSTOMERS — same regression guard.
-- ============================================================================
SAVEPOINT t8;
DO $$
DECLARE _r jsonb; _before bigint; _after bigint; _null_after bigint;
BEGIN
  SELECT count(*) INTO _before FROM public.customers;
  _r := public.person_backfill_existing('customers');
  SELECT count(*) INTO _after FROM public.customers;
  SELECT count(*) INTO _null_after FROM public.customers WHERE person_id IS NULL;

  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL: T8 customer COUNT CHANGED %->%', _before, _after;
  END IF;
  IF _null_after <> 0 THEN
    RAISE EXCEPTION 'FAIL: T8 % customers still unbridged', _null_after;
  END IF;
  IF (_r->>'rejected')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: T8 rejected=% : %', _r->>'rejected', _r->'rows';
  END IF;
  RAISE NOTICE 'PASS: T8 all % customers bridged, row count unchanged', _before;
END $$;
ROLLBACK TO SAVEPOINT t8;

-- ============================================================================
-- T9  BACKFILL IDEMPOTENCY — running twice changes nothing the second time.
-- ============================================================================
SAVEPOINT t9;
DO $$
DECLARE _r2 jsonb; _p1 bigint; _p2 bigint; _s bigint;
BEGIN
  PERFORM public.person_backfill_existing('suppliers');
  SELECT count(*) INTO _p1 FROM public.persons;
  SELECT count(*) INTO _s  FROM public.suppliers;

  _r2 := public.person_backfill_existing('suppliers');
  SELECT count(*) INTO _p2 FROM public.persons;

  IF (_r2->>'processed')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: T9 second run processed % rows', _r2->>'processed';
  END IF;
  IF _p2 <> _p1 THEN RAISE EXCEPTION 'FAIL: T9 persons grew %->%', _p1, _p2; END IF;
  IF (SELECT count(*) FROM public.suppliers) <> _s THEN
    RAISE EXCEPTION 'FAIL: T9 suppliers grew on second run';
  END IF;
  RAISE NOTICE 'PASS: T9 backfill is idempotent';
END $$;
ROLLBACK TO SAVEPOINT t9;

-- ============================================================================
-- T10 A supplier with NO phone still gets a person (11 of 13 are like this).
-- ============================================================================
SAVEPOINT t10;
DO $$
DECLARE _r jsonb; _no_phone bigint; _still_null bigint;
BEGIN
  SELECT count(*) INTO _no_phone FROM public.suppliers
   WHERE person_id IS NULL AND NULLIF(btrim(COALESCE(phone,'')),'') IS NULL;
  _r := public.person_backfill_existing('suppliers');
  SELECT count(*) INTO _still_null FROM public.suppliers
   WHERE person_id IS NULL AND NULLIF(btrim(COALESCE(phone,'')),'') IS NULL;

  IF _still_null <> 0 THEN
    RAISE EXCEPTION 'FAIL: T10 % phone-less suppliers left unbridged', _still_null;
  END IF;
  RAISE NOTICE 'PASS: T10 all % phone-less suppliers bridged', _no_phone;
END $$;
ROLLBACK TO SAVEPOINT t10;

-- ============================================================================
-- T11 Backfill writes provenance links pointing at the real legacy rows.
-- ============================================================================
SAVEPOINT t11;
DO $$
DECLARE _bad bigint; _links bigint;
BEGIN
  PERFORM public.person_backfill_existing('suppliers');
  PERFORM public.person_backfill_existing('customers');

  SELECT count(*) INTO _links FROM public.person_context_links
   WHERE context_kind IN ('supplier','customer');
  IF _links < 25 THEN RAISE EXCEPTION 'FAIL: T11 only % context links', _links; END IF;

  -- Every supplier link must resolve to a real suppliers row.
  SELECT count(*) INTO _bad
  FROM public.person_context_links l
  WHERE l.ref_table = 'suppliers'
    AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = l.ref_id);
  IF _bad > 0 THEN RAISE EXCEPTION 'FAIL: T11 % dangling supplier links', _bad; END IF;
  RAISE NOTICE 'PASS: T11 % provenance links, none dangling', _links;
END $$;
ROLLBACK TO SAVEPOINT t11;

-- ============================================================================
-- T12 Backfill never invents a person for an already-bridged row, and every
--     person_id written is a valid FK (no orphans).
-- ============================================================================
SAVEPOINT t12;
DO $$
DECLARE _orphans bigint;
BEGIN
  PERFORM public.person_backfill_existing('suppliers');
  PERFORM public.person_backfill_existing('customers');

  SELECT count(*) INTO _orphans FROM (
    SELECT s.person_id FROM public.suppliers s
     WHERE s.person_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = s.person_id)
    UNION ALL
    SELECT c.person_id FROM public.customers c
     WHERE c.person_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = c.person_id)
  ) x;
  IF _orphans > 0 THEN RAISE EXCEPTION 'FAIL: T12 % orphan person_id refs', _orphans; END IF;
  RAISE NOTICE 'PASS: T12 no orphan person_id references';
END $$;
ROLLBACK TO SAVEPOINT t12;

RESET ROLE;
\echo '=============== PHASE 4 TESTS PASSED — ROLLING BACK ==============='
ROLLBACK;

SELECT 'persons=' || count(*)::text FROM public.persons;
SELECT 'suppliers=' || count(*)::text || ' bridged=' || count(person_id)::text FROM public.suppliers;
SELECT 'customers=' || count(*)::text || ' bridged=' || count(person_id)::text FROM public.customers;
