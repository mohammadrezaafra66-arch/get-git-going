SET client_encoding='UTF8';

-- =============================================================================
-- 275 - D8-8 follow-up: create_sales_quote_with_items accepts a per-line
--       warehouse, so the line-level column added in 274 is actually reachable
--       from the proforma form and not only through a direct API call.
--
-- HOW THIS FILE WAS PRODUCED (rule 4 - never rebuild a function from memory):
-- the body below is `pg_get_functiondef` of the LIVE function, captured and
-- patched mechanically INSIDE the database container. It deliberately never
-- passed through a PowerShell pipe - that is what replaced every non-ASCII
-- byte with `?` and destroyed the Persian text in 44 functions on 2026-07-11.
-- Verified after patching: all 9 Persian lines still present.
--
-- Exactly two lines differ from the live definition:
--   + `warehouse_id` appended to the INSERT column list
--   + `NULLIF(elem->>'warehouse_id','')::uuid` appended to the SELECT list
-- The patch script asserted each anchor matched EXACTLY ONCE and aborted
-- otherwise, so this cannot have silently applied nothing - a migration that
-- looks correct and changes nothing is the failure mode being guarded against.
--
-- Behaviour when a line omits warehouse_id: NULL, which
-- effective_line_warehouse() (274) resolves to the document warehouse and then
-- to the default - i.e. exactly today's behaviour. Callers that do not send the
-- key are unaffected, so this is backwards compatible.
--
-- The signature is UNCHANGED, so no DROP FUNCTION is required (rule 5).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(p_customer_name text, p_customer_phone text, p_customer_note text, p_expires_at timestamp with time zone, p_subtotal_amount numeric, p_discount_amount numeric, p_final_amount numeric, p_items jsonb, p_settlement_type_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_below_list_ack boolean DEFAULT false, p_deposit_amount numeric DEFAULT NULL::numeric, p_commitment_confirmed boolean DEFAULT false, p_visitor_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_quote_exception_type text DEFAULT NULL::text, p_quote_exception_minutes integer DEFAULT NULL::integer, p_quote_exception_amount numeric DEFAULT NULL::numeric, p_quote_exception_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _quote_id uuid;
  _quote_number text;
  _item jsonb;
  _items_count int := 0;
  _sum_subtotal numeric := 0;
  _sum_discount numeric := 0;
  _sum_final numeric := 0;
  _src_product int := 0;
  _src_quick int := 0;
  _src_manual int := 0;
  _qty numeric;
  _price numeric;
  _disc numeric;
  _line numeric;
  _src text;
  _pid uuid;
  _sptid uuid;
  _label text;
  _floor numeric;
  _settlement_label text;
  _effective numeric;
  _worst_floor numeric := NULL;
  _went_below boolean := false;
  _credit record;
  _credit_snapshot jsonb := NULL;
  _exception_snapshot jsonb := NULL;
  _wh uuid;
  _need record;
  _available numeric;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ایجاد پیش‌فاکتور را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_quote_exception_type IS NOT NULL
     AND p_quote_exception_type NOT IN (
       'overdue_salesperson_commitment',
       'credit_shortfall_salesperson_commitment',
       'accounting_approval'
     ) THEN
    RAISE EXCEPTION 'نوع تعهد یا تأیید انتخاب‌شده معتبر نیست.' USING ERRCODE = '22023';
  END IF;

  IF p_quote_exception_type IS NOT NULL AND btrim(COALESCE(p_quote_exception_text, '')) = '' THEN
    RAISE EXCEPTION 'متن تعهد یا تأیید برای ثبت این پیش‌فاکتور الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_quote_exception_type = 'overdue_salesperson_commitment'
     AND COALESCE(p_quote_exception_minutes, 0) <= 0 THEN
    RAISE EXCEPTION 'مهلت تسویه معوقه باید مشخص و بزرگ‌تر از صفر دقیقه باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'نام مشتری الزامی است.' USING ERRCODE = '22023';
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'شماره تماس مشتری الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'پیش‌فاکتور باید حداقل یک آیتم داشته باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_visitor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.visitors WHERE id = p_visitor_id AND is_active) THEN
    RAISE EXCEPTION 'ویزیتور انتخاب‌شده معتبر یا فعال نیست.' USING ERRCODE = '22023';
  END IF;

  _wh := COALESCE(p_warehouse_id, public.default_warehouse_id());
  IF p_warehouse_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND is_active) THEN
    RAISE EXCEPTION 'انبار انتخاب‌شده معتبر یا فعال نیست.' USING ERRCODE = '22023';
  END IF;

  IF p_settlement_type_id IS NOT NULL THEN
    SELECT title INTO _settlement_label
    FROM public.settlement_types WHERE id = p_settlement_type_id AND is_active = true;
    IF _settlement_label IS NULL THEN
      RAISE EXCEPTION 'نوع تسویهٔ انتخاب‌شده معتبر یا فعال نیست.' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    _qty := COALESCE((_item->>'quantity')::numeric, 0);
    _price := COALESCE((_item->>'unit_price')::numeric, 0);
    _disc := COALESCE((_item->>'discount_amount')::numeric, 0);
    _line := COALESCE((_item->>'line_total')::numeric, 0);
    _src := _item->>'source';

    IF _qty <= 0 THEN
      RAISE EXCEPTION 'تعداد آیتم باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    IF _price <= 0 THEN
      RAISE EXCEPTION 'قیمت واحد آیتم باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    IF _disc < 0 THEN
      RAISE EXCEPTION 'تخفیف نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
    END IF;
    IF _line < 0 THEN
      RAISE EXCEPTION 'جمع آیتم نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
    END IF;
    IF _disc > _qty * _price THEN
      RAISE EXCEPTION 'تخفیف نمی‌تواند بیشتر از مبلغ آیتم باشد.' USING ERRCODE = '22023';
    END IF;
    IF _src NOT IN ('product_price','quick_price','manual') THEN
      RAISE EXCEPTION 'منبع آیتم نامعتبر است: %', COALESCE(_src,'(null)') USING ERRCODE = '22023';
    END IF;

    IF _src = 'product_price' THEN
      _pid := NULLIF(_item->>'product_id','')::uuid;
      _sptid := NULLIF(_item->>'sale_price_type_id','')::uuid;
      _label := COALESCE(NULLIF(_item->>'title_snapshot',''), 'محصول');
      IF _pid IS NULL THEN
        RAISE EXCEPTION 'شناسه محصول برای آیتم «%» مشخص نیست.', _label USING ERRCODE = '22023';
      END IF;
      IF _sptid IS NOT NULL THEN
        SELECT c.rounded_sale_price INTO _floor
        FROM public.product_computed_prices c
        WHERE c.product_id = _pid
          AND c.sale_price_type_id = _sptid
          AND c.settlement_type_id IS NOT DISTINCT FROM p_settlement_type_id
        ORDER BY c.computed_at DESC
        LIMIT 1;

        _effective := (_qty * _price - _disc) / _qty;
        IF _floor IS NOT NULL AND _effective < _floor THEN
          IF NOT COALESCE(p_below_list_ack, false) THEN
            RAISE EXCEPTION 'قیمت وارد شده برای «%» از کف مجاز تسویهٔ % (%) کمتر است.',
              _label, COALESCE(_settlement_label, 'پایه'), _floor
              USING ERRCODE = '22023';
          END IF;
          _went_below := true;
          IF _worst_floor IS NULL OR _floor > _worst_floor THEN
            _worst_floor := _floor;
          END IF;
        END IF;
      END IF;
    END IF;

    _items_count := _items_count + 1;
    _sum_subtotal := _sum_subtotal + (_qty * _price);
    _sum_discount := _sum_discount + _disc;
    _sum_final := _sum_final + _line;

    IF _src = 'product_price' THEN _src_product := _src_product + 1;
    ELSIF _src = 'quick_price' THEN _src_quick := _src_quick + 1;
    ELSE _src_manual := _src_manual + 1;
    END IF;
  END LOOP;

  IF abs(COALESCE(p_subtotal_amount,0) - _sum_subtotal) > 1
     OR abs(COALESCE(p_discount_amount,0) - _sum_discount) > 1
     OR abs(COALESCE(p_final_amount,0) - _sum_final) > 1 THEN
    RAISE EXCEPTION 'مجموع مبالغ ارسالی با مجموع آیتم‌ها همخوانی ندارد.' USING ERRCODE = '22023';
  END IF;

  -- 215 — creation deliberately does not validate stock.
  -- Stock is checked only when status changes to accepted/finalized by
  -- trg_sales_quotes_stock_out -> apply_stock_movement. That path keeps row
  -- locking and rejects insufficient stock transactionally.

  -- 212 — strict credit/overdue/accounting paths.
  IF p_customer_id IS NULL THEN
    IF p_quote_exception_type IS DISTINCT FROM 'accounting_approval' THEN
      RAISE EXCEPTION 'این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست و بدون تأیید حسابداری قابل ثبت نیست.'
        USING ERRCODE = '22023';
    END IF;
    _credit_snapshot := jsonb_build_object('mode', 'guest_accounting_approval', 'checked', false);
  ELSE
    SELECT * INTO _credit
    FROM public.get_customer_dynamic_credit(p_customer_id);

    IF COALESCE(_credit.has_overdue, false) OR COALESCE(_credit.binding_constraint, '') = 'overdue' THEN
      IF p_quote_exception_type IS DISTINCT FROM 'overdue_salesperson_commitment' THEN
        RAISE EXCEPTION 'مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست؛ فقط با تعهد کارشناس فروش و تعیین مهلت تسویه امکان ادامه وجود دارد.'
          USING ERRCODE = '22023';
      END IF;
      _credit_snapshot := jsonb_build_object(
        'mode', 'overdue_salesperson_commitment',
        'checked', true,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final,
        'overdue_since', _credit.overdue_since,
        'minutes', p_quote_exception_minutes
      );
    ELSIF _credit IS NULL OR NOT COALESCE(_credit.has_allocation, false)
          OR COALESCE(_credit.available_credit, 0) <= 0 THEN
      IF p_quote_exception_type IS DISTINCT FROM 'accounting_approval' THEN
        RAISE EXCEPTION 'برای این مشتری اعتبار قابل استفاده ثبت نشده است. ثبت بدون بیعانه فقط با تأیید حسابداری مجاز است.'
          USING ERRCODE = '22023';
      END IF;
      _credit_snapshot := jsonb_build_object(
        'mode', 'no_credit_accounting_approval',
        'checked', true,
        'customer_id', p_customer_id,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final
      );
    ELSIF COALESCE(_credit.available_credit, 0) >= _sum_final THEN
      _credit_snapshot := jsonb_build_object(
        'mode', 'credit_ok',
        'checked', true,
        'available_credit', _credit.available_credit,
        'required', _sum_final
      );
    ELSE
      IF p_quote_exception_type IS DISTINCT FROM 'credit_shortfall_salesperson_commitment' THEN
        RAISE EXCEPTION
          'مبلغ پیش‌فاکتور بیشتر از اعتبار مشتری است (اعتبار قابل استفاده: % تومان، مبلغ پیش‌فاکتور: % تومان). ثبت عادی مجاز نیست.',
          COALESCE(_credit.available_credit, 0), _sum_final
          USING ERRCODE = '22023';
      END IF;
      IF abs(COALESCE(p_quote_exception_amount, -1) - GREATEST(_sum_final - COALESCE(_credit.available_credit, 0), 0)) > 1 THEN
        RAISE EXCEPTION 'مبلغ کسری اعتبار ثبت‌شده با کسری محاسبه‌شده همخوانی ندارد.'
          USING ERRCODE = '22023';
      END IF;

      _credit_snapshot := jsonb_build_object(
        'mode', 'credit_shortfall_salesperson_commitment',
        'checked', true,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final,
        'shortfall', GREATEST(_sum_final - COALESCE(_credit.available_credit, 0), 0)
      );
    END IF;
  END IF;

  IF p_quote_exception_type IS NOT NULL THEN
    _exception_snapshot := jsonb_build_object(
      'type', p_quote_exception_type,
      'minutes', p_quote_exception_minutes,
      'amount', p_quote_exception_amount,
      'text', p_quote_exception_text,
      'confirmed_by', _uid,
      'confirmed_at', now()
    );
  END IF;

  INSERT INTO public.sales_quotes (
    customer_name, customer_phone, customer_note, expires_at,
    subtotal_amount, discount_amount, final_amount,
    salesperson_id, quote_number, settlement_type_id, customer_id,
    below_list_price_ack, below_list_price_ack_at, below_list_price_ack_by,
    list_price_snapshot, deposit_amount, commitment_confirmed, credit_check_snapshot,
    visitor_id, warehouse_id,
    quote_exception_type, quote_exception_confirmed_at, quote_exception_confirmed_by,
    quote_exception_minutes, quote_exception_amount, quote_exception_text,
    quote_exception_snapshot
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_note,'')),''),
    p_expires_at,
    _sum_subtotal, _sum_discount, _sum_final,
    _uid, '', p_settlement_type_id, p_customer_id,
    _went_below,
    CASE WHEN _went_below THEN now() ELSE NULL END,
    CASE WHEN _went_below THEN _uid ELSE NULL END,
    _worst_floor,
    p_deposit_amount,
    COALESCE(p_commitment_confirmed, false),
    _credit_snapshot,
    p_visitor_id, _wh,
    p_quote_exception_type,
    CASE WHEN p_quote_exception_type IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_quote_exception_type IS NOT NULL THEN _uid ELSE NULL END,
    p_quote_exception_minutes,
    p_quote_exception_amount,
    p_quote_exception_text,
    _exception_snapshot
  )
  RETURNING id, quote_number INTO _quote_id, _quote_number;

  INSERT INTO public.sales_quote_items (
    quote_id, product_id, free_item_name, sku_snapshot, title_snapshot,
    sale_price_type_id, quantity, unit_price, discount_amount, line_total, source,
    warehouse_id
  )
  SELECT
    _quote_id,
    NULLIF(elem->>'product_id','')::uuid,
    NULLIF(elem->>'free_item_name',''),
    NULLIF(elem->>'sku_snapshot',''),
    NULLIF(elem->>'title_snapshot',''),
    NULLIF(elem->>'sale_price_type_id','')::uuid,
    (elem->>'quantity')::numeric,
    (elem->>'unit_price')::numeric,
    COALESCE((elem->>'discount_amount')::numeric, 0),
    (elem->>'line_total')::numeric,
    (elem->>'source')::sales_quote_item_source,
    NULLIF(elem->>'warehouse_id','')::uuid
  FROM jsonb_array_elements(p_items) AS elem;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quotes', _quote_id::text, 'sales_quote_items_added',
    jsonb_build_object(
      'quote_id', _quote_id,
      'item_count', _items_count,
      'settlement_type_id', p_settlement_type_id,
      'visitor_id', p_visitor_id,
      'warehouse_id', _wh,
      'subtotal_from_items', round(_sum_subtotal),
      'discount_from_items', round(_sum_discount),
      'final_from_items', round(_sum_final),
      'below_list_price_ack', _went_below,
      'list_price_snapshot', _worst_floor,
      'credit_check', _credit_snapshot,
      'quote_exception', _exception_snapshot,
      'sources_count', jsonb_build_object(
        'product_price', _src_product,
        'quick_price', _src_quick,
        'manual', _src_manual
      )
    ));

  RETURN jsonb_build_object('id', _quote_id, 'quote_number', _quote_number);
END;
$function$

;
