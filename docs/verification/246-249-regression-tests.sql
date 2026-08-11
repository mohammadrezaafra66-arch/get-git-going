SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C1 — REGRESSION suite
--
-- C1 adds objects but activates nothing. This suite proves the existing
-- purchase and purchase-request flows behave exactly as they did before, by
-- reproducing the CURRENT client-side path (the two inserts issued by
-- PurchaseForm.tsx:196-228) and the CURRENT status RPC, then checking that
-- every existing side effect still fires.
--
-- Runs inside a transaction that is ROLLED BACK.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v uuid);

-- =============================================================================
-- R1 — the CURRENT purchase creation path still works unchanged
--      (exactly the two inserts the browser performs today)
-- =============================================================================
DO $r1$
DECLARE _prod uuid; _term uuid; _user uuid; _wh uuid; _pur uuid; _it uuid;
        _stock_before int; _stock_after int;
        _audit_before int; _audit_after int;
        _score_before int; _score_after int;
BEGIN
  SELECT id INTO _prod FROM public.products WHERE status='active' LIMIT 1;
  SELECT id INTO _term FROM public.payment_terms WHERE is_active AND days > 0 LIMIT 1;
  SELECT id INTO _user FROM public.profiles WHERE is_active LIMIT 1;
  SELECT public.default_warehouse_id() INTO _wh;

  SELECT COUNT(*) INTO _stock_before FROM public.stock_movements;
  SELECT COUNT(*) INTO _audit_before FROM public.audit_logs WHERE action='purchase_created';
  SELECT COUNT(*) INTO _score_before FROM public.employee_score_events;

  -- Step 1 — exactly PurchaseForm's first insert
  INSERT INTO public.purchases (
    product_id, supplier_id, payment_term_id, purchase_price, currency,
    cash_price, cash_price_currency, quantity, purchase_date, notes,
    created_by, total_amount, status, warehouse_id)
  VALUES (_prod, NULL, _term, 5000, 'toman', 4500, 'toman', 3, CURRENT_DATE,
          'regression C1', _user, 15000, 'received', _wh)
  RETURNING id INTO _pur;

  -- Step 2 — exactly PurchaseForm's second insert
  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price, line_total)
  VALUES (_pur, _prod, 3, 5000, 15000)
  RETURNING id INTO _it;

  SELECT COUNT(*) INTO _stock_after FROM public.stock_movements;
  SELECT COUNT(*) INTO _audit_after FROM public.audit_logs WHERE action='purchase_created';
  SELECT COUNT(*) INTO _score_after FROM public.employee_score_events;

  INSERT INTO fx VALUES ('pur',_pur),('it',_it),('prod',_prod),('user',_user);

  INSERT INTO t(name,passed,detail)
    VALUES ('R1 current purchase path: purchase + item created',
            _pur IS NOT NULL AND _it IS NOT NULL, 'purchase and item inserted');

  INSERT INTO t(name,passed,detail)
    VALUES ('R2 stock movement trigger still fires',
            _stock_after = _stock_before + 1,
            'stock_movements '||_stock_before||' -> '||_stock_after);

  INSERT INTO t(name,passed,detail)
    VALUES ('R3 purchase audit trigger still fires',
            _audit_after = _audit_before + 1,
            'purchase_created audit '||_audit_before||' -> '||_audit_after);

  INSERT INTO t(name,passed,detail)
    VALUES ('R4 gamification scoring trigger still fires',
            _score_after = _score_before + 1,
            'employee_score_events '||_score_before||' -> '||_score_after);
END $r1$;

-- R5 — the stock movement points at the right product/warehouse/quantity
DO $r5$
DECLARE _q numeric; _rt text;
BEGIN
  SELECT sm.quantity, sm.ref_type INTO _q, _rt
  FROM public.stock_movements sm
  WHERE sm.ref_type='purchase' AND sm.ref_id=(SELECT v FROM fx WHERE k='pur');
  INSERT INTO t(name,passed,detail)
    VALUES ('R5 stock movement records the REAL purchased quantity (3)',
            _q=3 AND _rt='purchase', 'quantity='||COALESCE(_q::text,'<none>')||' ref_type='||COALESCE(_rt,'<none>'));
END $r5$;

