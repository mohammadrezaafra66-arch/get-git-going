SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C3.2 — create_purchase request-linking verification
-- Everything inside a transaction that is ROLLED BACK.
-- =============================================================================

BEGIN;

\i /tmp/252.sql

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text);

INSERT INTO fx VALUES ('admin','05098088-2849-43f4-8eb5-7c473c3832ec');
INSERT INTO fx SELECT 'manager', user_id::text FROM public.user_roles
 WHERE role='manager' AND NOT EXISTS (
   SELECT 1 FROM public.user_roles x WHERE x.user_id=user_roles.user_id AND x.role='admin') LIMIT 1;
INSERT INTO fx SELECT 'sales', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='sales' AND NOT EXISTS (
   SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id
     AND x.role IN ('admin','manager','accountant')) LIMIT 1;
INSERT INTO fx SELECT 'product',  id::text FROM public.products WHERE status='active' LIMIT 1;
INSERT INTO fx SELECT 'product2', id::text FROM public.products WHERE status='active' OFFSET 1 LIMIT 1;
INSERT INTO fx SELECT 'term',     id::text FROM public.payment_terms WHERE is_active AND days>0 LIMIT 1;
INSERT INTO fx SELECT 'wh',       public.default_warehouse_id()::text;
INSERT INTO fx SELECT 'sup1',     id::text FROM public.suppliers WHERE is_active LIMIT 1;
INSERT INTO fx SELECT 'sup2',     id::text FROM public.suppliers WHERE is_active OFFSET 1 LIMIT 1;

CREATE OR REPLACE FUNCTION pg_temp.act(role_key text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k=role_key),'role','authenticated')::text, true);
END $$;

-- create an approved request assigned to admin
CREATE OR REPLACE FUNCTION pg_temp.new_request(qty numeric, prod uuid DEFAULT NULL,
                                               st text DEFAULT 'approved')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.purchase_requests (product_id, quantity, unit, requested_by, assigned_to, status, notes)
  VALUES (COALESCE(prod,(SELECT v FROM fx WHERE k='product')::uuid), qty, 'عدد',
          (SELECT v FROM fx WHERE k='admin')::uuid, (SELECT v FROM fx WHERE k='admin')::uuid,
          st, 'C3 test request')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.buy(
  req uuid, qty integer, price numeric DEFAULT 1000, sup uuid DEFAULT NULL,
  alloc numeric DEFAULT NULL, over boolean DEFAULT false, note text DEFAULT NULL,
  idem text DEFAULT NULL, prod uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.create_purchase(
    COALESCE(prod,(SELECT v FROM fx WHERE k='product')::uuid),
    (SELECT v FROM fx WHERE k='term')::uuid,
    price, 'toman', qty, CURRENT_DATE,
    sup, NULL, (SELECT v FROM fx WHERE k='wh')::uuid, 'C3 purchase',
    req, alloc, over, note, idem);
END $$;

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

-- =============================================================================
-- 1  Approved -> full purchase
-- =============================================================================
DO $$
DECLARE _r uuid; res jsonb; _st text; _f int; _hist int; _notif int; _aud int;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  SELECT COUNT(*) INTO _hist FROM public.purchase_request_status_history WHERE request_id=_r;
  SELECT COUNT(*) INTO _notif FROM public.notification_events;
  SELECT COUNT(*) INTO _aud FROM public.audit_logs WHERE action='purchase_linked_to_request';

  res := pg_temp.buy(_r, 10);

  SELECT status INTO _st FROM public.purchase_requests WHERE id=_r;
  SELECT COUNT(*) INTO _f FROM public.purchase_request_fulfillments WHERE purchase_request_id=_r;

  INSERT INTO t(name,passed,detail) VALUES
   ('D1 approved -> full purchase sets status=purchased',
    _st='purchased' AND _f=1 AND (res->'request'->>'remaining_quantity')::numeric=0,
    'status='||_st||' fulfillments='||_f||' remaining='||(res->'request'->>'remaining_quantity')),
   ('D1b exactly one history row',
    (SELECT COUNT(*) FROM public.purchase_request_status_history WHERE request_id=_r) = _hist+1,
    'history +'||((SELECT COUNT(*) FROM public.purchase_request_status_history WHERE request_id=_r)-_hist)),
   ('D1c exactly one notification',
    (SELECT COUNT(*) FROM public.notification_events) = _notif+1, 'notifications +1'),
   ('D1d exactly one business audit row',
    (SELECT COUNT(*) FROM public.audit_logs WHERE action='purchase_linked_to_request') = _aud+1,
    'audit +1');
END $$;

-- =============================================================================
-- 2-3  Partial then completion (multi-stage)
-- =============================================================================
DO $$
DECLARE _r uuid; res jsonb; _st text;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);

  res := pg_temp.buy(_r, 4);
  SELECT status INTO _st FROM public.purchase_requests WHERE id=_r;
  INSERT INTO t(name,passed,detail)
   VALUES ('D2 partial purchase -> partially_purchased, remaining 6',
           _st='partially_purchased' AND (res->'request'->>'remaining_quantity')::numeric=6,
           'status='||_st||' remaining='||(res->'request'->>'remaining_quantity'));

  res := pg_temp.buy(_r, 6);
  SELECT status INTO _st FROM public.purchase_requests WHERE id=_r;
  INSERT INTO t(name,passed,detail)
   VALUES ('D3 second stage completes it -> purchased, remaining 0, 2 fulfillments',
           _st='purchased'
           AND (res->'request'->>'remaining_quantity')::numeric=0
           AND (SELECT COUNT(*) FROM public.purchase_request_fulfillments WHERE purchase_request_id=_r)=2,
           'status='||_st||' remaining='||(res->'request'->>'remaining_quantity'));
  INSERT INTO fx VALUES ('multi_req', _r::text);
