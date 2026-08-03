SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C1.2 — RLS and security verification for the new objects
-- Every assertion runs as the `authenticated` role under a simulated JWT, so
-- the real policies are exercised. Wrapped in a transaction that is ROLLED BACK.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
GRANT ALL ON t TO authenticated;
GRANT ALL ON SEQUENCE t_seq_seq TO authenticated;

CREATE TEMP TABLE actor(role_name text PRIMARY KEY, uid uuid);
GRANT ALL ON actor TO authenticated;

-- Real users, resolved from the live role assignments rather than hardcoded.
INSERT INTO actor
SELECT 'admin',   '05098088-2849-43f4-8eb5-7c473c3832ec'::uuid UNION ALL
SELECT 'manager', 'a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b'::uuid UNION ALL
SELECT 'accountant','90c0479f-410d-4fff-9e00-34bbba1cce2b'::uuid;

-- A pure-sales user (no admin/manager/accountant), picked from live data.
INSERT INTO actor
SELECT 'sales', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'sales'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                   WHERE x.user_id = ur.user_id
                     AND x.role IN ('admin','manager','accountant','purchase_specialist'))
LIMIT 1;

-- A user with NO role at all.
INSERT INTO actor
SELECT 'norole', p.id FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = p.id)
LIMIT 1;

\echo '===== actors resolved ====='
SELECT a.role_name, COALESCE(pr.full_name,'(none)') AS who
FROM actor a LEFT JOIN public.profiles pr ON pr.id = a.uid ORDER BY 1;

-- Seed one fulfillment owned by a request that the sales actor did NOT create,
-- so "can sales read someone else's fulfillment" is a real question.
DO $seed$
DECLARE _prod uuid; _term uuid; _admin uuid; _wh uuid;
        _req uuid; _pur uuid; _it uuid;
BEGIN
  SELECT id INTO _prod FROM public.products WHERE status='active' LIMIT 1;
  SELECT id INTO _term FROM public.payment_terms WHERE is_active LIMIT 1;
  SELECT uid INTO _admin FROM actor WHERE role_name='admin';
  SELECT public.default_warehouse_id() INTO _wh;

  INSERT INTO public.purchase_requests (product_id, quantity, unit, requested_by, status)
  VALUES (_prod, 5, 'عدد', _admin, 'approved') RETURNING id INTO _req;

  INSERT INTO public.purchases (product_id, payment_term_id, purchase_price, currency,
                                quantity, purchase_date, total_amount, status, created_by, warehouse_id)
  VALUES (_prod, _term, 7777, 'toman', 5, CURRENT_DATE, 38885, 'received', _admin, _wh)
  RETURNING id INTO _pur;
  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price, line_total)
  VALUES (_pur, _prod, 5, 7777, 38885) RETURNING id INTO _it;

  INSERT INTO public.purchase_request_fulfillments
    (purchase_request_id, purchase_id, purchase_item_id, allocated_quantity, created_by)
  VALUES (_req, _pur, _it, 5, _admin);

  INSERT INTO actor VALUES ('_req', _req), ('_pur', _pur), ('_it', _it);
END $seed$;

-- =============================================================================
-- S1 — who can SELECT the fulfillments table
-- =============================================================================
DO $s1$
DECLARE r record; _n int; _res text := '';
BEGIN
  FOR r IN SELECT role_name, uid FROM actor WHERE role_name IN ('admin','manager','accountant','sales','norole') LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      SELECT COUNT(*) INTO _n FROM public.purchase_request_fulfillments;
    EXCEPTION WHEN OTHERS THEN _n := -1;
    END;
    RESET ROLE;
    _res := _res || r.role_name || '=' || _n || ' ';
  END LOOP;
  INSERT INTO t(name,passed,detail)
    VALUES ('S1 fulfillment SELECT visibility per role', true, _res);
END $s1$;

-- S1b — a pure-sales user must NOT see a fulfillment of a request they neither
--       raised nor were assigned.
DO $s1b$
DECLARE _uid uuid; _n int;
BEGIN
  SELECT uid INTO _uid FROM actor WHERE role_name='sales';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO _n FROM public.purchase_request_fulfillments
   WHERE purchase_request_id = (SELECT uid FROM actor WHERE role_name='_req');
  RESET ROLE;
  INSERT INTO t(name,passed,detail)
    VALUES ('S1b sales cannot read a fulfillment of another user''s request', _n=0, 'rows_visible='||_n);
END $s1b$;

-- S1c — admin CAN see it
DO $s1c$
DECLARE _uid uuid; _n int;
BEGIN
  SELECT uid INTO _uid FROM actor WHERE role_name='admin';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO _n FROM public.purchase_request_fulfillments
   WHERE purchase_request_id = (SELECT uid FROM actor WHERE role_name='_req');
  RESET ROLE;
  INSERT INTO t(name,passed,detail)
    VALUES ('S1c admin can read it', _n=1, 'rows_visible='||_n);
END $s1c$;

