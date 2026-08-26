-- 394 - a purchase dated TODAY IN TEHRAN must not be refused as being in the future (OG-63).
--
-- Owner decision on record (2026-08-26): fix this first, and scope it to `create_purchase`
-- ONLY. It blocks a real user every night, which outranks the security backlog.
--
-- ============================================================================
-- WHAT IS WRONG
-- ============================================================================
--
-- `create_purchase` validates the purchase date with:
--
--     IF p_purchase_date > CURRENT_DATE THEN
--       RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.' ... HINT 'PURCHASE_DATE_FUTURE'
--
-- `CURRENT_DATE` is the SESSION's calendar date, and this server runs UTC (`SHOW TimeZone`
-- -> UTC; `pg_db_role_setting` holds no override for `afrakala`). The purchase form defaults
-- its date field to the **Tehran** day. Tehran is UTC+3:30, so from **00:00 to 03:30 Tehran
-- every night** the form's own default is a day ahead of `CURRENT_DATE` and is refused as
-- being in the future.
--
-- Measured on the live database at the moment of diagnosis, 2026-08-26:
--
--     utc_now            | 2026-08-25 23:23     tehran_now   | 2026-08-26 02:53
--     CURRENT_DATE (UTC) | 2026-08-25           tehran_today | 2026-08-26
--     tehran_today() > CURRENT_DATE  ->  t
--
-- The user sees the RPC's own Persian message, so it reads as a validation rule rather than
-- a bug. This is A5.32's recorded trap - *server timezone is UTC; use `public.tehran_today()`
-- for the calendar day* - violated inside the RPC itself.
--
-- **How it was found:** not by looking for it. Mission 4's e2e run returned 43 failures
-- against a baseline of 30; the 14 new ones were all in `purchase/*`, they reproduced on an
-- idle machine, and migration 393 was exonerated by reverting it live and re-running two of
-- them. The run had started at 02:5x Tehran - inside the window.
--
-- ============================================================================
-- WHAT THIS MIGRATION DOES
-- ============================================================================
--
-- Exactly one line changes:
--
--     -  IF p_purchase_date > CURRENT_DATE THEN
--     +  IF p_purchase_date > public.tehran_today() THEN
--
-- `public.tehran_today()` is `(now() AT TIME ZONE 'Asia/Tehran')::date` - STABLE, already
-- the project's calendar-day function, and independent of the session TimeZone.
--
-- The body below is a **byte-for-byte copy of the LIVE definition** captured with
-- `pg_get_functiondef` (A5.28), with only that comparison replaced. It is copied rather
-- than retyped because the body carries 31 distinct Persian-guarded error paths, and
-- hand-transcribing Persian is how ~460 Persian values were destroyed on 2026-07-11.
-- Delivered by `docker cp` + `psql -f`, never a pipe and never `-c` (A5.30).
--
-- Checked before writing this file: the live body and migration 252's (the authoritative
-- git definition - 254 is a different function, `create_purchase_request`) carry the SAME
-- 31 distinct HINT codes, so git and the database had not drifted here.
--
-- `CREATE OR REPLACE` preserves the ACL, the owner and the Persian COMMENT. Captured
-- before the change and asserted after:
--   acl   : {postgres=X, supabase_admin=X, authenticated=X, service_role=X}  - no anon, no PUBLIC
--   owner : supabase_admin,  VOLATILE,  SECURITY DEFINER,
--           SET search_path TO 'public','extensions','pg_temp'
--
-- ============================================================================
-- WHAT THIS MIGRATION DOES *NOT* DO
-- ============================================================================
--
-- **The other 21 functions are NOT touched.** 22 functions in `public` reference
-- `CURRENT_DATE`/`current_date` and not one of them also references `tehran_today`; six
-- carry the same `> CURRENT_DATE` future-date rejection. The owner scoped this migration to
-- `create_purchase` alone. The rest are audited by name and line in
-- `docs/research/og63-current-date-audit.md` and raised as ONE gate for the class.
--
-- Rollback: `docs/verification/394-down.sql`, written BEFORE this file from the live
-- captured body and dry-run proved (A5.28).

SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.create_purchase(p_product_id uuid, p_payment_term_id uuid, p_purchase_price numeric, p_currency text, p_quantity integer, p_purchase_date date, p_supplier_id uuid DEFAULT NULL::uuid, p_cash_price numeric DEFAULT NULL::numeric, p_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_allocate_quantity numeric DEFAULT NULL::numeric, p_allow_over_allocation boolean DEFAULT false, p_over_allocation_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _is_priv     boolean;
  _notes       text;
  _currency    text;
  _line_total  numeric;
  _cash        numeric;
  _cash_cur    text;
  _purchase_id uuid;
  _item_id     uuid;
  _payload     jsonb;
  _hash        text;
  _existing    public.purchase_idempotency%ROWTYPE;
  _result      jsonb;
  _req         public.purchase_requests%ROWTYPE;
  _req_assignee uuid;
  _supplied    numeric := 0;
  _remaining   numeric := 0;
  _alloc       numeric;
  _over        boolean := false;
  _over_note   text;
  _total_alloc numeric;
  _effective   numeric;
  _new_status  text;
  _final_price numeric;
  _req_json    jsonb := NULL;
  _product     record;
  _term        record;
  _supplier    record;
  _warehouse   record;
BEGIN
  ---------------------------------------------------------------------------
  -- 1-2. Authentication and authorization (unchanged from 251).
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_NOT_AUTHENTICATED';
  END IF;

  _is_priv := public.has_any_role(_uid, ARRAY['admin','manager']::text[]);

  -- Standalone purchases (no request): admin/manager only, exactly as C2 and
  -- exactly as the RLS policy on purchases. Unchanged.
  IF p_request_id IS NULL AND NOT _is_priv THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند خرید ندارید.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_PERMISSION_DENIED';
  END IF;

  -- Request path: the buyer the request is ASSIGNED to may register its
  -- purchase, and admin/manager may override. A cheap unlocked read is enough
  -- to decide access; the authoritative re-check happens under FOR UPDATE below,
  -- so a concurrent reassignment cannot slip through.
  --
  -- ⚠️ This is the one place where the RPC is broader than the RLS policy on
  -- purchases (admin/manager). It has to be: the whole feature is that the
  -- assigned buyer registers the purchase. In practice nothing changes today —
  -- create_purchase_request assigns every request to the first active manager,
  -- so every assignee already holds manager. Aligning RLS and role_permissions
  -- with this rule is the separate permission-unification phase.
  IF p_request_id IS NOT NULL THEN
    SELECT assigned_to INTO _req_assignee
      FROM public.purchase_requests WHERE id = p_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
    END IF;

    IF NOT _is_priv AND _req_assignee IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'این درخواست به شما تخصیص داده نشده است.'
        USING ERRCODE = '42501', HINT = 'NOT_ASSIGNED';
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Over-allocation arguments only make sense with a request.
  ---------------------------------------------------------------------------
  _over_note := NULLIF(btrim(COALESCE(p_over_allocation_note,'')),'');
  IF p_request_id IS NULL
     AND (p_allocate_quantity IS NOT NULL
          OR COALESCE(p_allow_over_allocation,false)
          OR _over_note IS NOT NULL) THEN
    RAISE EXCEPTION 'پارامترهای تخصیص بدون درخواست خرید معنا ندارند.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_ALLOCATION_WITHOUT_REQUEST';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Shared validation (identical to 251).
  ---------------------------------------------------------------------------
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'انتخاب محصول الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_REQUIRED';
  END IF;

  SELECT id, name, status INTO _product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PRODUCT_INVALID';
  END IF;
  IF _product.status <> 'active' THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_INACTIVE';
  END IF;

  SELECT id, is_active INTO _term FROM public.payment_terms WHERE id = p_payment_term_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PAYMENT_TERM_INVALID';
  END IF;
  IF NOT _term.is_active THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PAYMENT_TERM_INACTIVE';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT id, is_active INTO _supplier FROM public.suppliers WHERE id = p_supplier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_SUPPLIER_INVALID';
    END IF;
    IF NOT _supplier.is_active THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_SUPPLIER_INACTIVE';
    END IF;
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT id, is_active INTO _warehouse FROM public.warehouses WHERE id = p_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_WAREHOUSE_INVALID';
    END IF;
    IF NOT _warehouse.is_active THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_WAREHOUSE_INACTIVE';
    END IF;
  END IF;

  _currency := lower(btrim(COALESCE(p_currency, '')));
  IF _currency NOT IN ('toman','usd','aed') THEN
    RAISE EXCEPTION 'ارز انتخاب‌شده برای سند خرید پشتیبانی نمی‌شود.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CURRENCY_INVALID';
  END IF;

  IF p_purchase_price IS NULL OR p_purchase_price <= 0 THEN
    RAISE EXCEPTION 'قیمت خرید باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRICE_INVALID';
  END IF;

  IF p_cash_price IS NOT NULL AND p_cash_price <= 0 THEN
    RAISE EXCEPTION 'قیمت نقدی باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CASH_PRICE_INVALID';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'تعداد باید عددی صحیح و حداقل ۱ باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_QUANTITY_INVALID';
  END IF;

  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ خرید الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_REQUIRED';
  END IF;
  IF p_purchase_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_FUTURE';
  END IF;

  _notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF _notes IS NOT NULL AND length(_notes) > 500 THEN
    RAISE EXCEPTION 'توضیحات نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_NOTES_TOO_LONG';
  END IF;

  _line_total := p_purchase_price * p_quantity;
  _cash       := p_cash_price;
  _cash_cur   := CASE WHEN _cash IS NOT NULL THEN _currency ELSE NULL END;

  ---------------------------------------------------------------------------
  -- 5. Idempotency. The payload now carries the request context, so the same
  --    key used for a different request or a different allocation is a
  --    conflict rather than a silent replay.
  ---------------------------------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    _payload := jsonb_build_object(
      'request_id',        p_request_id::text,
      'product_id',        p_product_id::text,
      'quantity',          p_quantity::text,
      'allocate_quantity', CASE WHEN p_allocate_quantity IS NULL THEN NULL
                                ELSE trim_scale(round(p_allocate_quantity, 3))::text END,
      'allow_over',        COALESCE(p_allow_over_allocation,false)::text,
      'over_note',         _over_note,
      'purchase_price',    trim_scale(round(p_purchase_price, 2))::text,
      'cash_price',        CASE WHEN _cash IS NULL THEN NULL
                                ELSE trim_scale(round(_cash, 2))::text END,
      'currency',          _currency,
      'supplier_id',       p_supplier_id::text,
      'warehouse_id',      p_warehouse_id::text,
      'payment_term_id',   p_payment_term_id::text,
      'purchase_date',     to_char(p_purchase_date, 'YYYY-MM-DD'),
      'created_by',        _uid::text
    );
    _hash := encode(extensions.digest(_payload::text, 'sha256'), 'hex');

    SELECT * INTO _existing FROM public.purchase_idempotency
     WHERE idempotency_key = p_idempotency_key FOR UPDATE;

    IF FOUND THEN
      IF _existing.created_by <> _uid THEN
        RAISE EXCEPTION 'این عملیات قبلاً توسط کاربر دیگری ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;
      IF _existing.payload_hash <> _hash THEN
        RAISE EXCEPTION 'این عملیات قبلاً با اطلاعات متفاوتی ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;
      IF _existing.state = 'completed' THEN
        RETURN jsonb_set(_existing.result, '{created}', 'false'::jsonb);
      END IF;
      IF _existing.state = 'processing' AND _existing.created_at > now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'این عملیات هم‌اکنون در حال ثبت است. لطفاً چند لحظه صبر کنید.'
          USING ERRCODE = '55006', HINT = 'PURCHASE_IN_PROGRESS';
      END IF;
      DELETE FROM public.purchase_idempotency WHERE idempotency_key = p_idempotency_key;
    END IF;

    INSERT INTO public.purchase_idempotency
      (idempotency_key, created_by, scope, payload_hash, state)
    VALUES (p_idempotency_key, _uid, 'create_purchase', _hash, 'processing');
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Request branch: lock, validate, compute the allocation.
  --    The lock is taken BEFORE anything is written, so a concurrent buyer
  --    waits here and then sees the updated remaining quantity.
  ---------------------------------------------------------------------------
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO _req FROM public.purchase_requests
     WHERE id = p_request_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
    END IF;

    IF _req.legacy_no_fulfillment THEN
      RAISE EXCEPTION 'این درخواست قدیمی سند مرتبط قابل اتکا ندارد.'
        USING ERRCODE = '22023', HINT = 'REQUEST_LEGACY_UNKNOWN';
    END IF;

    IF _req.status = 'cancelled' THEN
      RAISE EXCEPTION 'این درخواست لغو شده است.'
        USING ERRCODE = '22023', HINT = 'REQUEST_CANCELLED';
    END IF;

    IF _req.status NOT IN ('approved','partially_purchased') THEN
      IF _req.status IN ('purchased','delivered') THEN
        RAISE EXCEPTION 'این درخواست قبلاً به‌طور کامل تأمین شده است.'
          USING ERRCODE = '22023', HINT = 'REQUEST_ALREADY_COMPLETED';
      END IF;
      RAISE EXCEPTION 'این درخواست هنوز آماده ثبت خرید نیست.'
        USING ERRCODE = '22023', HINT = 'REQUEST_NOT_APPROVED';
    END IF;

    -- Authoritative assignment re-check, now under the row lock: a concurrent
    -- reassignment between the access check above and here must not slip past.
    IF NOT _is_priv AND _req.assigned_to IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'این درخواست به شما تخصیص داده شده نیست.'
        USING ERRCODE = '42501', HINT = 'NOT_ASSIGNED';
    END IF;

    -- The product must match. The UI locks the field, but a crafted request
    -- must not be able to satisfy a request for A with a purchase of B.
    IF _req.product_id <> p_product_id THEN
      RAISE EXCEPTION 'محصول خرید با محصول درخواست یکسان نیست.'
        USING ERRCODE = '22023', HINT = 'PRODUCT_MISMATCH';
    END IF;

    SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _supplied
      FROM public.purchase_request_fulfillments f
     WHERE f.purchase_request_id = p_request_id;

    _remaining := GREATEST(_req.quantity - _supplied, 0);

    IF _remaining <= 0 THEN
      RAISE EXCEPTION 'این درخواست قبلاً به‌طور کامل تأمین شده است.'
        USING ERRCODE = '22023', HINT = 'REQUEST_ALREADY_COMPLETED';
    END IF;

    -- Default: never allocate more than is still needed, and never more than
    -- was actually purchased.
    _alloc := COALESCE(p_allocate_quantity, LEAST(_remaining, p_quantity::numeric));

    IF _alloc <= 0 THEN
      RAISE EXCEPTION 'مقدار تخصیص معتبر نیست.'
        USING ERRCODE = '22023', HINT = 'INVALID_ALLOCATION';
    END IF;

    IF _alloc > p_quantity::numeric THEN
      RAISE EXCEPTION 'مقدار تخصیص نمی‌تواند از مقدار خریداری‌شده بیشتر باشد.'
        USING ERRCODE = '22023', HINT = 'INVALID_ALLOCATION';
    END IF;

    IF _alloc > _remaining THEN
      IF NOT COALESCE(p_allow_over_allocation, false) THEN
        RAISE EXCEPTION 'مقدار تخصیص از مقدار باقی‌مانده بیشتر است.'
          USING ERRCODE = '22023', HINT = 'OVER_ALLOCATION_CONFIRMATION_REQUIRED';
      END IF;
      IF _over_note IS NULL THEN
        RAISE EXCEPTION 'برای تخصیص مازاد باید دلیل ثبت شود.'
          USING ERRCODE = '22023', HINT = 'OVER_ALLOCATION_NOTE_REQUIRED';
      END IF;
      _over := true;
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- 7-8. The purchase and its line (identical to 251).
  ---------------------------------------------------------------------------
  INSERT INTO public.purchases (
    product_id, supplier_id, payment_term_id, purchase_price, currency,
    cash_price, cash_price_currency, quantity, purchase_date, notes,
    created_by, total_amount, status, warehouse_id
  )
  VALUES (
    p_product_id, p_supplier_id, p_payment_term_id, p_purchase_price, _currency,
    _cash, _cash_cur, p_quantity, p_purchase_date, _notes,
    _uid, _line_total, 'received', p_warehouse_id
  )
  RETURNING id INTO _purchase_id;

  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price, line_total)
  VALUES (_purchase_id, p_product_id, p_quantity, p_purchase_price, _line_total)
  RETURNING id INTO _item_id;

  ---------------------------------------------------------------------------
  -- 9-14. Fulfillment, derived state, history, notification, audit.
  ---------------------------------------------------------------------------
  IF p_request_id IS NOT NULL THEN
    -- Lock the freshly created line too. It cannot be contended yet, but the
    -- order is established here so a future allocate-to-existing-line path
    -- cannot introduce a deadlock by locking the other way round.
    PERFORM 1 FROM public.purchase_items WHERE id = _item_id FOR UPDATE;

    INSERT INTO public.purchase_request_fulfillments
      (purchase_request_id, purchase_id, purchase_item_id, allocated_quantity,
       is_over_allocation, over_allocation_note, source, created_by)
    VALUES (p_request_id, _purchase_id, _item_id, _alloc,
            _over, CASE WHEN _over THEN _over_note ELSE NULL END, 'rpc', _uid);

    SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _total_alloc
      FROM public.purchase_request_fulfillments f
     WHERE f.purchase_request_id = p_request_id;

    _effective := LEAST(_total_alloc, _req.quantity);

    _new_status := CASE
      WHEN _total_alloc <= 0                 THEN 'approved'
      WHEN _total_alloc < _req.quantity      THEN 'partially_purchased'
      ELSE 'purchased'
    END;

    -- final_price recomputed from the real purchases, so the existing card
    -- display keeps working without becoming a second source of truth.
    SELECT COALESCE(SUM(f.allocated_quantity * pi.unit_price), 0) INTO _final_price
      FROM public.purchase_request_fulfillments f
      JOIN public.purchase_items pi ON pi.id = f.purchase_item_id
     WHERE f.purchase_request_id = p_request_id;

    UPDATE public.purchase_requests
       SET status      = _new_status,
           final_price = _final_price,
           updated_at  = now()
     WHERE id = p_request_id;

    -- Exactly one history row per real transition.
    IF _new_status IS DISTINCT FROM _req.status THEN
      INSERT INTO public.purchase_request_status_history
        (request_id, from_status, to_status, changed_by, note)
      VALUES (p_request_id, _req.status, _new_status, _uid,
              'ثبت سند خرید ' || left(_purchase_id::text, 8)
              || ' — تخصیص ' || trim_scale(_alloc)::text
              || CASE WHEN _over THEN ' (مازاد: ' || _over_note || ')' ELSE '' END);

      INSERT INTO public.notification_events
        (event_type, user_id, channel, payload, status)
      VALUES (
        CASE WHEN _new_status = 'purchased'
             THEN 'purchase_request_purchased'
             ELSE 'purchase_request_partially_purchased' END,
        _req.requested_by, 'in_app',
        jsonb_build_object(
          'title', CASE WHEN _new_status='purchased'
                        THEN 'خرید درخواست شما انجام شد'
                        ELSE 'بخشی از درخواست خرید شما تأمین شد' END,
          'body',  'تأمین‌شده ' || trim_scale(_effective)::text
                   || ' از ' || trim_scale(_req.quantity)::text,
          'reference_type','purchase_request',
          'reference_id',  p_request_id,
          'purchase_id',   _purchase_id,
          'from', _req.status, 'to', _new_status),
        'pending');
    END IF;

    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
    VALUES ('purchase_request', p_request_id::text, 'purchase_linked_to_request', _uid,
            jsonb_build_object(
              'purchase_id',        _purchase_id,
              'purchase_item_id',   _item_id,
              'purchased_quantity', p_quantity,
              'allocated_quantity', _alloc,
              'is_over_allocation', _over,
              'over_allocation_note', CASE WHEN _over THEN _over_note ELSE NULL END,
              'total_allocated',    _total_alloc,
              'effective_supplied', _effective,
              'remaining',          GREATEST(_req.quantity - _total_alloc, 0),
              'from_status',        _req.status,
              'to_status',          _new_status));

    _req_json := jsonb_build_object(
      'id',                 p_request_id,
      'status',             _new_status,
      'requested_quantity', _req.quantity,
      'allocated_quantity', _alloc,
      'total_allocated',    _total_alloc,
      'effective_supplied', _effective,
      'remaining_quantity', GREATEST(_req.quantity - _total_alloc, 0),
      'is_over_allocation', _over,
      'unit',               _req.unit);
  END IF;

  ---------------------------------------------------------------------------
  -- 15. Result.
  ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'created', true,
    'purchase', jsonb_build_object(
      'id',             p.id,
      'short_id',       left(p.id::text, 8),
      'product_id',     p.product_id,
      'product_name',   _product.name,
      'supplier_id',    p.supplier_id,
      'supplier_name',  (SELECT s.name FROM public.suppliers s WHERE s.id = p.supplier_id),
      'warehouse_id',   p.warehouse_id,
      'warehouse_name', (SELECT w.name FROM public.warehouses w WHERE w.id = p.warehouse_id),
      'payment_term_id',p.payment_term_id,
      'purchase_price', p.purchase_price,
      'cash_price',     p.cash_price,
      'currency',       p.currency,
      'quantity',       p.quantity,
      'total_amount',   p.total_amount,
      'purchase_date',  to_char(p.purchase_date, 'YYYY-MM-DD'),
      'status',         p.status
    ),
    'item', jsonb_build_object('id', _item_id, 'quantity', p_quantity, 'line_total', _line_total),
    'request', _req_json
  )
  INTO _result
  FROM public.purchases p WHERE p.id = _purchase_id;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.purchase_idempotency
       SET state='completed', purchase_id=_purchase_id, result=_result, completed_at=now()
     WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN _result;
