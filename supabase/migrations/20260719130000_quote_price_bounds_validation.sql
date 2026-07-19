-- =====================================================================
-- Migration: quote_price_bounds_validation
-- Purpose : Bring the quote-creation RPC to parity with InvoiceForm's
--           PRICE-BOUNDS validation (the only InvoiceForm validation that is
--           portable without a schema change).
--
-- Context: `/sales/quotes` (sales_quotes) is the official pre-invoice path.
--   InvoiceForm (`/sales/invoices`) enforced per-item price bounds via
--   get_product_price_bounds (min / rule-selected / cap = 1.05×max), but the
--   quote RPC did NOT. This ports that exact check INTO the RPC so it is
--   enforced server-side for every quote, not just in the UI.
--
-- NOT included here (require structural changes — deferred by product decision):
--   * Customer credit limit  — needs a customer_id on sales_quotes
--     (get_customer_dynamic_credit / can_issue_customer_invoice take uuid);
--     quotes store free-text customer_name/phone only.
--   * Settlement compatibility — quotes capture no settlement_type_id.
--   * Capital-allocation "capacity" — is customer_id-based.
--
-- Scope of check: applied ONLY to items with source='product_price' that carry
--   a product_id. Free items (source in ('manual','quick_price')) keep their
--   manual price untouched (no product to bound against).
--
-- Existing data: this is an INSERT-time guard inside the RPC; it does NOT run
--   against the 2 existing quotes and does NOT invalidate them retroactively.
--
-- Idempotent: CREATE OR REPLACE (same signature — no types.ts change needed).
-- After applying: docker restart afrakala-lan-rest
-- Connect as: supabase_admin on DB `afrakala`.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_customer_note text,
  p_expires_at timestamptz,
  p_subtotal_amount numeric,
  p_discount_amount numeric,
  p_final_amount numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- price-bounds locals (new)
  _pid uuid;
  _sptid uuid;
  _b_min numeric;
  _b_sel numeric;
  _b_cap numeric;
  _b_has boolean;
  _label text;
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

    -- ===== Price-bounds validation (parity with InvoiceForm) =====
    -- Only for real-product items; free/manual items keep their manual price.
    IF _src = 'product_price' THEN
      _pid := NULLIF(_item->>'product_id','')::uuid;
      _sptid := NULLIF(_item->>'sale_price_type_id','')::uuid;
      IF _pid IS NOT NULL THEN
        _label := COALESCE(NULLIF(_item->>'title_snapshot',''), 'محصول');
        SELECT b.min_price, b.selected_price, b.cap_price, b.has_any
          INTO _b_min, _b_sel, _b_cap, _b_has
          FROM public.get_product_price_bounds(_pid, _sptid) AS b;

        IF NOT COALESCE(_b_has, false) THEN
          RAISE EXCEPTION 'برای «%» هنوز قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.', _label
            USING ERRCODE = '22023';
        END IF;
        IF _b_min IS NOT NULL AND _price < _b_min THEN
          RAISE EXCEPTION 'قیمت «%» (%) از کمترین قیمت فروش ثبت‌شده (%) کمتر است.', _label, _price, _b_min
            USING ERRCODE = '22023';
        END IF;
        IF _b_sel IS NOT NULL AND _price < _b_sel THEN
          RAISE EXCEPTION 'قیمت «%» (%) از قیمت قانون نوع قیمت انتخاب‌شده (%) کمتر است.', _label, _price, _b_sel
            USING ERRCODE = '22023';
        END IF;
        IF _b_cap IS NOT NULL AND _price > _b_cap THEN
          RAISE EXCEPTION 'قیمت «%» (%) بیش از سقف مجاز (% = ۱.۰۵×بالاترین قیمت) است.', _label, _price, _b_cap
            USING ERRCODE = '22023';
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

  -- Insert quote (trigger assigns quote_number + salesperson_id)
  INSERT INTO public.sales_quotes (
    customer_name, customer_phone, customer_note, expires_at,
    subtotal_amount, discount_amount, final_amount,
    salesperson_id, quote_number
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_note,'')),''),
    p_expires_at,
    _sum_subtotal, _sum_discount, _sum_final,
    _uid, ''
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
      'subtotal_from_items', round(_sum_subtotal),
      'discount_from_items', round(_sum_discount),
      'final_from_items', round(_sum_final),
      'sources_count', jsonb_build_object(
        'product_price', _src_product,
        'quick_price', _src_quick,
        'manual', _src_manual
      )
    ));

  RETURN jsonb_build_object('id', _quote_id, 'quote_number', _quote_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_quote_with_items(text,text,text,timestamptz,numeric,numeric,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_quote_with_items(text,text,text,timestamptz,numeric,numeric,numeric,jsonb) TO authenticated;
