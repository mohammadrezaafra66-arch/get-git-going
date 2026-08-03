SET client_encoding='UTF8';

-- =============================================================================
-- 252 — Issue 219 / C3.1: link a purchase to its purchase request
-- =============================================================================
--
-- WHAT CHANGES
--   Migration 251 created create_purchase and deliberately REJECTED
--   p_request_id ("half-working is worse than none"). This migration implements
--   that branch: when a request id is supplied, the same transaction that
--   writes the purchase and its line also writes the fulfillment row, recomputes
--   the request's supplied quantity, moves its status, and records history,
--   notification and audit.
--
-- BACKWARD COMPATIBLE
--   The signature is unchanged, so this is CREATE OR REPLACE, not an overload
--   (rule 5). With p_request_id = NULL the behaviour is byte-for-byte what 251
--   did, which is what /purchases/create keeps using. An old frontend talking to
--   this new backend is unaffected — it never sends a request id.
--
-- THE THREE QUANTITIES ARE NOT THE SAME NUMBER
--   purchased_quantity  = purchase_items.quantity      -> what enters stock
--   allocated_quantity  = what this request consumed    -> drives status
--   effective_supplied  = LEAST(total_allocated, requested)
--   A request for 10 satisfied by a purchase of 12 allocates 10; the extra 2
--   still enters inventory and shows as excess on the LINE, never per request.
--
-- LOCK ORDER IS FIXED: idempotency row -> purchase_request -> purchase_item.
--   Two buyers racing on the same request serialise on the request lock, so the
--   second one recomputes `remaining` after the first commits and cannot
--   over-supply. Varying this order between call sites would deadlock.
--
-- STATUS IS DERIVED, NEVER PASSED IN
--   total_allocated = 0                       -> approved (unchanged)
--   0 < total_allocated < requested           -> partially_purchased
--   total_allocated >= requested              -> purchased
--   Over-allocation therefore lands on 'purchased', not on an invented state.
--
-- final_price IS KEPT ALIVE, NOT ORPHANED
--   The card shows purchase_requests.final_price, which until now was typed by
--   hand into the old status dialog. That dialog disappears for this path, so
--   the column would silently go NULL. It is instead RECOMPUTED from the real
--   purchases: SUM(allocated_quantity * unit_price) across all fulfillments.
--   That is a derived cache of data that lives in purchases — not a second
--   source of truth, and it keeps the existing UI correct.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase(
  p_product_id      uuid,
  p_payment_term_id uuid,
  p_purchase_price  numeric,
  p_currency        text,
  p_quantity        integer,
  p_purchase_date   date,
  p_supplier_id     uuid    DEFAULT NULL,
  p_cash_price      numeric DEFAULT NULL,
  p_warehouse_id    uuid    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_request_id            uuid    DEFAULT NULL,
  p_allocate_quantity     numeric DEFAULT NULL,
  p_allow_over_allocation boolean DEFAULT false,
  p_over_allocation_note  text    DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
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
  IF p_purchase_date > CURRENT_DATE THEN
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

COMMENT ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) IS
  'مورد ۲۱۹ (۲۵۱، تکمیل‌شده در ۲۵۲). ثبت اتمیک سند خرید و قلم آن؛ و در صورت ارسال p_request_id، ثبت تخصیص به درخواست خرید در همان تراکنش: fulfillment، محاسبهٔ وضعیت مشتق (partially_purchased / purchased)، تاریخچه، اعلان و audit. مقدار خرید واقعی وارد موجودی می‌شود و مقدار تخصیص وضعیت درخواست را تعیین می‌کند؛ این دو عمداً یکی نیستند. ترتیب ثابت قفل: idempotency ← purchase_requests ← purchase_items. با p_request_id = NULL رفتار دقیقاً همان مهاجرت ۲۵۱ است، پس صفحهٔ /purchases/create تغییری نمی‌بیند. مجوز: admin/manager، یا assignee همان درخواست.';

REVOKE ALL ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
