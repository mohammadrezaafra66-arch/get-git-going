SET
Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.check_quote_stock_availability(_quote_id uuid, _warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, product_name text, required numeric, available numeric, is_sufficient boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH wh AS (
    SELECT COALESCE(
      _warehouse_id,
      (SELECT q.warehouse_id FROM public.sales_quotes q WHERE q.id = _quote_id),
      public.default_warehouse_id()
    ) AS id
  ), need AS (
    SELECT sqi.product_id, SUM(sqi.quantity) AS required
      FROM public.sales_quote_items sqi
     WHERE sqi.quote_id = _quote_id AND sqi.product_id IS NOT NULL
     GROUP BY sqi.product_id
  )
  SELECT
    n.product_id,
    p.name AS product_name,
    n.required,
    COALESCE(ws.quantity, 0) AS available,
    COALESCE(ws.quantity, 0) >= n.required AS is_sufficient
  FROM need n
  JOIN public.products p ON p.id = n.product_id
  CROSS JOIN wh
  LEFT JOIN public.warehouse_stock ws
         ON ws.product_id = n.product_id AND ws.warehouse_id = wh.id
  ORDER BY (COALESCE(ws.quantity, 0) >= n.required), p.name;
$function$



CREATE OR REPLACE FUNCTION public.default_warehouse_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.warehouses
   WHERE is_active AND is_default
   ORDER BY created_at
   LIMIT 1;
$function$



CREATE OR REPLACE FUNCTION public.trg_purchase_item_stock_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wh uuid;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.warehouse_id, public.default_warehouse_id())
    INTO _wh
    FROM public.purchases p
   WHERE p.id = NEW.purchase_id;

  -- انباری تعریف نشده = مدل چندانباره هنوز راه‌اندازی نشده؛ خرید را نشکن.
  IF _wh IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.apply_stock_movement(
    NEW.product_id, _wh, 'in', NEW.quantity,
    'purchase', NEW.purchase_id, NULL, 'افزایش موجودی از خرید', NULL
  );

  RETURN NEW;
END;
$function$



CREATE OR REPLACE FUNCTION public.trg_sales_quote_stock_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wh uuid;
  _item record;
BEGIN
  _wh := COALESCE(NEW.warehouse_id, public.default_warehouse_id());

  -- انباری تعریف نشده = مدل چندانباره راه‌اندازی نشده؛ رفتار قبلی حفظ شود.
  IF _wh IS NULL THEN
    RETURN NEW;
  END IF;

  -- محافظت از دوباره‌کسر: اگر برای این پیش‌فاکتور قبلاً کاردکس out ثبت شده، رد شو.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
     WHERE ref_type = 'sale_quote_confirm' AND ref_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  FOR _item IN
    SELECT product_id, SUM(quantity) AS qty
      FROM public.sales_quote_items
     WHERE quote_id = NEW.id AND product_id IS NOT NULL
     GROUP BY product_id
  LOOP
    IF COALESCE(_item.qty, 0) > 0 THEN
      PERFORM public.apply_stock_movement(
        _item.product_id, _wh, 'out', _item.qty,
        'sale_quote_confirm', NEW.id, NULL, 'کسر موجودی از قطعی‌کردن پیش‌فاکتور', NULL
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$



