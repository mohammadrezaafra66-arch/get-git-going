SET client_encoding='UTF8';
-- =============================================================================
-- 239 tests — Phase 8.1 person_merge / person_merge_dismiss
-- Runs entirely inside a transaction that is ROLLED BACK. Nothing is persisted.
-- Assertions run as the `authenticated` role with a simulated JWT so RLS is
-- exercised exactly as it will be in the application.
-- =============================================================================

BEGIN;

\i /tmp/239.sql

-- -----------------------------------------------------------------------------
-- Result collector
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE t_results(seq serial, name text, passed boolean, detail text);
GRANT ALL ON t_results TO authenticated;
GRANT ALL ON SEQUENCE t_results_seq_seq TO authenticated;

CREATE TEMP TABLE t_seed(tbl_col text, n integer);
GRANT ALL ON t_seed TO authenticated;

-- -----------------------------------------------------------------------------
-- Fixtures (created as supabase_admin, before the role switch)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE t_ids(k text PRIMARY KEY, v uuid);
GRANT ALL ON t_ids TO authenticated;

INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
VALUES
  ('11111111-0000-4000-8000-000000000001','individual','آزمون برندهٔ ادغام','internal_general',true),
  ('11111111-0000-4000-8000-000000000002','individual','آزمون بازندهٔ ادغام','internal_general',true),
  ('11111111-0000-4000-8000-000000000003','individual','آزمون مشتری الف','internal_general',true),
  ('11111111-0000-4000-8000-000000000004','individual','آزمون مشتری ب','internal_general',true),
  ('11111111-0000-4000-8000-000000000005','individual','آزمون رد پیشنهاد الف','internal_general',true),
  ('11111111-0000-4000-8000-000000000006','individual','آزمون رد پیشنهاد ب','internal_general',true);

-- Shared identifier on BOTH winner and loser (T2), plus one unique to the loser.
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES
  ('11111111-0000-4000-8000-000000000001','mobile_e164','09350000001','provisional',true),
  ('11111111-0000-4000-8000-000000000002','mobile_e164','09350000001','provisional',true),
  ('11111111-0000-4000-8000-000000000002','email','merge.test@afrakala.local','provisional',true);

-- Candidate pair for T7 (ordered a < b).
INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
VALUES ('11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002',
        'shared_identifier','آزمون: شمارهٔ مشترک','pending');

-- Candidate pair for T8 (dismiss).
INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
VALUES ('11111111-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000006',
        'shared_identifier','آزمون: رد پیشنهاد','pending');

-- Two persons that BOTH own a customer row (T4 / guard #7).
INSERT INTO public.customers (name, person_id)
VALUES ('آزمون مشتری الف','11111111-0000-4000-8000-000000000003'),
       ('آزمون مشتری ب','11111111-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- Seed: point one existing row of EVERY generic person-FK column at the loser.
-- Rows are chosen from those that already hold a non-null value in that column,
-- so the "*_person_requires_*" CHECK constraints stay satisfied.
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  _cols text[] := ARRAY[
    'credit_requests.customer_person_id',
    'credit_score_snapshots.customer_person_id',
    'customer_capital_allocations.customer_person_id',
    'customer_capital_allocations_dynamic.customer_person_id',
    'customer_credit_balance.customer_person_id',
    'customer_credit_ledger.customer_person_id',
    'customer_credit_profile.customer_person_id',
    'delivery_receipts.customer_person_id',
    'didar_activities.customer_person_id',
    'invoices.customer_person_id',
    'payment_receipts.customer_person_id',
    'payment_receipts.receiver_party_person_id',
    'payment_vouchers.payee_person_id',
    'product_suppliers.supplier_person_id',
    'purchase_prices.supplier_person_id',
    'purchases.supplier_person_id',
    'sales_quotes.customer_person_id',
    'customers.person_id',
    'suppliers.person_id',
    'external_parties.person_id'
  ];
  _c text; _t text; _col text; _n integer;
BEGIN
  FOREACH _c IN ARRAY _cols LOOP
    _t := split_part(_c,'.',1); _col := split_part(_c,'.',2);
    EXECUTE format(
      'UPDATE public.%I SET %I = $1 WHERE ctid IN (SELECT ctid FROM public.%I WHERE %I IS NOT NULL LIMIT 1)',
      _t,_col,_t,_col) USING '11111111-0000-4000-8000-000000000002'::uuid;
    GET DIAGNOSTICS _n = ROW_COUNT;
    INSERT INTO t_seed VALUES (_c, _n);
  END LOOP;
END $seed$;

\echo '--- seeded rows per column (0 = table had no rows to seed) ---'
SELECT tbl_col, n FROM t_seed ORDER BY tbl_col;

-- -----------------------------------------------------------------------------
-- Switch to the application role with an admin JWT.
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- =============================================================================
-- T5 — non-admin caller must be rejected with 42501.
-- Run FIRST, before the merge consumes the fixture.
-- =============================================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"sub":"90c0479f-410d-4fff-9e00-34bbba1cce2b","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $t5$
DECLARE _sqlstate text;
BEGIN
  BEGIN
    PERFORM public.person_merge(
      '11111111-0000-4000-8000-000000000001'::uuid,
      '11111111-0000-4000-8000-000000000002'::uuid,
      'should not be allowed');
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T5 non-admin caller raises 42501', false, 'no exception was raised');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T5 non-admin caller raises 42501', _sqlstate = '42501', 'sqlstate=' || _sqlstate);
  END;
END $t5$;

RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- =============================================================================
-- T4 — both sides own a customer row → guard #7 raises, nothing changes.
-- =============================================================================
DO $t4$
DECLARE _sqlstate text; _msg text; _before_a int; _after_a int;
BEGIN
  SELECT COUNT(*) INTO _before_a FROM public.customers
   WHERE person_id = '11111111-0000-4000-8000-000000000003';
  BEGIN
    PERFORM public.person_merge(
      '11111111-0000-4000-8000-000000000003'::uuid,
      '11111111-0000-4000-8000-000000000004'::uuid,
      'both have customers');
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T4 both-have-customer raises (guard #7)', false, 'no exception was raised');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    SELECT COUNT(*) INTO _after_a FROM public.customers
     WHERE person_id = '11111111-0000-4000-8000-000000000003';
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T4 both-have-customer raises (guard #7)',
              _sqlstate = '23505' AND _before_a = _after_a,
              'sqlstate=' || _sqlstate || ' unchanged=' || (_before_a = _after_a)::text);
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T4b guard #7 message is Persian, not a constraint name',
              _msg LIKE '%پروندهٔ مشتری%', left(_msg, 60));
  END;
END $t4$;

-- =============================================================================
-- T9 — an unregistered persons-referencing column must abort the merge.
-- A real table with a real FK to persons is created, so this exercises the
-- catalog-completeness guard itself rather than asserting the code exists.
-- =============================================================================
RESET ROLE;
CREATE TABLE public.zz_phase8_unregistered_fk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id)
);
SET LOCAL ROLE authenticated;

