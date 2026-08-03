SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C5.2 — permission alignment, derived-status lock, ACL hardening
-- Everything runs inside a transaction that is ROLLED BACK.
--
-- Role fixtures (purchase_specialist) are granted inside this transaction and
-- vanish with the rollback. No real user's roles change.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text);

INSERT INTO fx VALUES ('admin','05098088-2849-43f4-8eb5-7c473c3832ec');

INSERT INTO fx SELECT 'manager', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='manager' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role='admin') LIMIT 1;

INSERT INTO fx SELECT 'sales', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='sales' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id
                      AND x.role IN ('admin','manager','purchase_specialist','accountant'))
 LIMIT 1;

INSERT INTO fx SELECT 'accountant', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='accountant' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager','purchase_specialist'))
 LIMIT 1;

INSERT INTO fx SELECT 'viewer', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='viewer' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id
                      AND x.role IN ('admin','manager','purchase_specialist','sales','accountant'))
 LIMIT 1;

-- sales AND manager together: the union must behave as manager
INSERT INTO fx SELECT 'combo', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='sales' AND p.is_active AND p.status='active'
   AND EXISTS (SELECT 1 FROM public.user_roles x
                WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager')) LIMIT 1;

INSERT INTO fx SELECT 'inactive', p.id::text FROM public.profiles p
 WHERE (NOT p.is_active OR p.status <> 'active') LIMIT 1;

-- two transactional specialists
INSERT INTO fx SELECT 'spec', p.id::text FROM public.profiles p
 WHERE p.is_active AND p.status='active' AND p.id::text NOT IN (SELECT v FROM fx)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=p.id AND x.role IN ('admin','manager'))
 ORDER BY p.created_at, p.id LIMIT 1;
INSERT INTO fx SELECT 'spec2', p.id::text FROM public.profiles p
 WHERE p.is_active AND p.status='active' AND p.id::text NOT IN (SELECT v FROM fx)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=p.id AND x.role IN ('admin','manager'))
 ORDER BY p.created_at DESC, p.id DESC LIMIT 1;
INSERT INTO public.user_roles(user_id, role)
SELECT v::uuid, 'purchase_specialist' FROM fx WHERE k IN ('spec','spec2')
ON CONFLICT DO NOTHING;

INSERT INTO fx SELECT 'product', id::text FROM public.products WHERE status='active' LIMIT 1;
INSERT INTO fx SELECT 'term', id::text FROM public.payment_terms WHERE is_active LIMIT 1;

