-- 222 — Items 194/196 (below-list override) and 197/198 (credit + deposit).
--
-- Both change the signature of create_sales_quote_with_items, so they land in
-- one migration and the function is replaced exactly once.
--
-- 194/196: the settlement price floor already existed and blocked hard, with
-- no way through. It also only ever checked unit_price, while the discount
-- column is editable by every role and sales_quote_items carries no trigger --
-- so the floor could be walked straight around by pricing at the floor and
-- discounting underneath it. The floor now applies to the effective line
-- price, and the only way below it is an explicit, recorded acknowledgement.
--
-- 197/198: issuing against insufficient credit is refused unless a deposit of
-- at least 30% is taken and the salesperson confirms responsibility for it.
SET client_encoding='UTF8';

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS below_list_price_ack     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS below_list_price_ack_at  timestamptz,
  ADD COLUMN IF NOT EXISTS below_list_price_ack_by  uuid,
  ADD COLUMN IF NOT EXISTS list_price_snapshot      numeric,
  ADD COLUMN IF NOT EXISTS deposit_amount           numeric,
  ADD COLUMN IF NOT EXISTS commitment_confirmed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_check_snapshot    jsonb;

COMMENT ON COLUMN public.sales_quotes.below_list_price_ack IS
  'پیش‌فاکتور زیر کف قیمت لیست، با مسئولیت شخصی صادرکننده صادر شده است (نیازمندی ۱۹۴/۱۹۶).';
COMMENT ON COLUMN public.sales_quotes.list_price_snapshot IS
  'کف مجاز همان لحظه، برای اینکه بعداً بشود فهمید چقدر زیر لیست فروخته شده.';
COMMENT ON COLUMN public.sales_quotes.deposit_amount IS
  'مبلغ بیعانه دریافتی هنگام صدور بدون اعتبار کافی (نیازمندی ۱۹۷/۱۹۸).';
COMMENT ON COLUMN public.sales_quotes.credit_check_snapshot IS
  'نتیجهٔ بررسی اعتبار در لحظهٔ صدور: مسیر انتخاب‌شده و اعداد آن.';