DO $t9$
DECLARE _sqlstate text; _msg text;
BEGIN
  BEGIN
    PERFORM public.person_merge(
      '11111111-0000-4000-8000-000000000001'::uuid,
      '11111111-0000-4000-8000-000000000002'::uuid,
      'unregistered column present');
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T9 unregistered persons FK aborts the merge', false, 'no exception was raised');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    INSERT INTO t_results(name,passed,detail)
      VALUES ('T9 unregistered persons FK aborts the merge',
              _msg LIKE '%zz_phase8_unregistered_fk.person_id%',
              left(_msg, 120));
  END;
END $t9$;

RESET ROLE;
DROP TABLE public.zz_phase8_unregistered_fk;
SET LOCAL ROLE authenticated;

-- =============================================================================
-- T1/T2/T3/T6/T7 — the real merge.
-- =============================================================================
DO $merge$
DECLARE _res jsonb;
BEGIN
  _res := public.person_merge(
    '11111111-0000-4000-8000-000000000001'::uuid,
    '11111111-0000-4000-8000-000000000002'::uuid,
    'آزمون خودکار فاز ۸.۱');
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T0 merge executes without error', true, _res::text);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T0 merge executes without error', false, SQLSTATE || ': ' || SQLERRM);
END $merge$;

-- Verification assertions run as supabase_admin so RLS SELECT policies cannot
-- hide a row that failed to move and make a broken merge look clean.
RESET ROLE;

-- T1: every seeded column repointed; nothing still references the loser.
DO $t1$
DECLARE
  _r record; _n bigint; _bad text := ''; _checked int := 0;
BEGIN
  FOR _r IN SELECT tbl_col, n FROM t_seed WHERE n > 0 LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE %I = $1',
      split_part(_r.tbl_col,'.',1), split_part(_r.tbl_col,'.',2))
      INTO _n USING '11111111-0000-4000-8000-000000000002'::uuid;
    IF _n > 0 THEN _bad := _bad || _r.tbl_col || '(' || _n || ') '; END IF;

    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE %I = $1',
      split_part(_r.tbl_col,'.',1), split_part(_r.tbl_col,'.',2))
      INTO _n USING '11111111-0000-4000-8000-000000000001'::uuid;
    IF _n < _r.n THEN _bad := _bad || _r.tbl_col || ':winner_short '; END IF;
    _checked := _checked + 1;
  END LOOP;

  INSERT INTO t_results(name,passed,detail)
    VALUES ('T1 all seeded person-FK columns repointed loser -> winner',
            _bad = '', 'checked=' || _checked || ' problems=' || COALESCE(NULLIF(_bad,''),'none'));
END $t1$;

-- T2: duplicate identifier de-duplicated, not duplicated.
DO $t2$
DECLARE _dupes int; _total int; _loser_left int;
BEGIN
  SELECT COUNT(*) INTO _dupes FROM public.person_identifiers
   WHERE person_id = '11111111-0000-4000-8000-000000000001'
     AND kind='mobile_e164' AND value_normalized='+989350000001';
  SELECT COUNT(*) INTO _total FROM public.person_identifiers
   WHERE person_id = '11111111-0000-4000-8000-000000000001';
  SELECT COUNT(*) INTO _loser_left FROM public.person_identifiers
   WHERE person_id = '11111111-0000-4000-8000-000000000002';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('T2 shared identifier kept once on the winner, none left on the loser',
            _dupes = 1 AND _loser_left = 0 AND _total = 2,
            'shared_mobile=' || _dupes || ' winner_total=' || _total || ' loser_left=' || _loser_left);
