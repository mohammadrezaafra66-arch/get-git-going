SET client_encoding='UTF8';
-- =============================================================================
-- 245 tests — landline shareable again, mobile/email still globally unique
-- Runs inside a transaction that is ROLLED BACK. Nothing is persisted.
-- =============================================================================

BEGIN;

\i /tmp/245.sql

CREATE TEMP TABLE t_results(seq serial, name text, passed boolean, detail text);

INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
VALUES
  ('55555555-0000-4000-8000-000000000001','individual','همکار دفتر الف','internal_general',true),
  ('55555555-0000-4000-8000-000000000002','individual','همکار دفتر ب','internal_general',true),
  ('55555555-0000-4000-8000-000000000003','individual','آزمون موبایل الف','internal_general',true),
  ('55555555-0000-4000-8000-000000000004','individual','آزمون موبایل ب','internal_general',true),
  ('55555555-0000-4000-8000-000000000005','individual','آزمون ایمیل الف','internal_general',true),
  ('55555555-0000-4000-8000-000000000006','individual','آزمون ایمیل ب','internal_general',true),
  ('55555555-0000-4000-8000-000000000007','individual','تأیید ثابت الف','internal_general',true),
  ('55555555-0000-4000-8000-000000000008','individual','تأیید ثابت ب','internal_general',true);

-- =============================================================================
-- D1 — THE POINT OF THIS MIGRATION: two people CAN share an office landline.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('55555555-0000-4000-8000-000000000001','landline','02133445566','provisional',true);

DO $d1$
DECLARE _ok boolean := true; _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('55555555-0000-4000-8000-000000000002','landline','02133445566','provisional',true);
  EXCEPTION WHEN OTHERS THEN
    _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('D1 two persons CAN share a provisional landline',
            _ok, CASE WHEN _ok THEN 'accepted as intended' ELSE 'REFUSED: ' || left(_m,70) END);
END $d1$;

-- D1b — and both rows really are stored against different persons.
DO $d1b$
DECLARE _n int;
BEGIN
  SELECT COUNT(DISTINCT person_id) INTO _n FROM public.person_identifiers
   WHERE kind='landline' AND value_normalized = (
     SELECT value_normalized FROM public.person_identifiers
      WHERE person_id='55555555-0000-4000-8000-000000000001' AND kind='landline');
  INSERT INTO t_results(name,passed,detail)
    VALUES ('D1b the shared landline is held by two distinct persons', _n = 2, 'persons=' || _n);
END $d1b$;

-- =============================================================================
-- D2 — mobile is UNTOUCHED: two persons still cannot share one.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('55555555-0000-4000-8000-000000000003','mobile_e164','09365550011','provisional',true);

DO $d2$
DECLARE _s text := ''; _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('55555555-0000-4000-8000-000000000004','mobile_e164','09365550011','provisional',true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D2 two persons still CANNOT share a mobile', false, 'insert succeeded - Decision 2 was weakened');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE, _m = MESSAGE_TEXT;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D2 two persons still CANNOT share a mobile',
              _s = '23505' AND _m LIKE '%این شماره قبلاً%',
              'sqlstate=' || _s || ' msg=' || left(_m,60));
  END;
END $d2$;

-- =============================================================================
-- D3 — email is UNTOUCHED too.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('55555555-0000-4000-8000-000000000005','email','shared.office@afrakala.local','provisional',true);

DO $d3$
DECLARE _s text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('55555555-0000-4000-8000-000000000006','email','shared.office@afrakala.local','provisional',true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D3 two persons still CANNOT share an email', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D3 two persons still CANNOT share an email', _s = '23505', 'sqlstate=' || _s);
  END;
END $d3$;

-- =============================================================================
-- D4 — landline is relaxed, NOT abandoned: two CONFIRMED claims still clash.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('55555555-0000-4000-8000-000000000007','landline','02177889900','confirmed',true);

DO $d4$
DECLARE _s text := ''; _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('55555555-0000-4000-8000-000000000008','landline','02177889900','confirmed',true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D4 two CONFIRMED landlines still conflict', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE, _m = MESSAGE_TEXT;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('D4 two CONFIRMED landlines still conflict',
              _s = '23505' AND _m LIKE '%تلفن ثابت%',
              'sqlstate=' || _s || ' msg=' || left(_m,60));
  END;
END $d4$;

-- D4b — a provisional landline may still sit alongside a confirmed one.
DO $d4b$
DECLARE _ok boolean := true; _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('55555555-0000-4000-8000-000000000008','landline','02177889900','provisional',false);
  EXCEPTION WHEN OTHERS THEN
    _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('D4b a provisional landline may coexist with a confirmed one',
            _ok, CASE WHEN _ok THEN 'accepted' ELSE 'REFUSED: ' || left(_m,70) END);
END $d4b$;

-- =============================================================================
-- D5 — index inventory is exactly what 245 intends.
-- =============================================================================
DO $d5$
DECLARE _global text; _landline int; _strong int; _custom int; _primary int;
BEGIN
  SELECT indexdef INTO _global FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_person_identifiers_contact_global';
  SELECT COUNT(*) INTO _landline FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_person_identifiers_landline_confirmed';
  SELECT COUNT(*) INTO _strong FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_person_identifiers_strong_active';
  SELECT COUNT(*) INTO _custom FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_person_identifiers_custom_confirmed';
  SELECT COUNT(*) INTO _primary FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_person_identifiers_primary_active';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('D5 contact_global no longer mentions landline; landline_confirmed added; others untouched',
            _global IS NOT NULL
              AND _global NOT LIKE '%landline%'
              AND _global LIKE '%mobile_e164%'
              AND _global LIKE '%email%'
              AND _landline = 1 AND _strong = 1 AND _custom = 1 AND _primary = 1,
            'landline_in_global=' || (_global LIKE '%landline%')::text
            || ' landline_confirmed=' || _landline
            || ' strong=' || _strong || ' custom=' || _custom || ' primary=' || _primary);
END $d5$;

\echo ''
\echo '================ 245 TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail
FROM t_results ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total
FROM t_results;

ROLLBACK;
