SET client_encoding='UTF8';
-- =============================================================================
-- 241 tests — Phase 8.4 global contact uniqueness
-- Runs inside a transaction that is ROLLED BACK. Nothing is persisted.
-- =============================================================================

BEGIN;

\i /tmp/241.sql

CREATE TEMP TABLE t_results(seq serial, name text, passed boolean, detail text);
GRANT ALL ON t_results TO authenticated;
GRANT ALL ON SEQUENCE t_results_seq_seq TO authenticated;

INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
VALUES
  ('33333333-0000-4000-8000-000000000001','individual','آزمون شمارهٔ اول','internal_general',true),
  ('33333333-0000-4000-8000-000000000002','individual','آزمون شمارهٔ دوم','internal_general',true),
  ('33333333-0000-4000-8000-000000000003','individual','آزمون محرمانهٔ مدیریتی','restricted_executive',true),
  ('33333333-0000-4000-8000-000000000004','individual','آزمون کد ملی الف','internal_general',true),
  ('33333333-0000-4000-8000-000000000005','individual','آزمون کد ملی ب','internal_general',true);

-- =============================================================================
-- B1 — THE REVERSAL. Two persons, same PROVISIONAL mobile. Under migration 228
--      this was allowed (B3: unique only when confirmed). It must now fail.
--      Checkpoint 8.3's test suite captured the old behaviour as a baseline;
--      this asserts it has flipped.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('33333333-0000-4000-8000-000000000001','mobile_e164','09361110001','provisional',true);

DO $b1$
DECLARE _s text; _m text;
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000002','mobile_e164','09361110001','provisional',true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('B1 REVERSAL: second person with the same provisional mobile is rejected',
              false, 'insert succeeded - migration 228 B3 behaviour still in force');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE, _m = MESSAGE_TEXT;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('B1 REVERSAL: second person with the same provisional mobile is rejected',
              _s = '23505', 'sqlstate=' || _s || ' msg=' || left(_m, 70));
  END;
END $b1$;

-- =============================================================================
-- B2 — the message is a real Persian sentence, not an index name.
-- =============================================================================
DO $b2$
DECLARE _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000002','mobile_e164','09361110001','provisional',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('B2 error is a Persian sentence, not a bare constraint name',
            _m LIKE '%این شماره قبلاً%'
              AND _m NOT LIKE '%uq_person_identifiers%'
              AND _m NOT LIKE '%duplicate key%',
            left(_m, 90));
END $b2$;

-- =============================================================================
-- B3 — same mobile where the FIRST row is revoked -> allowed.
--      Only active rows collide. This is what keeps a mistyped number
--      correctable under the new regime.
-- =============================================================================
DO $b3$
DECLARE _ok boolean := true; _m text := '';
BEGIN
  UPDATE public.person_identifiers
     SET is_primary = false, status = 'revoked'
   WHERE person_id = '33333333-0000-4000-8000-000000000001'
     AND value_normalized = '+989361110001';
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000002','mobile_e164','09361110001','provisional',true);
  EXCEPTION WHEN OTHERS THEN
    _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('B3 a revoked identifier does not block the value for someone else',
            _ok, CASE WHEN _ok THEN 'insert allowed as designed' ELSE 'blocked: ' || left(_m,70) END);
END $b3$;

-- =============================================================================
-- B4 — national_id_ir uniqueness is NOT weakened.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('33333333-0000-4000-8000-000000000004','national_id_ir','0079361110','provisional',true);

DO $b4$
DECLARE _s text;
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000005','national_id_ir','0079361110','provisional',true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('B4 national_id_ir still globally unique', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('B4 national_id_ir still globally unique', _s = '23505', 'sqlstate=' || _s);
  END;
END $b4$;

-- =============================================================================
-- B5 — index inventory is exactly what the migration intends.
-- =============================================================================
DO $b5$
DECLARE _new int; _custom int; _old int; _strong int; _primary int;
BEGIN
  SELECT COUNT(*) INTO _new     FROM pg_indexes WHERE schemaname='public' AND indexname='uq_person_identifiers_contact_global';
  SELECT COUNT(*) INTO _custom  FROM pg_indexes WHERE schemaname='public' AND indexname='uq_person_identifiers_custom_confirmed';
  SELECT COUNT(*) INTO _old     FROM pg_indexes WHERE schemaname='public' AND indexname='uq_person_identifiers_confirmed_kind_value';
  SELECT COUNT(*) INTO _strong  FROM pg_indexes WHERE schemaname='public' AND indexname='uq_person_identifiers_strong_active';
  SELECT COUNT(*) INTO _primary FROM pg_indexes WHERE schemaname='public' AND indexname='uq_person_identifiers_primary_active';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('B5 index inventory: contact_global + custom_confirmed added, 228 confirmed-only dropped, strong/primary untouched',
            _new=1 AND _custom=1 AND _old=0 AND _strong=1 AND _primary=1,
            'contact_global=' || _new || ' custom_confirmed=' || _custom
            || ' old_confirmed=' || _old || ' strong=' || _strong || ' primary=' || _primary);
END $b5$;

-- =============================================================================
-- B6 — conditional disclosure. An accountant may see an internal_general
--      person's name in the error, but NOT a restricted_executive one.
-- =============================================================================
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('33333333-0000-4000-8000-000000000003','mobile_e164','09361119999','provisional',true);

SET LOCAL "request.jwt.claims" = '{"sub":"90c0479f-410d-4fff-9e00-34bbba1cce2b","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $b6$
DECLARE _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000002','mobile_e164','09361119999','provisional',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('B6 restricted_executive owner is NOT named to an accountant',
            _m LIKE '%شخص دیگری%' AND _m NOT LIKE '%آزمون محرمانهٔ مدیریتی%',
            left(_m, 90));
END $b6$;

RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $b6b$
DECLARE _m text := '';
BEGIN
  BEGIN
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('33333333-0000-4000-8000-000000000002','mobile_e164','09361119999','provisional',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('B6b an admin IS told which person holds the number',
            _m LIKE '%آزمون محرمانهٔ مدیریتی%', left(_m, 90));
END $b6b$;

RESET ROLE;

-- =============================================================================
-- B7 — no live collisions remain.
-- =============================================================================
DO $b7$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM (
    SELECT 1 FROM public.person_identifiers
    WHERE status <> 'revoked' AND kind IN ('mobile_e164','landline','email')
    GROUP BY kind, value_normalized HAVING COUNT(DISTINCT person_id) > 1) x;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('B7 zero contact collisions remain', _n = 0, 'collisions=' || _n);
END $b7$;

\echo ''
\echo '================ 241 TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail
FROM t_results ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total
FROM t_results;

ROLLBACK;