-- ---- helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.act(k text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _u text;
BEGIN
  SELECT v INTO _u FROM fx WHERE fx.k = act.k;
  IF _u IS NULL THEN RAISE EXCEPTION 'missing fixture %', k; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_u,'role','authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.have(k text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM fx WHERE fx.k = have.k AND v IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(label text, hint_expected text, body text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _h text; _s text;
BEGIN
  BEGIN
    EXECUTE body;
    INSERT INTO t(name,passed,detail) VALUES (label,false,'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _h = PG_EXCEPTION_HINT, _s = RETURNED_SQLSTATE;
    INSERT INTO t(name,passed,detail)
      VALUES (label, _h = hint_expected, 'sqlstate='||_s||' hint='||COALESCE(_h,'<none>'));
  END;
END $$;

-- Runs a statement as an actual database role, so the GRANT layer is what is
-- being tested rather than a policy or an in-function check.
CREATE OR REPLACE FUNCTION pg_temp.expect_denied_as(label text, db_role text, body text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _s text; _ok boolean; _msg text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', db_role);
    EXECUTE body;
    _ok := false; _s := '-'; _msg := 'no error';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    _ok := true;
  END;
  RESET ROLE;
  INSERT INTO t(name,passed,detail)
    VALUES (label, _ok, 'sqlstate='||_s||' '||left(_msg,60));
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mkreq(assignee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  SELECT public.create_purchase_request(
           (SELECT v FROM fx WHERE k='product')::uuid, 4, 'عدد',
           NULL, 'C5TEST', NULL, assignee) INTO _r;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.buy(req uuid DEFAULT NULL, qty int DEFAULT 4) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid,
    (SELECT v FROM fx WHERE k='term')::uuid,
    1000, 'toman', qty, CURRENT_DATE, NULL, NULL, NULL, 'C5TEST',
    req, NULL, false, NULL, NULL);
END $$;

-- =============================================================================
-- A. standalone purchase — who may, who may not
-- =============================================================================
DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.act('admin');  _r := pg_temp.buy();
  INSERT INTO t(name,passed,detail) VALUES
    ('A1 admin may create a standalone purchase', (_r->'purchase'->>'id') IS NOT NULL,
     'purchase='||COALESCE(_r->'purchase'->>'id','NULL'));
END $$;

DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.act('manager'); _r := pg_temp.buy();
  INSERT INTO t(name,passed,detail) VALUES
    ('A2 manager may create a standalone purchase', (_r->'purchase'->>'id') IS NOT NULL,
     'purchase='||COALESCE(_r->'purchase'->>'id','NULL'));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('A3 sales may NOT create a standalone purchase',
    'PURCHASE_PERMISSION_DENIED','SELECT pg_temp.buy()');
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.expect_fail('A4 purchase_specialist may NOT create a standalone purchase',
    'PURCHASE_PERMISSION_DENIED','SELECT pg_temp.buy()');
  PERFORM pg_temp.act('accountant');
  PERFORM pg_temp.expect_fail('A5 accountant may NOT create a purchase',
    'PURCHASE_PERMISSION_DENIED','SELECT pg_temp.buy()');
END $$;

DO $$
BEGIN
  IF pg_temp.have('viewer') THEN
    PERFORM pg_temp.act('viewer');
    PERFORM pg_temp.expect_fail('A6 viewer may NOT create a purchase',
      'PURCHASE_PERMISSION_DENIED','SELECT pg_temp.buy()');
  ELSE
    INSERT INTO t(name,passed,detail) VALUES
      ('A6 viewer may NOT create a purchase', true, 'skipped: no pure viewer account');
  END IF;
END $$;

DO $$
DECLARE _r jsonb;
BEGIN
  IF pg_temp.have('combo') THEN
    PERFORM pg_temp.act('combo'); _r := pg_temp.buy();
    INSERT INTO t(name,passed,detail) VALUES
      ('A7 sales+manager behaves as manager (union of roles)',
       (_r->'purchase'->>'id') IS NOT NULL, 'purchase created');
  ELSE
    INSERT INTO t(name,passed,detail) VALUES
      ('A7 sales+manager behaves as manager (union of roles)', true, 'skipped: no combined account');
  END IF;
END $$;

-- =============================================================================
-- B. request-bound purchase
-- =============================================================================
DO $$
DECLARE _req uuid; _r jsonb;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved', assigned_to=(SELECT v::uuid FROM fx WHERE k='spec')
   WHERE id=_req;
  INSERT INTO fx VALUES ('req', _req::text);

  PERFORM pg_temp.act('spec');
  _r := pg_temp.buy(_req, 4);
  INSERT INTO t(name,passed,detail) VALUES
    ('B1 the assigned specialist may purchase against their request',
     (_r->'purchase'->>'id') IS NOT NULL, 'purchase created');
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved', assigned_to=(SELECT v::uuid FROM fx WHERE k='spec')
   WHERE id=_req;
  PERFORM pg_temp.act('spec2');
  PERFORM pg_temp.expect_fail('B2 a non-assigned specialist is refused','NOT_ASSIGNED',
    format('SELECT pg_temp.buy(%L::uuid)', _req));
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved', assigned_to=NULL WHERE id=_req;
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.expect_fail('B3 an unassigned request cannot be purchased by a specialist',
    'NOT_ASSIGNED', format('SELECT pg_temp.buy(%L::uuid)', _req));
  INSERT INTO fx VALUES ('req_unassigned', _req::text);
END $$;

DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.buy((SELECT v::uuid FROM fx WHERE k='req_unassigned'), 1);
  INSERT INTO t(name,passed,detail) VALUES
    ('B4 admin override still works on an unassigned request',
     (_r->'purchase'->>'id') IS NOT NULL, 'purchase created');
END $$;

DO $$
DECLARE _req uuid; _r jsonb;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved', assigned_to=(SELECT v::uuid FROM fx WHERE k='spec')
   WHERE id=_req;
  PERFORM pg_temp.act('manager');
  _r := pg_temp.buy(_req, 1);
  INSERT INTO t(name,passed,detail) VALUES
    ('B5 manager override still works on someone else''s request',
     (_r->'purchase'->>'id') IS NOT NULL, 'purchase created');
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved' WHERE id=_req;
  PERFORM pg_temp.act('sales');
  -- NOT_ASSIGNED, not PURCHASE_PERMISSION_DENIED: on the request branch the
  -- assignment check comes first, and a salesperson is never the assignee.
  PERFORM pg_temp.expect_fail('B6 sales cannot purchase even against its own request',
    'NOT_ASSIGNED', format('SELECT pg_temp.buy(%L::uuid)', _req));
END $$;

-- =============================================================================
-- C. derived statuses cannot be set by hand
-- =============================================================================
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved' WHERE id=_req;
  INSERT INTO fx VALUES ('req_manual', _req::text);

  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('C1 admin cannot set purchased through the RPC',
    'PURCHASE_STATUS_DERIVED',
    format('SELECT public.update_purchase_status(%L::uuid, ''purchased'')', _req));
  PERFORM pg_temp.expect_fail('C2 admin cannot set partially_purchased through the RPC',
    'PURCHASE_STATUS_DERIVED',
    format('SELECT public.update_purchase_status(%L::uuid, ''partially_purchased'')', _req));
  PERFORM pg_temp.act('manager');
  PERFORM pg_temp.expect_fail('C3 manager cannot set purchased through the RPC',
    'PURCHASE_STATUS_DERIVED',
    format('SELECT public.update_purchase_status(%L::uuid, ''purchased'')', _req));
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_manual';
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('C4 a hand-typed final price is refused',
    'PURCHASE_FINAL_PRICE_DERIVED',
    format('SELECT public.update_purchase_status(%L::uuid, ''cancelled'', NULL, 5000)', _req));
END $$;

DO $$
DECLARE _req uuid; _st text;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_manual';
  SELECT status INTO _st FROM public.purchase_requests WHERE id=_req;
  INSERT INTO t(name,passed,detail) VALUES
    ('C5 the refused calls left the status untouched', _st='approved', 'status='||_st);
END $$;

DO $$
DECLARE _req uuid; _n int;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_manual';
  SELECT COUNT(*) INTO _n FROM public.purchase_request_status_history
   WHERE request_id=_req AND to_status IN ('purchased','partially_purchased');
  INSERT INTO t(name,passed,detail) VALUES
    ('C6 no fake history row was written', _n=0, 'rows='||_n);
END $$;

DO $$
DECLARE _req uuid; _n int;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_manual';
  SELECT COUNT(*) INTO _n FROM public.notification_events
   WHERE payload->>'reference_id'=_req::text AND payload->>'to' IN ('purchased','partially_purchased');
  INSERT INTO t(name,passed,detail) VALUES
    ('C7 no fake notification was emitted', _n=0, 'rows='||_n);
END $$;

-- The trigger: the lock that also covers a direct UPDATE
DO $$
DECLARE _req uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_manual';
  PERFORM pg_temp.expect_fail('C8 a DIRECT update to purchased is refused by the trigger',
    'PURCHASE_STATUS_DERIVED',
    format('UPDATE public.purchase_requests SET status=''purchased'' WHERE id=%L::uuid', _req));
  PERFORM pg_temp.expect_fail('C9 a DIRECT update to partially_purchased is refused',
    'PURCHASE_STATUS_DERIVED',
    format('UPDATE public.purchase_requests SET status=''partially_purchased'' WHERE id=%L::uuid', _req));
END $$;

DO $$
DECLARE _req uuid; _st text;
BEGIN
  -- a request WITH real fulfillment is already purchased and stays legal
  SELECT v::uuid INTO _req FROM fx WHERE k='req';
  SELECT status INTO _st FROM public.purchase_requests WHERE id=_req;
  INSERT INTO t(name,passed,detail) VALUES
    ('C10 a request with real fulfillment reached purchased legitimately',
     _st='purchased', 'status='||_st);
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  -- partially supplied: claiming "fully purchased" must still be refused
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved', assigned_to=(SELECT v::uuid FROM fx WHERE k='spec')
   WHERE id=_req;
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.buy(_req, 1);   -- 1 of 4
  PERFORM pg_temp.expect_fail('C11 a partially supplied request cannot be forced to purchased',
    'PURCHASE_STATUS_DERIVED',
    format('UPDATE public.purchase_requests SET status=''purchased'' WHERE id=%L::uuid', _req));
END $$;

-- =============================================================================
-- D. transition matrix
-- =============================================================================
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  PERFORM pg_temp.act('admin');
  PERFORM public.update_purchase_status(_req, 'approved');
  INSERT INTO t(name,passed,detail) VALUES
    ('D1 pending -> approved is allowed',
     (SELECT status FROM public.purchase_requests WHERE id=_req)='approved', 'ok');
  PERFORM pg_temp.expect_fail('D2 approved -> delivered is refused','PURCHASE_TRANSITION_INVALID',
    format('SELECT public.update_purchase_status(%L::uuid, ''delivered'')', _req));
  PERFORM public.update_purchase_status(_req, 'cancelled');
  INSERT INTO t(name,passed,detail) VALUES
    ('D3 approved -> cancelled is allowed',
     (SELECT status FROM public.purchase_requests WHERE id=_req)='cancelled', 'ok');
  PERFORM pg_temp.expect_fail('D4 cancelled is terminal','PURCHASE_TRANSITION_INVALID',
    format('SELECT public.update_purchase_status(%L::uuid, ''approved'')', _req));
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req';   -- already purchased, real documents
  PERFORM pg_temp.act('admin');
  PERFORM public.update_purchase_status(_req, 'delivered');
  INSERT INTO t(name,passed,detail) VALUES
    ('D5 purchased -> delivered is allowed and needs no new fulfillment',
     (SELECT status FROM public.purchase_requests WHERE id=_req)='delivered', 'ok');
  PERFORM pg_temp.expect_fail('D6 delivered is terminal','PURCHASE_TRANSITION_INVALID',
    format('SELECT public.update_purchase_status(%L::uuid, ''cancelled'')', _req));
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_unassigned';
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('D7 sales cannot drive a status transition','PURCHASE_PERMISSION_DENIED',
    format('SELECT public.update_purchase_status(%L::uuid, ''cancelled'')', _req));
END $$;

-- =============================================================================
-- E. legacy stays read-only
-- =============================================================================
DO $$
DECLARE _req uuid; _st text; _alloc numeric;
BEGIN
  SELECT id, status INTO _req, _st FROM public.purchase_requests
   WHERE legacy_no_fulfillment LIMIT 1;
  IF _req IS NULL THEN
    INSERT INTO t(name,passed,detail) VALUES ('E1 legacy request untouched', true, 'skipped: none');
  ELSE
    SELECT COALESCE(SUM(allocated_quantity),0) INTO _alloc
      FROM public.purchase_request_fulfillments WHERE purchase_request_id=_req;
    INSERT INTO t(name,passed,detail) VALUES
      ('E1 the legacy request still has no fabricated fulfillment', _alloc=0,
       'status='||_st||' allocated='||_alloc);
    PERFORM pg_temp.act('admin');
    PERFORM pg_temp.expect_fail('E2 legacy cannot be pushed to purchased manually',
      'PURCHASE_STATUS_DERIVED',
      format('SELECT public.update_purchase_status(%L::uuid, ''purchased'')', _req));
    PERFORM pg_temp.expect_fail('E3 legacy request cannot be linked to a new purchase',
      'REQUEST_LEGACY_UNKNOWN', format('SELECT pg_temp.buy(%L::uuid)', _req));
  END IF;
END $$;

-- =============================================================================
-- F. direct table writes are gone
-- =============================================================================
DO $$
BEGIN
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_denied_as('F1 authenticated cannot INSERT into purchases','authenticated',
    'INSERT INTO public.purchases (product_id, payment_term_id, purchase_price, currency,
       quantity, purchase_date, total_amount, status, created_by)
     SELECT (SELECT v FROM fx WHERE k=''product'')::uuid,
            (SELECT v FROM fx WHERE k=''term'')::uuid,
            1, ''toman'', 1, CURRENT_DATE, 1, ''received'',
            (SELECT v FROM fx WHERE k=''admin'')::uuid');
  PERFORM pg_temp.expect_denied_as('F2 authenticated cannot INSERT into purchase_items','authenticated',
    'INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price)
     SELECT gen_random_uuid(), (SELECT v FROM fx WHERE k=''product'')::uuid, 1, 1');
  PERFORM pg_temp.expect_denied_as('F3 authenticated cannot INSERT into purchase_requests','authenticated',
    'INSERT INTO public.purchase_requests (product_id, quantity, unit, requested_by)
     SELECT (SELECT v FROM fx WHERE k=''product'')::uuid, 1, ''عدد'',
            (SELECT v FROM fx WHERE k=''sales'')::uuid');
  PERFORM pg_temp.expect_denied_as('F4 authenticated cannot DELETE purchases','authenticated',
    'DELETE FROM public.purchases WHERE false');
  PERFORM pg_temp.expect_denied_as('F5 authenticated cannot UPDATE purchase_items','authenticated',
    'UPDATE public.purchase_items SET quantity=quantity WHERE false');
  PERFORM pg_temp.expect_denied_as('F6 authenticated cannot read purchase_idempotency','authenticated',
    'SELECT 1 FROM public.purchase_idempotency LIMIT 1');
  PERFORM pg_temp.expect_denied_as('F7 authenticated cannot read v_purchase_item_allocation','authenticated',
    'SELECT 1 FROM public.v_purchase_item_allocation LIMIT 1');
END $$;

DO $$
DECLARE _n int;
BEGIN
  -- the two verbs the application really uses must survive
  SELECT COUNT(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='authenticated'
     AND ((table_name='purchases' AND privilege_type IN ('SELECT','UPDATE'))
       OR (table_name='purchase_requests' AND privilege_type IN ('SELECT','UPDATE'))
       OR (table_name='purchase_items' AND privilege_type='SELECT'));
  INSERT INTO t(name,passed,detail) VALUES
    ('F8 the grants the app relies on are intact (5 expected)', _n=5, 'grants='||_n);
END $$;

-- =============================================================================
-- G. anon and PUBLIC
-- =============================================================================
DO $$
DECLARE r record; _bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('create_purchase','create_purchase_request','assign_purchase_request',
        'update_purchase_status','get_purchase_requests','is_valid_purchase_assignee',
        'get_default_purchase_assignee','set_default_purchase_assignee',
        'get_purchase_assignee_options','tg_purchase_request_status_derived')
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      _bad := _bad || r.proname || ':anon '; END IF;
    IF has_function_privilege('public', r.oid, 'EXECUTE') THEN
      _bad := _bad || r.proname || ':public '; END IF;
  END LOOP;
  INSERT INTO t(name,passed,detail) VALUES
    ('G1 no purchase function is executable by anon or PUBLIC', _bad='',
     COALESCE(NULLIF(_bad,''),'all clean'));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.expect_denied_as('G2 anon cannot execute create_purchase','anon',
    'SELECT public.create_purchase(gen_random_uuid(), gen_random_uuid(), 1, ''toman'', 1,
       CURRENT_DATE, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL)');
  PERFORM pg_temp.expect_denied_as('G3 anon cannot execute create_purchase_request','anon',
    'SELECT public.create_purchase_request(gen_random_uuid(), 1, ''عدد'')');
  PERFORM pg_temp.expect_denied_as('G4 anon cannot execute assign_purchase_request','anon',
    'SELECT public.assign_purchase_request(gen_random_uuid())');
  PERFORM pg_temp.expect_denied_as('G5 anon cannot execute update_purchase_status','anon',
    'SELECT public.update_purchase_status(gen_random_uuid(), ''approved'')');
  PERFORM pg_temp.expect_denied_as('G6 anon cannot execute get_purchase_requests','anon',
    'SELECT 1 FROM public.get_purchase_requests() LIMIT 1');
  PERFORM pg_temp.expect_denied_as('G7 anon cannot read purchases','anon',
    'SELECT 1 FROM public.purchases LIMIT 1');
  PERFORM pg_temp.expect_denied_as('G8 anon cannot read purchase_requests','anon',
    'SELECT 1 FROM public.purchase_requests LIMIT 1');
  PERFORM pg_temp.expect_denied_as('G9 the trigger function is not callable by authenticated','authenticated',
    'SELECT public.tg_purchase_request_status_derived()');
END $$;

DO $$
DECLARE r record; _bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef, array_to_string(p.proconfig,',') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('create_purchase','create_purchase_request','assign_purchase_request',
        'update_purchase_status','get_purchase_requests','tg_purchase_request_status_derived')
  LOOP
    IF NOT r.prosecdef THEN _bad := _bad || r.proname || ':not-definer '; END IF;
    IF r.cfg IS NULL OR r.cfg NOT LIKE 'search_path=%' THEN
      _bad := _bad || r.proname || ':no-search-path '; END IF;
  END LOOP;
  INSERT INTO t(name,passed,detail) VALUES
    ('G10 every purchase function is DEFINER with a fixed search_path', _bad='',
     COALESCE(NULLIF(_bad,''),'all clean'));
END $$;

-- =============================================================================
-- H. financial masking and isolation
-- =============================================================================
DO $$
DECLARE _leak int; _rows int;
BEGIN
  PERFORM pg_temp.act('sales');
  SELECT COUNT(*) INTO _rows FROM public.get_purchase_requests(NULL,NULL,200,0);
  SELECT COUNT(*) INTO _leak
    FROM public.get_purchase_requests(NULL,NULL,200,0) g,
         LATERAL jsonb_array_elements(g.purchase_summaries) e
   WHERE e ? 'purchase_price' OR e ? 'total_amount' OR e ? 'supplier_name' OR e ? 'currency';
  INSERT INTO t(name,passed,detail) VALUES
    ('H1 sales sees no financial key at all', _leak=0, 'rows='||_rows||' leaked='||_leak);
END $$;

DO $$
DECLARE _has int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _has
    FROM public.get_purchase_requests(NULL,NULL,200,0) g,
         LATERAL jsonb_array_elements(g.purchase_summaries) e
   WHERE e ? 'purchase_price';
  -- non-vacuous: the masking test above only means something if the data exists
  INSERT INTO t(name,passed,detail) VALUES
    ('H2 admin DOES see financial keys (proves H1 is not vacuous)', _has>0, 'entries='||_has);
END $$;

DO $$
DECLARE _leak int;
BEGIN
  PERFORM pg_temp.act('spec');
  SELECT COUNT(*) INTO _leak
    FROM public.get_purchase_requests(NULL,NULL,200,0) g,
         LATERAL jsonb_array_elements(g.purchase_summaries) e
   WHERE e ? 'purchase_price' OR e ? 'supplier_name';
  INSERT INTO t(name,passed,detail) VALUES
    ('H3 a purchase specialist sees no financial key either', _leak=0, 'leaked='||_leak);
END $$;

DO $$
DECLARE _mine int; _others int;
BEGIN
  PERFORM pg_temp.act('spec');
  SELECT COUNT(*) INTO _mine FROM public.get_purchase_requests(NULL,NULL,500,0);
  SELECT COUNT(*) INTO _others FROM public.get_purchase_requests(NULL,NULL,500,0) g
   WHERE g.assigned_to IS DISTINCT FROM (SELECT v::uuid FROM fx WHERE k='spec')
     AND g.requested_by IS DISTINCT FROM (SELECT v::uuid FROM fx WHERE k='spec');
  INSERT INTO t(name,passed,detail) VALUES
    ('H4 a specialist sees only their own requests', _others=0,
     'visible='||_mine||' not-theirs='||_others);
END $$;

DO $$
DECLARE _n int; _total int;
BEGIN
  -- Counted as the authenticated ROLE, not as supabase_admin. The first version
  -- of this test ran as the superuser, which bypasses RLS, so it counted every
  -- row in the table and would have passed or failed for reasons that had
  -- nothing to do with the policy.
  PERFORM pg_temp.act('sales');
  SELECT COUNT(*) INTO _total FROM public.purchase_request_fulfillments;
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO _n
    FROM public.purchase_request_fulfillments f
    JOIN public.purchase_requests r ON r.id = f.purchase_request_id
   WHERE r.requested_by IS DISTINCT FROM auth.uid()
     AND r.assigned_to  IS DISTINCT FROM auth.uid();
  RESET ROLE;
  INSERT INTO t(name,passed,detail) VALUES
    ('H5 sales sees no fulfillment belonging to someone else''s request', _n=0,
     'foreign rows visible='||_n||' of '||_total||' total');
END $$;

-- =============================================================================
-- I. audit / notification hygiene
-- =============================================================================
DO $$
DECLARE _req uuid; _a int; _n int;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  PERFORM pg_temp.act('admin');
  PERFORM public.update_purchase_status(_req, 'approved');
  SELECT COUNT(*) INTO _a FROM public.audit_logs
   WHERE entity_id=_req::text AND action='status_changed';
  SELECT COUNT(*) INTO _n FROM public.notification_events
   WHERE payload->>'reference_id'=_req::text AND event_type='purchase_status_changed';
  INSERT INTO t(name,passed,detail) VALUES
    ('I1 a real transition audits once and notifies once', _a=1 AND _n=1,
     'audits='||_a||' notifications='||_n);
END $$;

DO $$
DECLARE _req uuid; _a0 int; _a1 int;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  SELECT COUNT(*) INTO _a0 FROM public.audit_logs WHERE entity_id=_req::text;
  PERFORM pg_temp.act('admin');
  BEGIN PERFORM public.update_purchase_status(_req, 'purchased'); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT COUNT(*) INTO _a1 FROM public.audit_logs WHERE entity_id=_req::text;
  INSERT INTO t(name,passed,detail) VALUES
    ('I2 a refused transition writes no audit row', _a1=_a0, 'audits '||_a0||'->'||_a1);
END $$;

DO $$
DECLARE _p0 int; _p1 int; _res jsonb; _key text := 'C5-idem-'||md5('x');
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  _res := public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid, (SELECT v FROM fx WHERE k='term')::uuid,
    1000,'toman',1,CURRENT_DATE,NULL,NULL,NULL,'C5TEST',NULL,NULL,false,NULL,_key);
  _res := public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid, (SELECT v FROM fx WHERE k='term')::uuid,
    1000,'toman',1,CURRENT_DATE,NULL,NULL,NULL,'C5TEST',NULL,NULL,false,NULL,_key);
  SELECT COUNT(*) INTO _p1 FROM public.purchases;
  INSERT INTO t(name,passed,detail) VALUES
    ('I3 the same idempotency key creates exactly one purchase', _p1=_p0+1,
     'purchases '||_p0||'->'||_p1);
END $$;

-- =============================================================================
-- J. role_permissions matches enforcement
-- =============================================================================
DO $$
DECLARE _bad text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM public.role_permissions
              WHERE module='purchases' AND can_create
                AND role_name NOT IN ('admin','manager')) THEN
    _bad := _bad || 'create-advertised-beyond-admin/manager ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.role_permissions
                  WHERE module='purchases' AND role_name='sales' AND can_view) THEN
    _bad := _bad || 'sales-lost-view ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.role_permissions
                  WHERE module='purchases' AND role_name='purchase_specialist' AND can_view) THEN
    _bad := _bad || 'specialist-lost-view ';
  END IF;
  INSERT INTO t(name,passed,detail) VALUES
    ('J1 role_permissions advertises exactly what the backend honours', _bad='',
     COALESCE(NULLIF(_bad,''),'aligned'));
END $$;

DO $$
DECLARE _r jsonb;
BEGIN
  -- sales keeps the one thing it must keep
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  INSERT INTO t(name,passed,detail) VALUES
    ('J2 sales can still raise a purchase request', (_r->>'request_id') IS NOT NULL,
     'source='||COALESCE(_r->>'assignment_source','?'));
END $$;

DO $$
DECLARE _stale int; _names text;
BEGIN
  -- Report-only, deliberately.
  --
  -- The obvious rule — a deactivated account may not transact — cannot be
  -- enforced here, because profiles.is_active is not maintained as an
  -- authorization signal on this database. The account the entire test suite
  -- signs in as (test.admin@afrakala.local) is is_active=false, status=
  -- 'rejected', holds admin, and works perfectly. Migration 260 tried to
  -- enforce it and immediately locked that account out; 262 withdrew it.
  --
  -- So this records the size of the problem instead of pretending it is solved.
  SELECT COUNT(DISTINCT p.id),
         COALESCE(string_agg(DISTINCT COALESCE(p.full_name,p.id::text), ', '), '')
    INTO _stale, _names
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role IN ('admin','manager','purchase_specialist')
     AND (NOT p.is_active OR p.status <> 'active');

  INSERT INTO t(name,passed,detail) VALUES
    ('J3 REPORT-ONLY: privileged accounts flagged inactive but still able to act',
     true, 'count='||_stale||' -> '||left(_names,90)
     ||' (enforcement deferred: see migration 262)');
END $$;

-- =============================================================================
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, name, detail
FROM t ORDER BY seq;

SELECT COUNT(*) FILTER (WHERE passed) passed,
       COUNT(*) FILTER (WHERE NOT passed) failed,
       COUNT(*) total FROM t;

ROLLBACK;
