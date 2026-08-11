SET client_encoding='UTF8';
-- =============================================================================
-- 242 tests — Phase 8.5 external_parties person enforcement
-- Runs inside a transaction that is ROLLED BACK. Nothing is persisted.
-- =============================================================================

BEGIN;

\echo '===== BEFORE: external_parties person coverage ====='
SELECT COUNT(*) total, COUNT(*) FILTER (WHERE person_id IS NULL) nulls FROM public.external_parties;

-- Seed a NULL-person row so the backfill has something real to do. The live
-- table has none, and a backfill that is never exercised proves nothing.
INSERT INTO public.external_parties (full_name, phone, national_id, is_active)
VALUES ('آزمون طرف حساب بدون شخص', '09371110001', NULL, true);

-- And one whose phone ALREADY belongs to a person, to prove the backfill LINKS
-- rather than creates - which 8.4's global uniqueness now makes mandatory.
INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
VALUES ('44444444-0000-4000-8000-000000000001','individual','آزمون شخص موجود','internal_general',true);
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('44444444-0000-4000-8000-000000000001','mobile_e164','09371110002','provisional',true);
INSERT INTO public.external_parties (full_name, phone, is_active)
VALUES ('آزمون طرف حساب با شمارهٔ موجود', '09371110002', true);

\echo '===== seeded: 2 rows with NULL person_id ====='
SELECT COUNT(*) FILTER (WHERE person_id IS NULL) nulls FROM public.external_parties;

\i /tmp/242.sql

CREATE TEMP TABLE t_results(seq serial, name text, passed boolean, detail text);
GRANT ALL ON t_results TO authenticated;
GRANT ALL ON SEQUENCE t_results_seq_seq TO authenticated;

-- =============================================================================
-- C1 — zero NULLs remain.
-- =============================================================================
DO $c1$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.external_parties WHERE person_id IS NULL;
  INSERT INTO t_results(name,passed,detail) VALUES ('C1 zero NULL person_id remain', _n = 0, 'nulls=' || _n);
END $c1$;

-- =============================================================================
-- C2 — the backfill LINKED the existing-number row instead of creating a second
--      person for that number. This is the 8.4 interaction the brief asks to
--      verify rather than assume.
-- =============================================================================
DO $c2$
DECLARE _pid uuid; _persons_with_number int;
BEGIN
  SELECT person_id INTO _pid FROM public.external_parties
   WHERE full_name = 'آزمون طرف حساب با شمارهٔ موجود';
  SELECT COUNT(DISTINCT person_id) INTO _persons_with_number
    FROM public.person_identifiers
   WHERE kind='mobile_e164' AND value_normalized='+989371110002' AND status <> 'revoked';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('C2 backfill LINKED to the existing person, did not create a duplicate',
            _pid = '44444444-0000-4000-8000-000000000001' AND _persons_with_number = 1,
            'linked_to_existing=' || (_pid = '44444444-0000-4000-8000-000000000001')::text
            || ' persons_holding_number=' || _persons_with_number);
END $c2$;

-- =============================================================================
-- C3 — the row with a brand-new number got a NEW person plus a context link.
-- =============================================================================
DO $c3$
DECLARE _pid uuid; _links int;
BEGIN
  SELECT person_id INTO _pid FROM public.external_parties
   WHERE full_name = 'آزمون طرف حساب بدون شخص';
  SELECT COUNT(*) INTO _links FROM public.person_context_links
   WHERE person_id = _pid AND context_kind='accounting_party' AND ref_table='external_parties';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('C3 new-number row got a fresh person and a context link',
            _pid IS NOT NULL AND _links = 1, 'person=' || COALESCE(left(_pid::text,8),'<null>') || ' links=' || _links);
END $c3$;