END $t2$;

-- T3: loser display_name preserved as an alias of the winner.
DO $t3$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.person_aliases
   WHERE person_id = '11111111-0000-4000-8000-000000000001'
     AND alias = 'آزمون بازندهٔ ادغام';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T3 loser display_name becomes an alias of the winner', _n = 1, 'aliases=' || _n);
END $t3$;

-- T6: merge log written with real repoint counts.
DO $t6$
DECLARE _row public.person_merge_log%ROWTYPE; _seeded int; _logged int;
BEGIN
  SELECT * INTO _row FROM public.person_merge_log
   WHERE winner_id = '11111111-0000-4000-8000-000000000001'
     AND loser_id  = '11111111-0000-4000-8000-000000000002';

  SELECT COUNT(*) INTO _seeded FROM t_seed WHERE n > 0;
  SELECT COUNT(*) INTO _logged FROM jsonb_object_keys(_row.repointed) k
   WHERE k IN (SELECT tbl_col FROM t_seed WHERE n > 0);

  INSERT INTO t_results(name,passed,detail)
    VALUES ('T6 person_merge_log row written with per-column repoint counts',
            _row.id IS NOT NULL AND _logged = _seeded AND _row.merged_by IS NOT NULL,
            'seeded_cols=' || _seeded || ' logged_cols=' || _logged
            || ' identifiers_moved=' || COALESCE(_row.identifiers_moved,-1)
            || ' links_moved=' || COALESCE(_row.links_moved,-1));
END $t6$;

-- T6b: loser deactivated, not deleted.
DO $t6b$
DECLARE _exists boolean; _active boolean;
BEGIN
  SELECT true, is_active INTO _exists, _active FROM public.persons
   WHERE id = '11111111-0000-4000-8000-000000000002';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T6b loser still exists and is inactive',
            COALESCE(_exists,false) AND _active = false,
            'exists=' || COALESCE(_exists,false)::text || ' active=' || COALESCE(_active,true)::text);
END $t6b$;

-- T7: candidate status flips to 'merged'.
DO $t7$
DECLARE _st text; _by uuid;
BEGIN
  SELECT status, reviewed_by INTO _st, _by FROM public.person_merge_candidates
   WHERE person_id_a = '11111111-0000-4000-8000-000000000001'
     AND person_id_b = '11111111-0000-4000-8000-000000000002';
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T7 candidate status flips to merged', _st = 'merged' AND _by IS NOT NULL,
            'status=' || COALESCE(_st,'<null>'));
END $t7$;

-- =============================================================================
-- T8 — dismiss sets status='dismissed' and changes no person data.
-- Back to the application role: dismiss must work for a real admin caller.
-- =============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $t8$
DECLARE
  _cid uuid; _st text; _p5 public.persons%ROWTYPE; _p6 public.persons%ROWTYPE;
  _p5_after public.persons%ROWTYPE; _p6_after public.persons%ROWTYPE; _res jsonb;
BEGIN
  SELECT * INTO _p5 FROM public.persons WHERE id='11111111-0000-4000-8000-000000000005';
  SELECT * INTO _p6 FROM public.persons WHERE id='11111111-0000-4000-8000-000000000006';

  SELECT id INTO _cid FROM public.person_merge_candidates
   WHERE person_id_a='11111111-0000-4000-8000-000000000005'
      OR person_id_b='11111111-0000-4000-8000-000000000005';

  _res := public.person_merge_dismiss(_cid, 'این‌ها یک نفر نیستند — آزمون');

  SELECT status INTO _st FROM public.person_merge_candidates WHERE id=_cid;
  SELECT * INTO _p5_after FROM public.persons WHERE id='11111111-0000-4000-8000-000000000005';
  SELECT * INTO _p6_after FROM public.persons WHERE id='11111111-0000-4000-8000-000000000006';

  INSERT INTO t_results(name,passed,detail)
    VALUES ('T8 dismiss sets status=dismissed and mutates no person data',
            _st = 'dismissed' AND _p5 = _p5_after AND _p6 = _p6_after,
            'status=' || COALESCE(_st,'<null>')
            || ' persons_unchanged=' || ((_p5 = _p5_after) AND (_p6 = _p6_after))::text);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_results(name,passed,detail)
    VALUES ('T8 dismiss sets status=dismissed and mutates no person data', false,
            SQLSTATE || ': ' || SQLERRM);
END $t8$;

RESET ROLE;

-- =============================================================================
-- Results
-- =============================================================================
\echo ''
\echo '================ 239 TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail
FROM t_results ORDER BY seq;

\echo ''
SELECT COUNT(*) FILTER (WHERE passed) AS passed,
       COUNT(*) FILTER (WHERE NOT passed) AS failed,
       COUNT(*) AS total
FROM t_results;

ROLLBACK;