-- R6 — supplier person derivation trigger untouched
DO $r6$
DECLARE _has boolean;
BEGIN
  SELECT (supplier_person_id IS NULL) INTO _has FROM public.purchases WHERE id=(SELECT v FROM fx WHERE k='pur');
  INSERT INTO t(name,passed,detail)
    VALUES ('R6 supplier person derivation unchanged (NULL supplier -> NULL person)',
            _has, 'supplier_person_id is null = '||_has);
END $r6$;

-- =============================================================================
-- R7 — the CURRENT status RPC still works, including the legacy-flagged row
-- =============================================================================
DO $r7$
DECLARE _req uuid; _prod uuid; _admin uuid; _status text; _hist int; _notif int;
BEGIN
  SELECT v INTO _prod FROM fx WHERE k='prod';
  _admin := '05098088-2849-43f4-8eb5-7c473c3832ec';

  INSERT INTO public.purchase_requests (product_id, quantity, unit, requested_by, assigned_to, status)
  VALUES (_prod, 4, 'عدد', _admin, _admin, 'pending') RETURNING id INTO _req;

  SELECT COUNT(*) INTO _hist  FROM public.purchase_request_status_history WHERE request_id=_req;
  SELECT COUNT(*) INTO _notif FROM public.notification_events WHERE event_type='purchase_status_changed';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_admin,'role','authenticated')::text, true);

  PERFORM public.update_purchase_status(_req, 'approved', 'regression C1', NULL);

  SELECT status INTO _status FROM public.purchase_requests WHERE id=_req;

  INSERT INTO t(name,passed,detail)
    VALUES ('R7 update_purchase_status still advances a request', _status='approved', 'status='||_status);

  INSERT INTO t(name,passed,detail)
    VALUES ('R7b status history still written',
            (SELECT COUNT(*) FROM public.purchase_request_status_history WHERE request_id=_req) = _hist + 1,
            'history rows +'||((SELECT COUNT(*) FROM public.purchase_request_status_history WHERE request_id=_req) - _hist));

  INSERT INTO t(name,passed,detail)
    VALUES ('R7c status-change notification still written',
            (SELECT COUNT(*) FROM public.notification_events WHERE event_type='purchase_status_changed') > _notif,
            'notification_events increased');

  -- R7d: manual 'purchased' USED to be permitted, and this test asserted that
  -- on purpose so C1 could prove it had not changed the flow. The comment here
  -- said the guard would ship in C4; it shipped in C5 instead, and the
  -- assertion is inverted accordingly. A hand-set `purchased` — with or without
  -- a typed final price — is now refused for everyone, including an admin.
  DECLARE _hint text; _refused boolean := false;
  BEGIN
    BEGIN
      PERFORM public.update_purchase_status(_req, 'purchased', 'regression C1', 12345);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _hint = PG_EXCEPTION_HINT;
      _refused := _hint IN ('PURCHASE_STATUS_DERIVED','PURCHASE_FINAL_PRICE_DERIVED');
    END;
    SELECT status INTO _status FROM public.purchase_requests WHERE id=_req;
    INSERT INTO t(name,passed,detail)
      VALUES ('R7d manual "purchased" is refused (the C5 derived-status lock)',
              _refused AND _status <> 'purchased',
              'hint='||COALESCE(_hint,'<none>')||' status='||_status);
  END;
  INSERT INTO fx VALUES ('req',_req);
END $r7$;

-- =============================================================================
-- R8 — the request list RPC still returns the same shape and correct counts
-- =============================================================================
DO $r8$
DECLARE _n int; _rc bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','05098088-2849-43f4-8eb5-7c473c3832ec','role','authenticated')::text, true);
  SELECT COUNT(*) INTO _n FROM public.get_purchase_requests(NULL,NULL,200,0);
  SELECT receipt_count INTO _rc FROM public.get_purchase_requests(NULL,NULL,200,0)
   WHERE id=(SELECT v FROM fx WHERE k='req');
  INSERT INTO t(name,passed,detail)
    VALUES ('R8 get_purchase_requests still returns rows with correct receipt_count',
            _n > 0 AND COALESCE(_rc,0)=0, 'rows='||_n||' receipt_count='||COALESCE(_rc::text,'<null>'));
END $r8$;