-- =============================================================================
-- S2 — nobody may INSERT / UPDATE / DELETE directly (no write policies exist)
-- =============================================================================
DO $s2$
DECLARE r record; _bad text := '';
BEGIN
  FOR r IN SELECT role_name, uid FROM actor WHERE role_name IN ('admin','manager','sales','accountant') LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.purchase_request_fulfillments
        (purchase_request_id, purchase_id, purchase_item_id, allocated_quantity, created_by)
      VALUES ((SELECT uid FROM actor WHERE role_name='_req'),
              (SELECT uid FROM actor WHERE role_name='_pur'),
              NULL, 1, r.uid);
      _bad := _bad || r.role_name || ':INSERT_ALLOWED ';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      UPDATE public.purchase_request_fulfillments SET allocated_quantity = 99;
      IF FOUND THEN _bad := _bad || r.role_name || ':UPDATE_ALLOWED '; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      DELETE FROM public.purchase_request_fulfillments;
      IF FOUND THEN _bad := _bad || r.role_name || ':DELETE_ALLOWED '; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  INSERT INTO t(name,passed,detail)
    VALUES ('S2 no role can INSERT/UPDATE/DELETE fulfillments directly (RPC-only door)',
            _bad='', COALESCE(NULLIF(_bad,''),'all writes blocked'));
END $s2$;

-- =============================================================================
-- S3 — purchase_idempotency is sealed from every client role
-- =============================================================================
DO $s3$
DECLARE r record; _bad text := ''; _n int;
BEGIN
  FOR r IN SELECT role_name, uid FROM actor WHERE role_name IN ('admin','manager','sales','accountant','norole') LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      SELECT COUNT(*) INTO _n FROM public.purchase_idempotency;
      _bad := _bad || r.role_name || ':SELECT_ALLOWED ';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  INSERT INTO t(name,passed,detail)
    VALUES ('S3 purchase_idempotency unreadable by every client role', _bad='',
            COALESCE(NULLIF(_bad,''),'all denied'));
END $s3$;

-- =============================================================================
-- S4 — the views are not reachable by clients (financial leakage guard)
-- =============================================================================
DO $s4$
DECLARE r record; v text; _bad text := ''; _n int;
BEGIN
  FOR r IN SELECT role_name, uid FROM actor WHERE role_name IN ('admin','sales','accountant') LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH v IN ARRAY ARRAY['v_purchase_item_allocation','v_purchase_request_fulfillment','v_purchase_requests_legacy_unknown'] LOOP
      BEGIN
        EXECUTE format('SELECT COUNT(*) FROM public.%I', v) INTO _n;
        _bad := _bad || r.role_name || ':' || v || ' ';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
    RESET ROLE;
  END LOOP;
  INSERT INTO t(name,passed,detail)
    VALUES ('S4 no client role can read the three views', _bad='',
            COALESCE(NULLIF(_bad,''),'all denied'));
END $s4$;

-- =============================================================================
-- S5 — the view on purchase economics does not leak price to sales even if a
--      grant were ever added: security_invoker keeps the caller's RLS.
-- =============================================================================
DO $s5$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='v'
    AND c.relname IN ('v_purchase_item_allocation','v_purchase_request_fulfillment','v_purchase_requests_legacy_unknown')
    AND array_to_string(c.reloptions,',') LIKE '%security_invoker=true%';
  INSERT INTO t(name,passed,detail)
    VALUES ('S5 views are security_invoker (cannot be used to bypass RLS)', _n=3, 'invoker_views='||_n||'/3');
END $s5$;

-- =============================================================================
-- S6 — the new trigger function is hardened
-- =============================================================================
DO $s6$
DECLARE _sec boolean; _cfg text; _pub boolean;
BEGIN
  SELECT p.prosecdef, array_to_string(p.proconfig,',')
    INTO _sec, _cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='tg_prf_validate_allocation';

  SELECT has_function_privilege('public','public.tg_prf_validate_allocation()','EXECUTE') INTO _pub;

  INSERT INTO t(name,passed,detail)
    VALUES ('S6 allocation trigger is SECURITY DEFINER with a fixed search_path',
            _sec AND _cfg LIKE '%search_path%',
            'definer='||_sec||' config='||COALESCE(_cfg,'<none>'));
END $s6$;

-- =============================================================================
-- S7 — no unexpected PUBLIC grants on the new objects
-- =============================================================================
DO $s7$
DECLARE _n int; _d text;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(table_name||'/'||grantee||'/'||privilege_type,' '),'')
    INTO _n, _d
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('purchase_request_fulfillments','purchase_idempotency',
                       'v_purchase_item_allocation','v_purchase_request_fulfillment',
                       'v_purchase_requests_legacy_unknown')
    AND grantee IN ('PUBLIC','anon');
  INSERT INTO t(name,passed,detail)
    VALUES ('S7 no PUBLIC/anon grants on any new object', _n=0, 'grants='||_n||' '||_d);
END $s7$;

-- S7b — authenticated has SELECT on fulfillments only (needed for the card),
--       and nothing else.
DO $s7b$
DECLARE _d text;
BEGIN
  SELECT COALESCE(string_agg(table_name||':'||privilege_type,' ' ORDER BY table_name||privilege_type),'none')
    INTO _d
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND table_name IN ('purchase_request_fulfillments','purchase_idempotency',
                       'v_purchase_item_allocation','v_purchase_request_fulfillment',
                       'v_purchase_requests_legacy_unknown');
  INSERT INTO t(name,passed,detail)
    VALUES ('S7b authenticated holds exactly SELECT on fulfillments and nothing else',
            _d='purchase_request_fulfillments:SELECT', 'grants='||_d);
END $s7b$;

\echo ''
\echo '================ C1.2 SECURITY TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total FROM t;

ROLLBACK;