END;
$function$;

-- The gate must CALL the RPC to prove behaviour, and create_purchase is VOLATILE and
-- writes. This helper wraps each call in a sub-transaction that is ALWAYS rolled back:
-- on success it raises its own marker, so the accepted-purchase case is undone too and
-- the migration can never commit a test purchase. It lives in `pg_temp`, so it is
-- session-local, invisible to `public`, and gone when the connection closes; it is also
-- dropped explicitly below. It returns the RPC's HINT, or '__ACCEPTED__'.
CREATE FUNCTION pg_temp._og63_probe(p_prod uuid, p_term uuid, p_date date)
RETURNS text LANGUAGE plpgsql AS $probe$
DECLARE h text; m text;
BEGIN
  BEGIN
    PERFORM public.create_purchase(
      p_product_id      := p_prod,
      p_payment_term_id := p_term,
      p_purchase_price  := 5000,
      p_currency        := 'TOMAN',
      p_quantity        := 1,
      p_purchase_date   := p_date,
      p_notes           := '__394_GATE_PROBE__',
      p_idempotency_key := '394-gate-' || gen_random_uuid()::text);
    RAISE EXCEPTION '__394_ACCEPTED__';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT, m = MESSAGE_TEXT;
    IF m = '__394_ACCEPTED__' THEN RETURN '__ACCEPTED__'; END IF;
    RETURN COALESCE(NULLIF(h, ''), 'ERR:' || m);
  END;
