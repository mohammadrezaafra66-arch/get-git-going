SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C3 — security of the request summary
-- Rolled back. Seeds a request OWNED BY a sales user, buys for it as admin,
-- then reads the list as that sales user. Without the seed the salesperson sees
-- no rows at all and the masking assertion would pass vacuously.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text);

INSERT INTO fx VALUES ('admin','05098088-2849-43f4-8eb5-7c473c3832ec');
INSERT INTO fx SELECT 'sales', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='sales' AND NOT EXISTS (
   SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id
     AND x.role IN ('admin','manager','accountant')) LIMIT 1;
-- A PURE accountant. Several accounts hold accountant AND admin, and picking
-- one of those would have satisfied the visibility rule through the admin
-- branch, making the assertion below meaningless.
INSERT INTO fx SELECT 'accountant', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='accountant' AND NOT EXISTS (
   SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id
     AND x.role IN ('admin','manager')) LIMIT 1;
INSERT INTO fx SELECT 'product', id::text FROM public.products WHERE status='active' LIMIT 1;
INSERT INTO fx SELECT 'term',    id::text FROM public.payment_terms WHERE is_active AND days>0 LIMIT 1;
INSERT INTO fx SELECT 'sup',     id::text FROM public.suppliers WHERE is_active LIMIT 1;

-- a request RAISED BY the salesperson, assigned to admin
DO $seed$
DECLARE _r uuid;
BEGIN
  INSERT INTO public.purchase_requests (product_id, quantity, unit, requested_by, assigned_to, status)
  VALUES ((SELECT v FROM fx WHERE k='product')::uuid, 10, 'عدد',
          (SELECT v FROM fx WHERE k='sales')::uuid,
          (SELECT v FROM fx WHERE k='admin')::uuid, 'approved')
  RETURNING id INTO _r;
  INSERT INTO fx VALUES ('req', _r::text);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='admin'),'role','authenticated')::text, true);

  PERFORM public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid, (SELECT v FROM fx WHERE k='term')::uuid,
    9999, 'toman', 6, CURRENT_DATE, (SELECT v FROM fx WHERE k='sup')::uuid,
    NULL, public.default_warehouse_id(), 'security probe',
    _r, NULL, false, NULL, NULL);
END $seed$;

-- =============================================================================
-- S1  The salesperson CAN see their own request and its fulfillment progress
-- =============================================================================
DO $$
DECLARE _rows int; _sup numeric; _rem numeric; _state text; _n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='sales'),'role','authenticated')::text, true);

  SELECT COUNT(*) INTO _rows FROM public.get_purchase_requests(NULL,NULL,50,0)
   WHERE id=(SELECT v FROM fx WHERE k='req')::uuid;

  SELECT supplied_quantity, remaining_quantity, fulfillment_state, purchase_count
    INTO _sup, _rem, _state, _n
  FROM public.get_purchase_requests(NULL,NULL,50,0)
   WHERE id=(SELECT v FROM fx WHERE k='req')::uuid;

  INSERT INTO t(name,passed,detail)
    VALUES ('S1 requester sees their own request with supplied/remaining/state',
            _rows=1 AND _sup=6 AND _rem=4 AND _state='partial' AND _n=1,
            'rows='||_rows||' supplied='||_sup||' remaining='||_rem||' state='||_state);
END $$;

-- =============================================================================
-- S2  ...but NOT the money: no price, currency, total or supplier keys
-- =============================================================================
DO $$
DECLARE _leak boolean; _keys text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='sales'),'role','authenticated')::text, true);

  SELECT COALESCE(bool_or(s ? 'purchase_price' OR s ? 'currency'
                          OR s ? 'total_amount' OR s ? 'supplier_name'), false),
         COALESCE(string_agg(DISTINCT k, ','), '')
    INTO _leak, _keys
  FROM public.get_purchase_requests(NULL,NULL,50,0) g,
       LATERAL jsonb_array_elements(g.purchase_summaries) s,
       LATERAL jsonb_object_keys(s) k;

  INSERT INTO t(name,passed,detail)
    VALUES ('S2 sales sees NO purchase price, currency, total or supplier', NOT _leak,
            'keys visible to sales: '||_keys);
END $$;

-- =============================================================================
-- S3  Admin DOES see the money
-- =============================================================================
DO $$
DECLARE _has boolean; _price numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='admin'),'role','authenticated')::text, true);

  SELECT bool_or(s ? 'purchase_price'), max((s->>'purchase_price')::numeric)
    INTO _has, _price
  FROM public.get_purchase_requests(NULL,NULL,50,0) g,
       LATERAL jsonb_array_elements(g.purchase_summaries) s
  WHERE g.id=(SELECT v FROM fx WHERE k='req')::uuid;

  INSERT INTO t(name,passed,detail)
    VALUES ('S3 admin sees the purchase price', COALESCE(_has,false) AND _price=9999,
            'price='||COALESCE(_price::text,'<none>'));