END $$;

-- 4 two suppliers on one request
DO $$
DECLARE _r uuid; _sups int;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  PERFORM pg_temp.buy(_r, 5, 1000, (SELECT v FROM fx WHERE k='sup1')::uuid);
  PERFORM pg_temp.buy(_r, 5, 1200, (SELECT v FROM fx WHERE k='sup2')::uuid);
  SELECT COUNT(DISTINCT p.supplier_id) INTO _sups
   FROM public.purchase_request_fulfillments f JOIN public.purchases p ON p.id=f.purchase_id
   WHERE f.purchase_request_id=_r;
  INSERT INTO t(name,passed,detail)
   VALUES ('D4 one request supplied by two different suppliers', _sups=2, 'distinct suppliers='||_sups);
END $$;

-- =============================================================================
-- 5  Over-purchase: stock gets 12, request is allocated 10, excess is 2 on the LINE
-- =============================================================================
DO $$
DECLARE _r uuid; res jsonb; _st text; _stock numeric; _excess numeric; _alloc numeric;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  res := pg_temp.buy(_r, 12);

  SELECT status INTO _st FROM public.purchase_requests WHERE id=_r;
  SELECT sm.quantity INTO _stock FROM public.stock_movements sm
   WHERE sm.ref_type='purchase' AND sm.ref_id=(res->'purchase'->>'id')::uuid;
  SELECT excess_quantity, allocated_quantity INTO _excess, _alloc
   FROM public.v_purchase_item_allocation WHERE purchase_item_id=(res->'item'->>'id')::uuid;

  INSERT INTO t(name,passed,detail)
   VALUES ('D5 purchase 12 for request 10: stock=12, allocated=10, line excess=2, status=purchased',
           _stock=12 AND _alloc=10 AND _excess=2 AND _st='purchased',
           'stock='||_stock||' allocated='||_alloc||' excess='||_excess||' status='||_st);
END $$;

-- 6 default allocation never exceeds remaining
DO $$
DECLARE _r uuid; res jsonb;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  PERFORM pg_temp.buy(_r, 7);          -- remaining 3
  res := pg_temp.buy(_r, 9);           -- buys 9, but only 3 are still needed
  INSERT INTO t(name,passed,detail)
   VALUES ('D6 default allocation is capped at remaining (3), not the purchased 9',
           (res->'request'->>'allocated_quantity')::numeric=3
           AND (res->'request'->>'remaining_quantity')::numeric=0,
           'allocated='||(res->'request'->>'allocated_quantity')
           ||' remaining='||(res->'request'->>'remaining_quantity'));
END $$;

