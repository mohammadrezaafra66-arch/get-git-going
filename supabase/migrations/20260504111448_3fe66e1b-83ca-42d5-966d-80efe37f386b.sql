-- ============================================================
-- Invoice price bounds: floor (per-type & absolute) + 5% cap
-- ============================================================

-- 1) RPC: bounds for a (product, sale_price_type) pair
CREATE OR REPLACE FUNCTION public.get_product_price_bounds(
  _product_id uuid,
  _sale_price_type_id uuid DEFAULT NULL
)
RETURNS TABLE (
  min_price numeric,
  max_price numeric,
  cap_price numeric,
  selected_price numeric,
  has_any boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min numeric;
  v_max numeric;
  v_sel numeric;
BEGIN
  -- Latest price per active sale_price_type for this product
  WITH latest_per_type AS (
    SELECT DISTINCT ON (h.sale_price_type_id)
      h.sale_price_type_id,
      h.new_sale_price
    FROM public.product_sale_price_history h
    JOIN public.sale_price_types t ON t.id = h.sale_price_type_id
    WHERE h.product_id = _product_id
      AND t.is_active = true
      AND h.new_sale_price IS NOT NULL
      AND h.new_sale_price > 0
    ORDER BY h.sale_price_type_id, h.created_at DESC
  )
  SELECT MIN(new_sale_price), MAX(new_sale_price)
  INTO v_min, v_max
  FROM latest_per_type;

  IF _sale_price_type_id IS NOT NULL THEN
    SELECT new_sale_price
    INTO v_sel
    FROM public.product_sale_price_history
    WHERE product_id = _product_id
      AND sale_price_type_id = _sale_price_type_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    v_min,
    v_max,
    CASE WHEN v_max IS NULL THEN NULL ELSE round(v_max * 1.05) END,
    v_sel,
    (v_min IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_price_bounds(uuid, uuid) TO authenticated;

-- 2) Validation trigger on invoice_items (defense-in-depth)
CREATE OR REPLACE FUNCTION public.validate_invoice_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_bounds RECORD;
  v_product_name text;
  v_msg text;
BEGIN
  SELECT id, type, sale_price_type_id, customer_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- Only enforce on pre_invoice
  IF v_invoice.type IS DISTINCT FROM 'pre_invoice' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN
    RAISE EXCEPTION 'قیمت واحد ردیف معتبر نیست.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
  v_product_name := COALESCE(v_product_name, '—');

  SELECT * INTO v_bounds
  FROM public.get_product_price_bounds(NEW.product_id, v_invoice.sale_price_type_id);

  IF NOT v_bounds.has_any THEN
    v_msg := format('برای محصول «%s» هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.', v_product_name);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','no_price','product_id',NEW.product_id,'attempted',NEW.unit_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price < v_bounds.min_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از کمترین قیمت فروش ثبت‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.min_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_min','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'min',v_bounds.min_price,'max',v_bounds.max_price,
        'cap',v_bounds.cap_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF v_bounds.selected_price IS NOT NULL AND NEW.unit_price < v_bounds.selected_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از قیمت قانون نوع قیمت انتخاب‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.selected_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_selected','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price > v_bounds.cap_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) بیش از سقف مجاز (%s = ۱.۰۵×بالاترین قیمت) است.',
      v_product_name, NEW.unit_price::text, v_bounds.cap_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','above_cap','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'cap',v_bounds.cap_price,'max',v_bounds.max_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_items_validate_price ON public.invoice_items;
CREATE TRIGGER invoice_items_validate_price
  BEFORE INSERT OR UPDATE OF unit_price, product_id, invoice_id
  ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_item_price();