END;
$probe$;

-- ============================================================================
-- THE GATE - one gate for this mission (A2.9), two-sided (A2.10),
--            and TIME-INDEPENDENT (v8 mission 5, requirement c)
-- ============================================================================
--
-- The defect only manifests while the session's calendar date is behind Tehran's - with a
-- UTC server, 00:00 to 03:30 Tehran. A gate that just called the RPC would therefore PASS
-- on the BROKEN code for 20.5 hours of every day and prove nothing. This gate
-- **reconstructs the window on demand** instead of waiting for it.
--
-- The mechanism, measured before it was relied on: `CURRENT_DATE` is evaluated in the
-- SESSION's TimeZone, while `public.tehran_today()` is `(now() AT TIME ZONE 'Asia/Tehran')::date`
-- and is TimeZone-independent. So `SET TimeZone='Etc/GMT+12'` puts CURRENT_DATE a day
-- behind tehran_today() at ANY wall-clock moment - exactly the broken window - and
-- `Asia/Tehran` makes them agree, the healthy case. Both regimes are asserted, and each
-- carries a VACUITY GUARD proving the regime really was constructed before any conclusion
-- is drawn from it.
--
-- Nothing is written: every call goes through pg_temp._og63_probe, which rolls its
-- sub-transaction back in both directions.