-- =============================================================================
-- 7-9  Over-allocation guard
-- =============================================================================
DO $$
DECLARE _r uuid;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(5);
  INSERT INTO fx VALUES ('over_req', _r::text);

  PERFORM pg_temp.expect_fail('D7 explicit over-allocation without confirmation is refused',
    'OVER_ALLOCATION_CONFIRMATION_REQUIRED',
    format('SELECT pg_temp.buy(%L::uuid, 8, 1000, NULL, 8)', _r));

  PERFORM pg_temp.expect_fail('D8 over-allocation confirmed but without a reason is refused',
    'OVER_ALLOCATION_NOTE_REQUIRED',
    format('SELECT pg_temp.buy(%L::uuid, 8, 1000, NULL, 8, true, NULL)', _r));
END $$;

DO $$
DECLARE res jsonb; _st text; _over boolean; _r uuid;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := (SELECT v FROM fx WHERE k='over_req')::uuid;
  res := pg_temp.buy(_r, 8, 1000, NULL, 8, true, 'خرید عمده با تخفیف');
  SELECT status INTO _st FROM public.purchase_requests WHERE id=_r;
  SELECT is_over_allocation INTO _over FROM public.purchase_request_fulfillments
   WHERE purchase_request_id=_r LIMIT 1;
  INSERT INTO t(name,passed,detail)
   VALUES ('D9 over-allocation with a reason is stored, flagged, and yields purchased (not a new state)',
           _st='purchased' AND _over AND (res->'request'->>'effective_supplied')::numeric=5,
           'status='||_st||' flagged='||_over||' effective_supplied='||(res->'request'->>'effective_supplied'));
END $$;

-- =============================================================================
-- 10-15  Request validation
-- =============================================================================
DO $$
DECLARE _r uuid; _rc uuid; _rl uuid; _rp uuid;
BEGIN
  PERFORM pg_temp.act('admin');

  PERFORM pg_temp.expect_fail('D10 product mismatch is refused', 'PRODUCT_MISMATCH',
    format('SELECT pg_temp.buy(%L::uuid, 1, 1000, NULL, NULL, false, NULL, NULL, %L::uuid)',
           pg_temp.new_request(5), (SELECT v FROM fx WHERE k='product2')));

  PERFORM pg_temp.expect_fail('D11 unknown request is refused', 'REQUEST_NOT_FOUND',
    'SELECT pg_temp.buy(''00000000-0000-4000-8000-000000000000''::uuid, 1)');

  _rc := pg_temp.new_request(5, NULL, 'cancelled');
  PERFORM pg_temp.expect_fail('D12 cancelled request is refused', 'REQUEST_CANCELLED',
    format('SELECT pg_temp.buy(%L::uuid, 1)', _rc));

  _rp := pg_temp.new_request(5, NULL, 'pending');
  PERFORM pg_temp.expect_fail('D13 pending request is refused', 'REQUEST_NOT_APPROVED',
    format('SELECT pg_temp.buy(%L::uuid, 1)', _rp));

  _rl := pg_temp.new_request(5);
  UPDATE public.purchase_requests SET legacy_no_fulfillment=true WHERE id=_rl;
  PERFORM pg_temp.expect_fail('D14 legacy request is refused', 'REQUEST_LEGACY_UNKNOWN',
    format('SELECT pg_temp.buy(%L::uuid, 1)', _rl));

  _r := pg_temp.new_request(5);
  PERFORM pg_temp.buy(_r, 5);
  PERFORM pg_temp.expect_fail('D15 fully supplied request is refused', 'REQUEST_ALREADY_COMPLETED',
    format('SELECT pg_temp.buy(%L::uuid, 1)', _r));
END $$;

-- =============================================================================
-- 16-19  Permission
-- =============================================================================
DO $$
DECLARE _r uuid; _ok boolean := true; _m text := '';
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(5);

  -- sales is not the assignee and not privileged
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('D16 non-assignee without privilege is refused', 'NOT_ASSIGNED',
    format('SELECT pg_temp.buy(%L::uuid, 1)', _r));

  -- manager override: not the assignee (admin is), but privileged
  PERFORM pg_temp.act('manager');
  BEGIN PERFORM pg_temp.buy(_r, 2);
  EXCEPTION WHEN OTHERS THEN _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT; END;
  INSERT INTO t(name,passed,detail)
   VALUES ('D17 manager may override and buy for a request assigned to someone else',
           _ok, CASE WHEN _ok THEN 'allowed' ELSE 'REFUSED: '||left(_m,60) END);

  -- assignee (admin) may buy
  PERFORM pg_temp.act('admin');
  _ok := true;
  BEGIN PERFORM pg_temp.buy(_r, 1);
  EXCEPTION WHEN OTHERS THEN _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT; END;
  INSERT INTO t(name,passed,detail)
   VALUES ('D18 the assignee may buy for their own request', _ok,
           CASE WHEN _ok THEN 'allowed' ELSE 'REFUSED: '||left(_m,60) END);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM pg_temp.expect_fail('D19 unauthenticated is refused', 'PURCHASE_NOT_AUTHENTICATED',
    format('SELECT pg_temp.buy(%L::uuid, 1)', (SELECT v FROM fx WHERE k='over_req')));
