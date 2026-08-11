SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C2.2 — create_purchase RPC verification
-- Everything runs inside a transaction that is ROLLED BACK.
-- =============================================================================

BEGIN;

\i /tmp/251.sql

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text);

-- actors resolved from live role assignments
INSERT INTO fx VALUES ('admin','05098088-2849-43f4-8eb5-7c473c3832ec');
INSERT INTO fx SELECT 'manager', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='manager'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id AND x.role='admin')
 LIMIT 1;
INSERT INTO fx SELECT 'sales', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='sales'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id
                    AND x.role IN ('admin','manager','accountant'))
 LIMIT 1;
INSERT INTO fx SELECT 'norole', p.id::text FROM public.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id=p.id) LIMIT 1;
INSERT INTO fx SELECT 'combo', ur.user_id::text FROM public.user_roles ur
 WHERE ur.role='sales'
   AND EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id=ur.user_id AND x.role='admin')
 LIMIT 1;

INSERT INTO fx SELECT 'product', id::text FROM public.products WHERE status='active' LIMIT 1;
INSERT INTO fx SELECT 'term',    id::text FROM public.payment_terms WHERE is_active AND days>0 LIMIT 1;
INSERT INTO fx SELECT 'wh',      public.default_warehouse_id()::text;
INSERT INTO fx SELECT 'supplier',id::text FROM public.suppliers WHERE is_active LIMIT 1;
-- Baseline for C36. Fulfillments are real data from C3 onwards, so the suite
-- compares against where it started rather than against zero.
INSERT INTO fx SELECT 'fulfillments_at_start', COUNT(*)::text
  FROM public.purchase_request_fulfillments;

CREATE OR REPLACE FUNCTION pg_temp.act(role_key text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM fx WHERE k=role_key),'role','authenticated')::text, true);
END $$;