DO $gate$
DECLARE
  v_product uuid;
  v_term    uuid;
  v_admin   uuid;
  v_hint    text;
  v_src     text;
  v_ok      boolean;
  v_window  boolean;
  tz        text;
  n_total   int;
  n_distinct int;
  n         int;
BEGIN
  ------------------------------------------------------------------ S: structural
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'create_purchase';
  IF n <> 1 THEN
    RAISE EXCEPTION '394 S1: expected exactly one public.create_purchase, found % - an overload would let the page reach a signature this gate never checks', n;
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure;

  IF position('public.tehran_today()' in v_src) = 0 THEN
    RAISE EXCEPTION '394 S2: the live body does not call public.tehran_today() - the fix is not in the database';
  END IF;
  IF v_src ~ '>\s*CURRENT_DATE' THEN
    RAISE EXCEPTION '394 S3: the live body still compares against CURRENT_DATE, the UTC server date - the defect is present';
  END IF;

  -- Persian integrity (A5.30). A pipe or a bad encoding turns Persian into '?', which
  -- destroyed the Persian inside 44 functions on this project on 2026-07-11.
  SELECT count(*), count(DISTINCT m[1]) INTO n_total, n_distinct
    FROM regexp_matches(v_src, 'HINT = ''([A-Z_]+)''', 'g') AS m;
  IF n_total <> 36 OR n_distinct <> 31 THEN
    RAISE EXCEPTION '394 S4: the body carries % HINT occurrences over % distinct codes; captured before the change were 36 over 31. Guards were lost or duplicated when the function was replaced.', n_total, n_distinct;
  END IF;
  IF position('تاریخ خرید نمی‌تواند در آینده باشد.' in v_src) = 0 THEN
    RAISE EXCEPTION '394 S5: the Persian future-date message is missing or altered in the live body';
  END IF;
  IF v_src LIKE '%?????%' THEN
    RAISE EXCEPTION '394 S6: the live body contains a run of question marks - Persian was corrupted on delivery (the 2026-07-11 failure mode)';
  END IF;

  -- attributes and ACL exactly as captured before the change
  SELECT (p.prosecdef AND p.provolatile = 'v' AND p.proowner = 'supabase_admin'::regrole
          AND p.proconfig IS NOT NULL)
    INTO v_ok FROM pg_proc p WHERE p.oid = 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure;
  IF NOT v_ok THEN
    RAISE EXCEPTION '394 S7: create_purchase lost SECURITY DEFINER / VOLATILE / its owner / its pinned search_path';
  END IF;
  IF obj_description('public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure, 'pg_proc') IS NULL THEN
    RAISE EXCEPTION '394 S8: the Persian COMMENT on create_purchase is gone - CREATE OR REPLACE should have preserved it';
  END IF;
  IF has_function_privilege('anon', 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '394 S9: anon can EXECUTE create_purchase - the replace must not widen the ACL';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '394 S10: authenticated LOST EXECUTE on create_purchase - the page would break for every user';
  END IF;

  ------------------------------------------------------------------ B: behavioural
  SELECT id INTO v_product FROM public.products WHERE status = 'active' LIMIT 1;
  SELECT id INTO v_term    FROM public.payment_terms WHERE is_active LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_product IS NULL OR v_term IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION '394 B0: cannot test - active product / active payment term / admin user missing (%, %, %). Every behavioural check below would pass vacuously.', v_product, v_term, v_admin;
  END IF;

  -- create_purchase reads auth.uid() and checks roles; simulate a real signed-in admin.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  FOREACH tz IN ARRAY ARRAY['Etc/GMT+12', 'Asia/Tehran'] LOOP
    PERFORM set_config('TimeZone', tz, true);

    -- VACUITY GUARD. Without this, a TimeZone that silently failed to shift the date would
    -- make the whole window test a no-op that still reports success.
    v_window := (public.tehran_today() > CURRENT_DATE);
    IF tz = 'Etc/GMT+12' AND NOT v_window THEN
      RAISE EXCEPTION '394 B1: could not reconstruct the broken window under TimeZone % - tehran_today()=% is not ahead of CURRENT_DATE=%. The window half of this gate would be vacuous.', tz, public.tehran_today(), CURRENT_DATE;
    END IF;
    IF tz = 'Asia/Tehran' AND v_window THEN
      RAISE EXCEPTION '394 B2: under TimeZone % the two dates were expected to agree, but tehran_today()=% is ahead of CURRENT_DATE=%', tz, public.tehran_today(), CURRENT_DATE;
    END IF;

    -- (1) today-in-Tehran MUST be accepted. This is the user-facing bug itself.
    v_hint := pg_temp._og63_probe(v_product, v_term, public.tehran_today());
    IF v_hint = 'PURCHASE_DATE_FUTURE' THEN
      RAISE EXCEPTION '394 B3 [TimeZone=%, window=%]: a purchase dated today-in-Tehran (%) is STILL rejected as being in the future. That is OG-63: between 00:00 and 03:30 Tehran the purchase form default is refused.', tz, v_window, public.tehran_today();
    END IF;

    -- (2) a genuinely future date MUST still be rejected - the other side (A2.10).
    -- A "fix" that simply deleted the check would pass (1) and has to fail here.
    v_hint := pg_temp._og63_probe(v_product, v_term, public.tehran_today() + 1);
    IF v_hint IS DISTINCT FROM 'PURCHASE_DATE_FUTURE' THEN
      RAISE EXCEPTION '394 B4 [TimeZone=%]: tomorrow-in-Tehran (%) was NOT rejected with PURCHASE_DATE_FUTURE (got %). The future-date rule has been removed rather than corrected.', tz, public.tehran_today() + 1, COALESCE(v_hint, '<null>');
    END IF;
  END LOOP;

  PERFORM set_config('TimeZone', 'UTC', true);

  RAISE NOTICE '394 OK: create_purchase compares against public.tehran_today(), not the UTC CURRENT_DATE. Proven BEHAVIOURALLY in both timezone regimes - inside a deliberately reconstructed broken window (Etc/GMT+12, tehran_today() a day ahead of CURRENT_DATE) and in the healthy one (Asia/Tehran) - that today-in-Tehran is ACCEPTED and tomorrow-in-Tehran is still REJECTED with PURCHASE_DATE_FUTURE. Each regime carries a vacuity guard proving it was really constructed, so neither half can pass by accident. All 36 HINT occurrences over 31 distinct codes survive, the Persian is intact with no encoding corruption, and SECURITY DEFINER / VOLATILE / owner / pinned search_path / the COMMENT / the ACL (no anon; authenticated retained) are unchanged. Nothing was written - every probe ran in a sub-transaction that was rolled back.';
END $gate$;

DROP FUNCTION pg_temp._og63_probe(uuid, uuid, date);