END $$;

-- =============================================================================
-- 20-22  Idempotency on the request path
-- =============================================================================
DO $$
DECLARE _r uuid; r1 jsonb; r2 jsonb; _f int; _h int; _n int; _s int;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  SELECT COUNT(*) INTO _h FROM public.purchase_request_status_history WHERE request_id=_r;
  SELECT COUNT(*) INTO _n FROM public.notification_events;
  SELECT COUNT(*) INTO _s FROM public.stock_movements;

  r1 := pg_temp.buy(_r, 4, 1000, NULL, NULL, false, NULL, 'C3-KEY-1');
  r2 := pg_temp.buy(_r, 4, 1000, NULL, NULL, false, NULL, 'C3-KEY-1');

  SELECT COUNT(*) INTO _f FROM public.purchase_request_fulfillments WHERE purchase_request_id=_r;

  INSERT INTO t(name,passed,detail) VALUES
   ('D20 replay: one fulfillment, created=false, same purchase id',
    _f=1 AND (r1->>'created')::boolean AND NOT (r2->>'created')::boolean
    AND (r1->'purchase'->>'id')=(r2->'purchase'->>'id'),
    'fulfillments='||_f||' r2.created='||(r2->>'created')),
   ('D21 replay created no second history row',
    (SELECT COUNT(*) FROM public.purchase_request_status_history WHERE request_id=_r)=_h+1, 'history +1'),
   ('D21b replay created no second notification',
    (SELECT COUNT(*) FROM public.notification_events)=_n+1, 'notifications +1'),
   ('D21c replay created no second stock movement',
    (SELECT COUNT(*) FROM public.stock_movements)=_s+1, 'stock +1');

  INSERT INTO fx VALUES ('idem_req', _r::text);
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('D22 same key with a different payload is a conflict',
    'PURCHASE_IDEMPOTENCY_CONFLICT',
    format('SELECT pg_temp.buy(%L::uuid, 9, 1000, NULL, NULL, false, NULL, ''C3-KEY-1'')',
           (SELECT v FROM fx WHERE k='idem_req')));
END $$;

-- D23 different key, same request -> only the remaining quantity is taken
DO $$
DECLARE _r uuid; res jsonb;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := (SELECT v FROM fx WHERE k='idem_req')::uuid;   -- 10 requested, 4 supplied
  res := pg_temp.buy(_r, 10, 1000, NULL, NULL, false, NULL, 'C3-KEY-2');
  INSERT INTO t(name,passed,detail)
   VALUES ('D23 different key on the same request allocates only the remaining 6',
           (res->'request'->>'allocated_quantity')::numeric=6
           AND (res->'request'->>'remaining_quantity')::numeric=0,
           'allocated='||(res->'request'->>'allocated_quantity'));
END $$;

-- =============================================================================
-- 24-27  Atomicity
-- =============================================================================
DO $$
DECLARE _r uuid; _p0 int; _i0 int; _f0 int; _s0 int; _st0 text; _st1 text;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  SELECT status INTO _st0 FROM public.purchase_requests WHERE id=_r;
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  SELECT COUNT(*) INTO _i0 FROM public.purchase_items;
  SELECT COUNT(*) INTO _f0 FROM public.purchase_request_fulfillments;
  SELECT COUNT(*) INTO _s0 FROM public.stock_movements;

  BEGIN
    PERFORM pg_temp.buy(_r, 5, 1000, NULL, NULL, false, NULL, 'C3-KEY-RB');
    RAISE EXCEPTION 'forced failure after success';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT status INTO _st1 FROM public.purchase_requests WHERE id=_r;

  INSERT INTO t(name,passed,detail) VALUES
   ('D24 a failure rolls back purchase, item, fulfillment and stock together',
    (SELECT COUNT(*) FROM public.purchases)=_p0
    AND (SELECT COUNT(*) FROM public.purchase_items)=_i0
    AND (SELECT COUNT(*) FROM public.purchase_request_fulfillments)=_f0
    AND (SELECT COUNT(*) FROM public.stock_movements)=_s0,
    'all four counts unchanged'),
   ('D25 the request status did not move on failure', _st1=_st0, _st0||' -> '||_st1),
   ('D26 no orphan idempotency key survived',
    (SELECT COUNT(*) FROM public.purchase_idempotency WHERE idempotency_key='C3-KEY-RB')=0, 'rows=0');