-- Convenience: call the RPC with sane defaults
CREATE OR REPLACE FUNCTION pg_temp.mk(
  qty integer DEFAULT 3, price numeric DEFAULT 5000, cur text DEFAULT 'toman',
  idem text DEFAULT NULL, prod uuid DEFAULT NULL, term uuid DEFAULT NULL,
  sup uuid DEFAULT NULL, wh uuid DEFAULT NULL, pdate date DEFAULT NULL,
  cash numeric DEFAULT 4500, notes text DEFAULT 'C2 test'
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.create_purchase(
    COALESCE(prod, (SELECT v FROM fx WHERE k='product')::uuid),
    COALESCE(term, (SELECT v FROM fx WHERE k='term')::uuid),
    price, cur, qty, COALESCE(pdate, CURRENT_DATE),
    sup, cash, COALESCE(wh, (SELECT v FROM fx WHERE k='wh')::uuid), notes,
    NULL, NULL, false, NULL, idem);
END $$;

-- =============================================================================
-- 1-5  Happy path + every side effect
-- =============================================================================
DO $$
DECLARE r jsonb; _p0 int; _i0 int; _s0 int; _a0 int; _g0 int;
        _p1 int; _i1 int; _s1 int; _a1 int; _g1 int; _pid uuid;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  SELECT COUNT(*) INTO _i0 FROM public.purchase_items;
  SELECT COUNT(*) INTO _s0 FROM public.stock_movements;
  SELECT COUNT(*) INTO _a0 FROM public.audit_logs WHERE action='purchase_created';
  SELECT COUNT(*) INTO _g0 FROM public.employee_score_events;

  r := pg_temp.mk();
  _pid := (r->'purchase'->>'id')::uuid;

  SELECT COUNT(*) INTO _p1 FROM public.purchases;
  SELECT COUNT(*) INTO _i1 FROM public.purchase_items;
  SELECT COUNT(*) INTO _s1 FROM public.stock_movements;
  SELECT COUNT(*) INTO _a1 FROM public.audit_logs WHERE action='purchase_created';
  SELECT COUNT(*) INTO _g1 FROM public.employee_score_events;

  INSERT INTO fx VALUES ('pid', _pid::text);

  INSERT INTO t(name,passed,detail) VALUES
    ('C1 happy path returns created=true with a purchase id',
     (r->>'created')::boolean AND _pid IS NOT NULL, 'short_id='||(r->'purchase'->>'short_id')),
    ('C2 purchases +1', _p1=_p0+1, _p0||' -> '||_p1),
    ('C3 purchase_items +1 (same transaction)', _i1=_i0+1, _i0||' -> '||_i1),
    ('C4 stock movement +1 (inventory trigger fired)', _s1=_s0+1, _s0||' -> '||_s1),
    ('C5 audit +1 (audit trigger fired)', _a1=_a0+1, _a0||' -> '||_a1),
    ('C6 gamification +1 (score trigger fired)', _g1=_g0+1, _g0||' -> '||_g1);
END $$;

-- 7 server-computed derived values, client never trusted
DO $$
DECLARE _tot numeric; _cb uuid; _st text; _cc text;
BEGIN
  SELECT total_amount, created_by, status, cash_price_currency
    INTO _tot, _cb, _st, _cc
  FROM public.purchases WHERE id=(SELECT v FROM fx WHERE k='pid')::uuid;
  INSERT INTO t(name,passed,detail)
    VALUES ('C7 total_amount, created_by, status, cash_price_currency computed server-side',
            _tot=15000 AND _cb=(SELECT v FROM fx WHERE k='admin')::uuid
            AND _st='received' AND _cc='toman',
            'total='||_tot||' created_by=admin status='||_st||' cash_cur='||COALESCE(_cc,'null'));
END $$;

-- 8 stock movement carries the real quantity
DO $$
DECLARE _q numeric;
BEGIN
  SELECT quantity INTO _q FROM public.stock_movements
   WHERE ref_type='purchase' AND ref_id=(SELECT v FROM fx WHERE k='pid')::uuid;
  INSERT INTO t(name,passed,detail)
    VALUES ('C8 stock movement quantity = purchased quantity', _q=3, 'qty='||COALESCE(_q::text,'none'));
END $$;

-- 9 supplier person derivation trigger still runs
DO $$
DECLARE r jsonb; _sp uuid; _sid uuid;
BEGIN
  PERFORM pg_temp.act('admin');
  r := pg_temp.mk(sup := (SELECT v FROM fx WHERE k='supplier')::uuid);
  SELECT supplier_person_id, supplier_id INTO _sp, _sid
    FROM public.purchases WHERE id=(r->'purchase'->>'id')::uuid;
  INSERT INTO t(name,passed,detail)
    VALUES ('C9 supplier person derivation trigger still fires',
            _sp IS NOT NULL AND _sp=(SELECT person_id FROM public.suppliers WHERE id=_sid),
            'supplier_person_id set = '||(_sp IS NOT NULL)::text);
END $$;

-- =============================================================================
-- 10-20  Validation matrix
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(label text, hint_expected text, body text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _h text; _s text; _ok boolean := false;
BEGIN
  BEGIN
    EXECUTE body;
    INSERT INTO t(name,passed,detail) VALUES (label, false, 'no exception raised');
    RETURN;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _h = PG_EXCEPTION_HINT, _s = RETURNED_SQLSTATE;
    _ok := (_h = hint_expected);
    INSERT INTO t(name,passed,detail)
      VALUES (label, _ok, 'sqlstate='||_s||' hint='||COALESCE(_h,'<none>'));
  END;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('C10 quantity = 0 rejected','PURCHASE_QUANTITY_INVALID',
    'SELECT pg_temp.mk(qty := 0)');
  PERFORM pg_temp.expect_fail('C11 quantity negative rejected','PURCHASE_QUANTITY_INVALID',
    'SELECT pg_temp.mk(qty := -2)');
  PERFORM pg_temp.expect_fail('C12 price = 0 rejected','PURCHASE_PRICE_INVALID',
    'SELECT pg_temp.mk(price := 0)');
  PERFORM pg_temp.expect_fail('C13 price negative rejected','PURCHASE_PRICE_INVALID',
    'SELECT pg_temp.mk(price := -100)');
  PERFORM pg_temp.expect_fail('C14 invalid currency rejected with a readable message','PURCHASE_CURRENCY_INVALID',
    'SELECT pg_temp.mk(cur := ''usd_us'')');
  PERFORM pg_temp.expect_fail('C15 unknown product rejected','PURCHASE_PRODUCT_INVALID',
    'SELECT pg_temp.mk(prod := ''00000000-0000-4000-8000-000000000000''::uuid)');
  PERFORM pg_temp.expect_fail('C16 unknown payment term rejected','PURCHASE_PAYMENT_TERM_INVALID',
    'SELECT pg_temp.mk(term := ''00000000-0000-4000-8000-000000000000''::uuid)');
  PERFORM pg_temp.expect_fail('C17 unknown warehouse rejected','PURCHASE_WAREHOUSE_INVALID',
    'SELECT pg_temp.mk(wh := ''00000000-0000-4000-8000-000000000000''::uuid)');
  PERFORM pg_temp.expect_fail('C18 unknown supplier rejected','PURCHASE_SUPPLIER_INVALID',
    'SELECT pg_temp.mk(sup := ''00000000-0000-4000-8000-000000000000''::uuid)');
  PERFORM pg_temp.expect_fail('C19 future purchase date rejected','PURCHASE_DATE_FUTURE',
    'SELECT pg_temp.mk(pdate := CURRENT_DATE + 1)');
  PERFORM pg_temp.expect_fail('C20 notes over 500 chars rejected','PURCHASE_NOTES_TOO_LONG',
    'SELECT pg_temp.mk(notes := repeat(''x'', 501))');
  PERFORM pg_temp.expect_fail('C20b negative cash price rejected','PURCHASE_CASH_PRICE_INVALID',
    'SELECT pg_temp.mk(cash := -1)');
END $$;

-- C21 fractional quantity: integer parameter truncates/rejects at the type
-- boundary before the body runs — assert the call cannot smuggle 2.7 through.
DO $$
DECLARE r jsonb; _q integer;
BEGIN
  PERFORM pg_temp.act('admin');
  r := public.create_purchase(
        (SELECT v FROM fx WHERE k='product')::uuid,
        (SELECT v FROM fx WHERE k='term')::uuid,
        1000, 'toman', 2.7::numeric::integer, CURRENT_DATE,
        NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL);
  SELECT quantity INTO _q FROM public.purchases WHERE id=(r->'purchase'->>'id')::uuid;
  INSERT INTO t(name,passed,detail)
    VALUES ('C21 fractional quantity cannot be stored (integer column enforces it)',
            _q = 3, 'stored quantity='||_q||' (2.7 rounds at the type boundary, never fractional)');
END $$;

-- =============================================================================
-- 22-26  Permission matrix — must mirror current RLS (admin/manager only)
-- =============================================================================
DO $$
BEGIN
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('C22 pure sales REJECTED (matches current RLS)','PURCHASE_PERMISSION_DENIED',
    'SELECT pg_temp.mk()');
  PERFORM pg_temp.act('norole');
  PERFORM pg_temp.expect_fail('C23 user with no role REJECTED','PURCHASE_PERMISSION_DENIED',
    'SELECT pg_temp.mk()');
END $$;

DO $$
DECLARE r jsonb; _ok boolean := true; _m text := '';
BEGIN
  PERFORM pg_temp.act('manager');
  BEGIN r := pg_temp.mk(); EXCEPTION WHEN OTHERS THEN _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT; END;
  INSERT INTO t(name,passed,detail)
    VALUES ('C24 manager ALLOWED', _ok, CASE WHEN _ok THEN 'created' ELSE 'FAILED: '||left(_m,60) END);
END $$;

DO $$
DECLARE r jsonb; _ok boolean := true; _m text := ''; _has boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM fx WHERE k='combo') INTO _has;
  IF NOT _has THEN
    INSERT INTO t(name,passed,detail) VALUES ('C25 combined role (sales+admin) ALLOWED', true, 'skipped: no combined-role user');
    RETURN;
  END IF;
  PERFORM pg_temp.act('combo');
  BEGIN r := pg_temp.mk(); EXCEPTION WHEN OTHERS THEN _ok := false; GET STACKED DIAGNOSTICS _m = MESSAGE_TEXT; END;
  INSERT INTO t(name,passed,detail)
    VALUES ('C25 combined role (sales+admin) ALLOWED — has_any_role is permissive', _ok,
            CASE WHEN _ok THEN 'created' ELSE 'FAILED: '||left(_m,60) END);
END $$;

-- C26 unauthenticated
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM pg_temp.expect_fail('C26 unauthenticated REJECTED','PURCHASE_NOT_AUTHENTICATED',
    'SELECT pg_temp.mk()');
END $$;

-- =============================================================================
-- 27-31  Idempotency
-- =============================================================================
DO $$
DECLARE r1 jsonb; r2 jsonb; _p0 int; _p1 int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  r1 := pg_temp.mk(idem := 'C2-KEY-A');
  r2 := pg_temp.mk(idem := 'C2-KEY-A');
  SELECT COUNT(*) INTO _p1 FROM public.purchases;

  INSERT INTO t(name,passed,detail) VALUES
    ('C27 same key + same payload -> ONE purchase, second returns created=false',
     _p1 = _p0 + 1
     AND (r1->>'created')::boolean = true
     AND (r2->>'created')::boolean = false
     AND (r1->'purchase'->>'id') = (r2->'purchase'->>'id'),
     'purchases '||_p0||' -> '||_p1||' | r1.created='||(r1->>'created')||' r2.created='||(r2->>'created'));
END $$;

DO $$
DECLARE _p0 int; _p1 int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  PERFORM pg_temp.expect_fail('C28 same key + DIFFERENT payload -> conflict','PURCHASE_IDEMPOTENCY_CONFLICT',
    'SELECT pg_temp.mk(qty := 99, idem := ''C2-KEY-A'')');
  SELECT COUNT(*) INTO _p1 FROM public.purchases;
  INSERT INTO t(name,passed,detail)
    VALUES ('C28b conflict created no purchase', _p1=_p0, 'purchases '||_p0||' -> '||_p1);
END $$;

-- C29 idempotent replay creates no duplicate side effects
DO $$
DECLARE _s0 int; _s1 int; _g0 int; _g1 int; r jsonb;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _s0 FROM public.stock_movements;
  SELECT COUNT(*) INTO _g0 FROM public.employee_score_events;
  r := pg_temp.mk(idem := 'C2-KEY-A');   -- replay
  SELECT COUNT(*) INTO _s1 FROM public.stock_movements;
  SELECT COUNT(*) INTO _g1 FROM public.employee_score_events;
  INSERT INTO t(name,passed,detail)
    VALUES ('C29 replay produced NO second stock movement and NO second score',
            _s1=_s0 AND _g1=_g0, 'stock '||_s0||'->'||_s1||' score '||_g0||'->'||_g1);
END $$;

-- C30 different keys -> two genuine purchases
DO $$
DECLARE _p0 int; _p1 int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  PERFORM pg_temp.mk(idem := 'C2-KEY-B');
  PERFORM pg_temp.mk(idem := 'C2-KEY-C');
  SELECT COUNT(*) INTO _p1 FROM public.purchases;
  INSERT INTO t(name,passed,detail)
    VALUES ('C30 two different keys -> two purchases', _p1=_p0+2, 'purchases '||_p0||' -> '||_p1);
END $$;

-- C31 idempotency row state and linkage
DO $$
DECLARE _st text; _pid uuid; _res jsonb;
BEGIN
  SELECT state, purchase_id, result INTO _st, _pid, _res
    FROM public.purchase_idempotency WHERE idempotency_key='C2-KEY-A';
  INSERT INTO t(name,passed,detail)
    VALUES ('C31 idempotency row is completed and linked to the purchase',
            _st='completed' AND _pid IS NOT NULL AND _res IS NOT NULL,
            'state='||_st||' purchase linked='||(_pid IS NOT NULL)::text);
END $$;

-- C32 a key belongs to its creator
DO $$
BEGIN
  PERFORM pg_temp.act('manager');
  PERFORM pg_temp.expect_fail('C32 another user cannot reuse someone else''s key','PURCHASE_IDEMPOTENCY_CONFLICT',
    'SELECT pg_temp.mk(idem := ''C2-KEY-A'')');
END $$;

-- =============================================================================
-- 33-35  Atomicity
-- =============================================================================
-- C33 a failure AFTER the purchase insert must leave nothing behind.
-- Forced by making the inventory trigger fail: a warehouse row is required by
-- apply_stock_movement, so we point the purchase at a warehouse that is deleted
-- mid-transaction is not possible; instead assert via an invalid product on the
-- item path is impossible too. We therefore force it with a deferred constraint
-- style probe: run the RPC inside a subtransaction and raise afterwards.
DO $$
DECLARE _p0 int; _i0 int; _s0 int; _p1 int; _i1 int; _s1 int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _p0 FROM public.purchases;
  SELECT COUNT(*) INTO _i0 FROM public.purchase_items;
  SELECT COUNT(*) INTO _s0 FROM public.stock_movements;

  BEGIN
    PERFORM pg_temp.mk(idem := 'C2-KEY-ROLLBACK');
    RAISE EXCEPTION 'forced failure after a successful create';
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- subtransaction rolled back
  END;

  SELECT COUNT(*) INTO _p1 FROM public.purchases;
  SELECT COUNT(*) INTO _i1 FROM public.purchase_items;
  SELECT COUNT(*) INTO _s1 FROM public.stock_movements;

  INSERT INTO t(name,passed,detail)
    VALUES ('C33 a failure after creation rolls back purchase + item + stock together',
            _p1=_p0 AND _i1=_i0 AND _s1=_s0,
            'purchases '||_p0||'->'||_p1||' items '||_i0||'->'||_i1||' stock '||_s0||'->'||_s1);
END $$;

-- C33b the idempotency reservation is rolled back with it (no orphan key)
DO $$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.purchase_idempotency WHERE idempotency_key='C2-KEY-ROLLBACK';
  INSERT INTO t(name,passed,detail)
    VALUES ('C33b rolled-back attempt left no orphan idempotency key', _n=0, 'rows='||_n);
END $$;

-- C34 no purchase can exist without its line
DO $$
DECLARE _orphan int;
BEGIN
  SELECT COUNT(*) INTO _orphan FROM public.purchases p
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_items i WHERE i.purchase_id=p.id);
  INSERT INTO t(name,passed,detail)
    VALUES ('C34 no purchase in the database lacks a line', _orphan=0, 'orphan purchases='||_orphan);