-- =============================================================================
-- R9 — creating a purchase request still works end to end
-- =============================================================================
-- C4 widened this RPC's return from uuid to jsonb so the caller can see WHO the
-- request was assigned to and why. The old `INTO _new uuid` therefore fails on
-- a cast, which is the contract change working, not a regression. What this
-- test still guards is that creating a request from the C1 fixtures works end
-- to end; it now also records the assignment source, because "it returned
-- something" stopped being a useful assertion the moment the shape changed.
DO $r9$
DECLARE _prod uuid; _res jsonb; _ok boolean := true; _m text := '';
BEGIN
  SELECT v INTO _prod FROM fx WHERE k='prod';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','05098088-2849-43f4-8eb5-7c473c3832ec','role','authenticated')::text, true);
  BEGIN
    SELECT public.create_purchase_request(_prod, 2, 'عدد', NULL, 'regression C1', 1000) INTO _res;
  EXCEPTION WHEN OTHERS THEN
    _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT;
  END;
  INSERT INTO t(name,passed,detail)
    VALUES ('R9 create_purchase_request still works end to end',
            _ok AND (_res->>'request_id') IS NOT NULL
                AND (_res->>'assignment_source') IS NOT NULL,
            CASE WHEN _ok THEN 'created, source='||COALESCE(_res->>'assignment_source','<none>')
                 ELSE 'FAILED: '||left(_m,70) END);
END $r9$;

-- =============================================================================
-- R10 — existing data was not modified by C1
-- =============================================================================
DO $r10$
DECLARE _p int; _a int; _c int; _d int; _x int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status='pending' AND created_at < CURRENT_DATE),
         COUNT(*) FILTER (WHERE status='approved' AND created_at < CURRENT_DATE),
         COUNT(*) FILTER (WHERE status='cancelled' AND created_at < CURRENT_DATE),
         COUNT(*) FILTER (WHERE status='delivered' AND created_at < CURRENT_DATE),
         COUNT(*) FILTER (WHERE status='purchased' AND created_at < CURRENT_DATE)
    INTO _p,_a,_c,_d,_x
  FROM public.purchase_requests;
  INSERT INTO t(name,passed,detail)
    VALUES ('R10 pre-existing requests keep their original statuses',
            _p=0 AND _a=3 AND _c=1 AND _d=1 AND _x=0,
            'pending='||_p||' approved='||_a||' cancelled='||_c||' delivered='||_d||' purchased='||_x);
END $r10$;

-- =============================================================================
-- R11 — the new table stayed empty throughout: C1 activates nothing
-- =============================================================================
-- The invariant changed with C2 and this test changed with it.
--
-- In C1 nothing was activated, so both new tables had to stay empty. C2 turns
-- purchase_idempotency into a live table written by create_purchase, so a
-- non-zero count there is now correct and expected.
--
-- C3 changed it again: request linking is now live, so a global fulfillment
-- count of zero is no longer the invariant either.
--
-- What must STILL hold, and is what this test now asserts: the legacy
-- direct-insert path exercised above (R1) goes around the RPC entirely, so it
-- writes NEITHER an idempotency row NOR a fulfillment row. Only
-- create_purchase may produce those.
DO $r11$
DECLARE _f_before int; _f_after int; _i_before int; _i_after int;
BEGIN
  SELECT COUNT(*) INTO _f_before FROM public.purchase_request_fulfillments;
  SELECT COUNT(*) INTO _i_before FROM public.purchase_idempotency;

  -- repeat the legacy two-insert path once more inside this transaction
  INSERT INTO public.purchases (product_id, payment_term_id, purchase_price, currency,
                                quantity, purchase_date, total_amount, status, created_by)
  SELECT (SELECT v FROM fx WHERE k='prod'),
         (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
         100, 'toman', 1, CURRENT_DATE, 100, 'received', (SELECT v FROM fx WHERE k='user');

  SELECT COUNT(*) INTO _f_after FROM public.purchase_request_fulfillments;
  SELECT COUNT(*) INTO _i_after FROM public.purchase_idempotency;

  INSERT INTO t(name,passed,detail)
    VALUES ('R11 the legacy insert path writes neither an idempotency nor a fulfillment row',
            _i_after=_i_before AND _f_after=_f_before,
            'fulfillments '||_f_before||'->'||_f_after
            ||' idempotency '||_i_before||'->'||_i_after
            ||' (non-zero absolute counts are expected from C2/C3 — the RPC owns both tables)');
END $r11$;

\echo ''
\echo '================ C1 REGRESSION RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total FROM t;

ROLLBACK;