END $$;

-- D27 allocation can never exceed the line quantity (C1 trigger still guards)
DO $$
DECLARE _r uuid;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(20);
  PERFORM pg_temp.expect_fail('D27 allocation greater than the purchased line is refused',
    'INVALID_ALLOCATION',
    format('SELECT pg_temp.buy(%L::uuid, 3, 1000, NULL, 5)', _r));
END $$;

-- =============================================================================
-- 28-30  Standalone path unchanged + summary correctness
-- =============================================================================
DO $$
DECLARE res jsonb; _f0 int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _f0 FROM public.purchase_request_fulfillments;
  res := public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid, (SELECT v FROM fx WHERE k='term')::uuid,
    5000, 'toman', 2, CURRENT_DATE, NULL, NULL, NULL, 'standalone',
    NULL, NULL, false, NULL, NULL);
  INSERT INTO t(name,passed,detail)
   VALUES ('D28 standalone purchase (request_id NULL) still works and creates no fulfillment',
           (res->>'created')::boolean AND res->'request' = 'null'::jsonb
           AND (SELECT COUNT(*) FROM public.purchase_request_fulfillments)=_f0,
           'request field='||COALESCE(res->>'request','null'));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('D29 allocation arguments without a request are refused',
    'PURCHASE_ALLOCATION_WITHOUT_REQUEST',
    'SELECT public.create_purchase((SELECT v FROM fx WHERE k=''product'')::uuid,
       (SELECT v FROM fx WHERE k=''term'')::uuid, 1000, ''toman'', 1, CURRENT_DATE,
       NULL, NULL, NULL, NULL, NULL, 5, false, NULL, NULL)');
END $$;

-- D30 the request view agrees with the RPC result
DO $$
DECLARE _r uuid; res jsonb; v record;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  res := pg_temp.buy(_r, 4);
  SELECT * INTO v FROM public.v_purchase_request_fulfillment WHERE purchase_request_id=_r;
  INSERT INTO t(name,passed,detail)
   VALUES ('D30 v_purchase_request_fulfillment matches the RPC result',
           v.allocated_quantity=4 AND v.remaining_quantity=6
           AND v.effective_supplied=4 AND v.fulfillment_state='partial'
           AND v.purchase_count=1,
           'allocated='||v.allocated_quantity||' remaining='||v.remaining_quantity
           ||' state='||v.fulfillment_state||' purchases='||v.purchase_count);
END $$;

-- D31 final_price is derived from real purchases, not left NULL
DO $$
DECLARE _r uuid; _fp numeric;
BEGIN
  PERFORM pg_temp.act('admin');
  _r := pg_temp.new_request(10);
  PERFORM pg_temp.buy(_r, 4, 2500);            -- 4 * 2500 = 10000
  PERFORM pg_temp.buy(_r, 6, 3000);            -- 6 * 3000 = 18000
  SELECT final_price INTO _fp FROM public.purchase_requests WHERE id=_r;
  INSERT INTO t(name,passed,detail)
   VALUES ('D31 final_price recomputed from real purchases across both stages (28000)',
           _fp=28000, 'final_price='||COALESCE(_fp::text,'NULL'));
END $$;

-- D32 no purchase left without a line, anywhere
DO $$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.purchases p
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_items i WHERE i.purchase_id=p.id);
  INSERT INTO t(name,passed,detail)
   VALUES ('D32 no purchase exists without its line', _n=0, 'orphans='||_n);
END $$;

-- D33 total allocations never exceed the line quantity, anywhere
DO $$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.v_purchase_item_allocation
   WHERE allocated_quantity > purchased_quantity;
  INSERT INTO t(name,passed,detail)
   VALUES ('D33 no line is over-allocated beyond what was purchased', _n=0, 'violations='||_n);
END $$;

\echo ''
\echo '================ C3.2 REQUEST-LINK TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total FROM t;

ROLLBACK;