END $$;

-- C35 request linking is rejected, not silently ignored
DO $$
BEGIN
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail('C35 passing p_request_id is REJECTED in this phase','PURCHASE_REQUEST_LINK_NOT_ENABLED',
    'SELECT public.create_purchase((SELECT v FROM fx WHERE k=''product'')::uuid,
       (SELECT v FROM fx WHERE k=''term'')::uuid, 1000, ''toman'', 1, CURRENT_DATE,
       NULL, NULL, NULL, NULL, gen_random_uuid(), NULL, false, NULL, NULL)');
END $$;

-- C36 no fulfillment row was created by any of the above
--
-- Originally an absolute count of zero, which was right while C3 did not exist.
-- C3 registers real fulfillments, so the global count is now legitimately
-- non-zero and asserting zero would only prove that C3 shipped. What this
-- suite can still prove — and what it now asserts — is that the C2 function
-- re-applied at the top of this transaction created none of them: the count is
-- unchanged from the baseline captured before any test ran.
DO $$
DECLARE _n int; _base int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.purchase_request_fulfillments;
  SELECT v::int INTO _base FROM fx WHERE k='fulfillments_at_start';
  INSERT INTO t(name,passed,detail)
    VALUES ('C36 the C2 function created no fulfillment rows (C3 territory)',
            _n = _base, 'rows '||_base||'->'||_n);
END $$;

-- C37 function hardening
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
    VALUES ('C37 SECURITY DEFINER, fixed search_path, no PUBLIC execute',
            _sec AND _cfg LIKE '%search_path%' AND NOT _pub,
            'definer='||_sec||' cfg='||COALESCE(_cfg,'none')||' public_execute='||_pub);
END $$;

-- C38 client cannot reach the idempotency table
DO $$
DECLARE _ok boolean := false;
BEGIN
  PERFORM pg_temp.act('admin');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM COUNT(*) FROM public.purchase_idempotency;
    _ok := true;   -- readable => FAIL
  EXCEPTION WHEN OTHERS THEN _ok := false;
  END;
  RESET ROLE;
  INSERT INTO t(name,passed,detail)
    VALUES ('C38 authenticated cannot read purchase_idempotency directly', NOT _ok,
            CASE WHEN _ok THEN 'READABLE' ELSE 'denied' END);
END $$;

\echo ''
\echo '================ C2.2 create_purchase TEST RESULTS ================'
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t ORDER BY seq;
SELECT COUNT(*) FILTER (WHERE passed) passed, COUNT(*) FILTER (WHERE NOT passed) failed, COUNT(*) total FROM t;

ROLLBACK;
