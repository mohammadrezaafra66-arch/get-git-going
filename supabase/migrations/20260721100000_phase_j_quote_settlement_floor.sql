-- =====================================================================
-- Migration: phase_j_quote_settlement_floor  (Phase J)
--
-- 1) sales_quotes gains settlement_type_id (nullable FK). Existing quotes stay
--    NULL (they were created before this feature) and remain viewable/editable.
-- 2) create_sales_quote_with_items gains p_settlement_type_id and enforces a
--    per-settlement PRICE FLOOR inside the atomic RPC.
--
-- CONFLICT RESOLVED: the previous version validated product_price items against
--   get_product_price_bounds (product_sale_price_history, base-only). Settlement
--   terms can legitimately be priced BELOW base (e.g. cash < cheque), which the
--   base bounds wrongly rejected. Phase J's settlement-aware floor SUPERSEDES
--   the earlier lower-bound checks: the floor is now
--   product_computed_prices.rounded_sale_price for (product, item's
--   sale_price_type, the quote's settlement). No computed price for that term →
--   NO floor (item is saved, not rejected). manual / quick_price items are
--   exempt. Validation lives in the RPC (not just the form). Whole insert is
--   one transaction, so a rejected item leaves NO partial record.
--
-- Backward compatible: p_settlement_type_id DEFAULTs to NULL, so a caller that
-- omits it (old bundle, pre-redeploy) resolves to the same function and gets a
-- base-term quote. Idempotent. supabase_admin on DB `afrakala`.
-- After applying: docker restart afrakala-lan-rest + patch types.ts.
-- Backup: D:\AfraKalaTest\backup_pre_J.sql
-- =====================================================================

-- ---------- 1) schema ----------
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;

ALTER TABLE public.sales_quotes
  DROP CONSTRAINT IF EXISTS sales_quotes_settlement_fkey;
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT sales_quotes_settlement_fkey
  FOREIGN KEY (settlement_type_id) REFERENCES public.settlement_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_settlement
  ON public.sales_quotes (settlement_type_id);

-- ---------- 2) RPC (drop old 8-arg, create 9-arg) ----------
DROP FUNCTION IF EXISTS public.create_sales_quote_with_items(
  text, text, text, timestamptz, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_customer_note text,
  p_expires_at timestamptz,
  p_subtotal_amount numeric,
  p_discount_amount numeric,
  p_final_amount numeric,
  p_items jsonb,
  p_settlement_type_id uuid DEFAULT NULL
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
  _pid uuid;
  _sptid uuid;
  _label text;
  _floor numeric;
  _settlement_label text;
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
        IF _floor IS NOT NULL AND _price < _floor THEN
          RAISE EXCEPTION 'قیمت وارد شده برای «%» از کف مجاز تسویهٔ % (%) کمتر است.',
            _label, COALESCE(_settlement_label, 'پایه'), _floor
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
    salesperson_id, quote_number, settlement_type_id
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_note,'')),''),
    p_expires_at,
    _sum_subtotal, _sum_discount, _sum_final,
    _uid, '', p_settlement_type_id
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
      'sources_count', jsonb_build_object(
        'product_price', _src_product,
        'quick_price', _src_quick,
        'manual', _src_manual
      )
    ));

  RETURN jsonb_build_object('id', _quote_id, 'quote_number', _quote_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_quote_with_items(
  text,text,text,timestamptz,numeric,numeric,numeric,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_quote_with_items(
  text,text,text,timestamptz,numeric,numeric,numeric,jsonb,uuid) TO authenticated;