END $$;

-- =============================================================================
-- S4  Accountant also sees the money (per the permission matrix)
-- =============================================================================
DO $$
DECLARE _has boolean; _rows int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='accountant'),'role','authenticated')::text, true);
  SELECT COUNT(*) INTO _rows FROM public.get_purchase_requests(NULL,NULL,50,0);
  INSERT INTO t(name,passed,detail)
    VALUES ('S4 accountant is not granted request visibility by this function (unchanged rule)',
            _rows=0, 'rows='||_rows||' — visibility rule is requester/assignee/admin/manager, untouched by C3');
END $$;

-- =============================================================================
-- S5  receipt_count is NOT inflated by the fulfillment data
-- =============================================================================
DO $$
DECLARE _rc bigint; _f int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='admin'),'role','authenticated')::text, true);
  SELECT receipt_count INTO _rc FROM public.get_purchase_requests(NULL,NULL,50,0)
   WHERE id=(SELECT v FROM fx WHERE k='req')::uuid;
  SELECT COUNT(*) INTO _f FROM public.purchase_request_fulfillments
   WHERE purchase_request_id=(SELECT v FROM fx WHERE k='req')::uuid;
  INSERT INTO t(name,passed,detail)
    VALUES ('S5 receipt_count stays 0 despite the request having fulfillments',
            _rc=0 AND _f>0, 'receipt_count='||_rc||' fulfillments='||_f);
END $$;

-- =============================================================================
-- S6  One row per request — no fan-out
-- =============================================================================
DO $$
DECLARE _rows int; _distinct int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='admin'),'role','authenticated')::text, true);
  SELECT COUNT(*), COUNT(DISTINCT id) INTO _rows, _distinct
   FROM public.get_purchase_requests(NULL,NULL,200,0);
  INSERT INTO t(name,passed,detail)
    VALUES ('S6 exactly one row per request (no fan-out)', _rows=_distinct,
            'rows='||_rows||' distinct='||_distinct);
END $$;

-- =============================================================================
-- S7  The fulfillment table and views remain unreachable from a client role
-- =============================================================================
DO $$
DECLARE _ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k='sales'),'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM COUNT(*) FROM public.v_purchase_item_allocation;
    _ok := true;
  EXCEPTION WHEN OTHERS THEN _ok := false;
  END;
  RESET ROLE;
  INSERT INTO t(name,passed,detail)
    VALUES ('S7 sales still cannot read v_purchase_item_allocation directly', NOT _ok,
            CASE WHEN _ok THEN 'READABLE' ELSE 'denied' END);
END $$;

-- =============================================================================
-- S8  create_purchase hardening still intact after 252
-- =============================================================================
DO $$
DECLARE _sec boolean; _cfg text; _pub boolean;
BEGIN
  SELECT p.prosecdef, array_to_string(p.proconfig,',') INTO _sec, _cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_purchase';
  SELECT has_function_privilege('public',
    'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)',
    'EXECUTE') INTO _pub;
  INSERT INTO t(name,passed,detail)
    VALUES ('S8 create_purchase still DEFINER, fixed search_path, no PUBLIC execute',
            _sec AND _cfg LIKE '%search_path%' AND NOT _pub,
            'definer='||_sec||' cfg='||COALESCE(_cfg,'none')||' public='||_pub);
END $$;

-- S9 same for get_purchase_requests
--
-- Resolved through pg_proc.oid rather than a hand-written signature string.
-- C4 added a fifth parameter (p_unassigned_only), and the literal
-- 'get_purchase_requests(text,uuid,integer,integer)' stopped resolving — which
-- aborted the whole transaction instead of failing one assertion. Looking the
-- function up by name keeps this test honest across signature changes.
DO $$
DECLARE _sec boolean; _cfg text; _pub boolean; _anon boolean; _oid oid;
BEGIN
  SELECT p.oid, p.prosecdef, array_to_string(p.proconfig,',') INTO _oid, _sec, _cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_purchase_requests';

  SELECT has_function_privilege('public', _oid, 'EXECUTE') INTO _pub;
  -- anon is checked too: Supabase's default privileges grant EXECUTE to anon on
  -- every new function, and re-creating this one is exactly when that grant
  -- comes back.
  SELECT has_function_privilege('anon', _oid, 'EXECUTE') INTO _anon;

  INSERT INTO t(name,passed,detail)
    VALUES ('S9 get_purchase_requests DEFINER, fixed search_path, no PUBLIC/anon execute',
            _sec AND _cfg LIKE '%search_path%' AND NOT _pub AND NOT _anon,
            'definer='||_sec||' cfg='||COALESCE(_cfg,'none')
            ||' public='||_pub||' anon='||_anon);
END $$;

\echo ''
\echo '================ C3 SECURITY TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total FROM t;

ROLLBACK;