-- The three new parameters carry defaults, so CREATE OR REPLACE would ADD an
-- overload rather than replace the function. Both would then match the app's
-- ten-argument call and PostgreSQL would refuse it as ambiguous, breaking
-- quote creation outright. Retire the old signature first.
DROP FUNCTION IF EXISTS public.create_sales_quote_with_items(
  text, text, text, timestamp with time zone, numeric, numeric, numeric, jsonb, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_customer_note text,
  p_expires_at timestamp with time zone,
  p_subtotal_amount numeric,
  p_discount_amount numeric,
  p_final_amount numeric,
  p_items jsonb,
  p_settlement_type_id uuid DEFAULT NULL::uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_below_list_ack boolean DEFAULT false,
  p_deposit_amount numeric DEFAULT NULL::numeric,
  p_commitment_confirmed boolean DEFAULT false
)
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
  _min_deposit numeric;
  _credit_snapshot jsonb := NULL;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ایجاد پیش‌فاکتور را ندارید.' USING ERRCODE = '42501';
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

  -- Settlement label for the floor message; validate the id (NULL = base term).
  IF p_settlement_type_id IS NOT NULL THEN
    SELECT title INTO _settlement_label
    FROM public.settlement_types WHERE id = p_settlement_type_id AND is_active = true;
    IF _settlement_label IS NULL THEN
      RAISE EXCEPTION 'نوع تسویهٔ انتخاب‌شده معتبر یا فعال نیست.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate items + compute sums
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

    -- ===== Phase J: settlement price-floor (product_price items only) =====
    IF _src = 'product_price' THEN
      _pid := NULLIF(_item->>'product_id','')::uuid;
      _sptid := NULLIF(_item->>'sale_price_type_id','')::uuid;
      _label := COALESCE(NULLIF(_item->>'title_snapshot',''), 'محصول');
      IF _pid IS NOT NULL AND _sptid IS NOT NULL THEN
        SELECT c.rounded_sale_price INTO _floor
        FROM public.product_computed_prices c
        WHERE c.product_id = _pid
          AND c.sale_price_type_id = _sptid
          AND c.settlement_type_id IS NOT DISTINCT FROM p_settlement_type_id
        ORDER BY c.computed_at DESC
        LIMIT 1;

        -- Items 194/196 — compare the EFFECTIVE price per unit, not the sticker
        -- price. Checking unit_price alone left the line discount as an
        -- unguarded way under the floor.
        _effective := (_qty * _price - _disc) / _qty;

        IF _floor IS NOT NULL AND _effective < _floor THEN
          IF NOT COALESCE(p_below_list_ack, false) THEN
            RAISE EXCEPTION 'قیمت وارد شده برای «%» از کف مجاز تسویهٔ % (%) کمتر است.',
              _label, COALESCE(_settlement_label, 'پایه'), _floor
              USING ERRCODE = '22023';
          END IF;
          -- Acknowledged: allow it, but remember it happened and how far down
          -- it went, so the decision stays auditable.
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

  -- Compare with provided totals (1 toman tolerance)
  IF abs(COALESCE(p_subtotal_amount,0) - _sum_subtotal) > 1
     OR abs(COALESCE(p_discount_amount,0) - _sum_discount) > 1
     OR abs(COALESCE(p_final_amount,0) - _sum_final) > 1 THEN
    RAISE EXCEPTION 'مجموع مبالغ ارسالی با مجموع آیتم‌ها همخوانی ندارد.' USING ERRCODE = '22023';
  END IF;

  -- ===== Items 197/198: customer credit, or a deposit instead =====
  --
  -- Two deliberate exemptions, both recorded in credit_check_snapshot:
  --
  --   * A guest quote (no p_customer_id) has no credit file to read, so there
  --     is nothing to check. It is allowed and marked as such.
  --   * A customer with no capital allocation yet has no configured limit.
  --     get_customer_dynamic_credit reports available_credit = 0 for them,
  --     which is the absence of a limit, not a limit of zero -- treating it as
  --     a limit would demand a deposit on every sale to every customer. The
  --     rule arms itself automatically once allocations are configured.
  _min_deposit := ceil(_sum_final * 0.3);

  IF p_customer_id IS NULL THEN
    _credit_snapshot := jsonb_build_object('mode', 'guest', 'checked', false);
  ELSE
    SELECT * INTO _credit
    FROM public.get_customer_dynamic_credit(p_customer_id);

    IF _credit IS NULL OR NOT COALESCE(_credit.has_allocation, false) THEN
      _credit_snapshot := jsonb_build_object(
        'mode', 'no_allocation', 'checked', false, 'customer_id', p_customer_id);
    ELSIF COALESCE(_credit.available_credit, 0) >= _sum_final THEN
      _credit_snapshot := jsonb_build_object(
        'mode', 'credit_ok', 'checked', true,
        'available_credit', _credit.available_credit,
        'required', _sum_final);
    ELSE
      -- Insufficient credit: the deposit path is the only way through, and it
      -- is enforced here rather than only in the form so it cannot be skipped.
      IF COALESCE(p_deposit_amount, 0) <= 0 THEN
        RAISE EXCEPTION
          'اعتبار مشتری برای این مبلغ کافی نیست (اعتبار قابل استفاده: % تومان). برای صدور، مبلغ بیعانه را وارد کنید.',
          COALESCE(_credit.available_credit, 0)
          USING ERRCODE = '22023';
      END IF;
      IF p_deposit_amount < _min_deposit THEN
        RAISE EXCEPTION
          'مبلغ بیعانه باید حداقل ۳۰٪ مبلغ کل (% تومان) باشد.', _min_deposit
          USING ERRCODE = '22023';
      END IF;
      IF NOT COALESCE(p_commitment_confirmed, false) THEN
        RAISE EXCEPTION 'تأیید تعهد فروشنده برای دریافت بیعانه الزامی است.'
          USING ERRCODE = '22023';
      END IF;
      _credit_snapshot := jsonb_build_object(
        'mode', 'deposit', 'checked', true,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final,
        'deposit', p_deposit_amount,
        'min_deposit', _min_deposit);
    END IF;
  END IF;

  -- Insert quote (trigger assigns quote_number + salesperson_id)
  INSERT INTO public.sales_quotes (
    customer_name, customer_phone, customer_note, expires_at,
    subtotal_amount, discount_amount, final_amount,
    salesperson_id, quote_number, settlement_type_id, customer_id,
    below_list_price_ack, below_list_price_ack_at, below_list_price_ack_by,
    list_price_snapshot, deposit_amount, commitment_confirmed, credit_check_snapshot
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
    _credit_snapshot
  )
  RETURNING id, quote_number INTO _quote_id, _quote_number;

  -- Insert items
  INSERT INTO public.sales_quote_items (
    quote_id, product_id, free_item_name, sku_snapshot, title_snapshot,
    sale_price_type_id, quantity, unit_price, discount_amount, line_total, source
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
    (elem->>'source')::sales_quote_item_source
  FROM jsonb_array_elements(p_items) AS elem;

  -- Supplemental audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quotes', _quote_id::text, 'sales_quote_items_added',
    jsonb_build_object(
      'quote_id', _quote_id,
      'item_count', _items_count,
      'settlement_type_id', p_settlement_type_id,
      'subtotal_from_items', round(_sum_subtotal),
      'discount_from_items', round(_sum_discount),
      'final_from_items', round(_sum_final),
      'below_list_price_ack', _went_below,
      'list_price_snapshot', _worst_floor,
      'credit_check', _credit_snapshot,
      'sources_count', jsonb_build_object(
        'product_price', _src_product,
        'quick_price', _src_quick,
        'manual', _src_manual
      )
    ));

  RETURN jsonb_build_object('id', _quote_id, 'quote_number', _quote_number);
END;
$function$;