-- =============================================================================
-- C4 — NOT NULL is really enforced; a bare INSERT is rejected.
-- =============================================================================
DO $c4$
DECLARE _s text;
BEGIN
  BEGIN
    INSERT INTO public.external_parties (full_name, is_active) VALUES ('آزمون بدون شخص', true);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('C4 INSERT without person_id is rejected (not_null_violation)', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('C4 INSERT without person_id is rejected (not_null_violation)',
              _s = '23502', 'sqlstate=' || _s || ' (expected 23502)');
  END;
END $c4$;

-- =============================================================================
-- C5 — the column is declared NOT NULL in the catalog.
-- =============================================================================
DO $c5$
DECLARE _nullable text;
BEGIN
  SELECT is_nullable INTO _nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='external_parties' AND column_name='person_id';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('C5 external_parties.person_id is NOT NULL', _nullable = 'NO', 'is_nullable=' || _nullable);
END $c5$;

-- =============================================================================
-- C6 — the real creation path: person_create_inline with accounting_party
--      produces the party, its person, and the context link atomically.
-- =============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $c6$
DECLARE _r jsonb; _ep record; _links int;
BEGIN
  _r := public.person_create_inline(
    'آزمون طرف حساب از RPC', 'accounting_party', 'individual',
    '[{"kind":"mobile_e164","value_raw":"09371110003"}]'::jsonb,
    'internal_general', NULL, 'یادداشت آزمون', 'AC-8-5',
    '{"national_id":"0079371110"}'::jsonb);

  SELECT * INTO _ep FROM public.external_parties WHERE id = (_r->>'legacy_id')::uuid;
  SELECT COUNT(*) INTO _links FROM public.person_context_links
   WHERE person_id = (_r->>'person_id')::uuid
     AND context_kind='accounting_party' AND ref_table='external_parties'
     AND ref_id = (_r->>'legacy_id')::uuid;

  INSERT INTO t_results(name,passed,detail)
    VALUES ('C6 person_create_inline(accounting_party) creates party + person + link',
            _ep.id IS NOT NULL
              AND _ep.person_id = (_r->>'person_id')::uuid
              AND _ep.full_name = 'آزمون طرف حساب از RPC'
              AND _ep.national_id = '0079371110'
              AND _ep.accounting_code = 'AC-8-5'
              AND _ep.phone = '09371110003'
              AND _links = 1,
            'legacy_table=' || COALESCE(_r->>'legacy_table','<null>')
            || ' national_id=' || COALESCE(_ep.national_id,'<null>')
            || ' acc_code=' || COALESCE(_ep.accounting_code,'<null>')
            || ' phone=' || COALESCE(_ep.phone,'<null>')
            || ' links=' || _links);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_results(name,passed,detail)
    VALUES ('C6 person_create_inline(accounting_party) creates party + person + link',
            false, SQLSTATE || ': ' || SQLERRM);
END $c6$;

-- =============================================================================
-- C7 — the whitelist still holds: an unknown legacy field is ignored, not
--      trusted. person_id must NOT be settable through p_legacy_fields.
-- =============================================================================
DO $c7$
DECLARE _r jsonb; _ep record;
BEGIN
  _r := public.person_create_inline(
    'آزمون whitelist طرف حساب', 'accounting_party', 'individual',
    '[]'::jsonb, 'internal_general', NULL, NULL, NULL,
    '{"person_id":"00000000-0000-4000-8000-000000000000","is_active":false,"national_id":"0079371111"}'::jsonb);

  SELECT * INTO _ep FROM public.external_parties WHERE id = (_r->>'legacy_id')::uuid;

  INSERT INTO t_results(name,passed,detail)
    VALUES ('C7 whitelist: person_id/is_active from p_legacy_fields are ignored',
            _ep.person_id = (_r->>'person_id')::uuid
              AND _ep.is_active = true
              AND _ep.national_id = '0079371111',
            'person_id_honoured=' || (_ep.person_id = (_r->>'person_id')::uuid)::text
            || ' is_active=' || _ep.is_active::text);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_results(name,passed,detail)
    VALUES ('C7 whitelist: person_id/is_active from p_legacy_fields are ignored',
            false, SQLSTATE || ': ' || SQLERRM);
END $c7$;

RESET ROLE;

-- =============================================================================
-- C8 — the receipt state-2 consumer still resolves. It only ever SELECTs
--      external parties, so it must be unaffected; assert the shape it reads.
-- =============================================================================
DO $c8$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.external_parties
   WHERE is_active = true AND full_name IS NOT NULL;
  INSERT INTO t_results(name,passed,detail)
    VALUES ('C8 active external parties are still selectable for the receipt flow',
            _n > 0, 'active_parties=' || _n);
END $c8$;

-- C9 — drift report still empty.
DO $c9$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.person_fk_drift_report();
  INSERT INTO t_results(name,passed,detail)
    VALUES ('C9 person_fk_drift_report empty', _n = 0, 'rows=' || _n);
END $c9$;

\echo ''
\echo '================ 242 TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail
FROM t_results ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total
FROM t_results;

ROLLBACK;
