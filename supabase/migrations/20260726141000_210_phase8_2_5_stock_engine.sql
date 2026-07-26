-- Phase 8.2–8.5 — موتور حرکت موجودی
--   ۸.۲ افزایش موجودی هنگام خرید (۱۷۳)
--   ۸.۳ کسر موجودی هنگام قطعی‌کردن پیش‌فاکتور + چک موجودی پیش از قطعی (۱۷۴/۱۷۵)
--   ۸.۴ انتقال بین‌انباری (۱۷۷)
--   ۸.۵ همگام‌سازی `products.stock_status` با موجودی عددی
--
-- قاعدهٔ مرکزی: هیچ‌کس مستقیم `warehouse_stock` را دست نمی‌زند. همه از
-- `apply_stock_movement()` رد می‌شوند تا موجودی و کاردکس همیشه یکی بمانند.

BEGIN;

-- ===========================================================================
-- ۸.۲.۰ انبار مقصد خرید (ستون nullable طبق پلن)
-- ===========================================================================
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchases.warehouse_id IS
  'انبار مقصد خرید (۱۷۳). تهی = انبار پیش‌فرض.';

-- انبار انتخاب‌شده در پیش‌فاکتور (۱۷۸) و امکان تغییرش هنگام قطعی (۱۷۹)
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales_quotes.warehouse_id IS
  'انباری که کالا از آن کسر می‌شود (۱۷۸/۱۷۹). تهی = انبار پیش‌فرض.';

-- ===========================================================================
-- ۸.۲.۱ اثر علامت‌دار حرکت روی کاردکس
--   `quantity` همیشه مثبت است (CHECK فاز ۸.۱) و جهت از `movement_type` می‌آید.
--   ولی نوع 'adjust' هر دو جهت را دارد (تعدیل به بالا یا پایین)، پس فقط با
--   movement_type قابل تفسیر نیست. `delta` اثر علامت‌دار را نگه می‌دارد تا
--   کاردکس برای هر پنج نوع خودتوصیف باشد و گزارش‌ها لازم نباشد جهت را حدس بزنند.
-- ===========================================================================
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS delta numeric;

COMMENT ON COLUMN public.stock_movements.delta IS
  'اثر علامت‌دار این حرکت روی موجودی انبار (منفی = کاهش). quantity همیشه abs(delta) است.';

-- ===========================================================================
-- ۸.۵ همگام‌سازی stock_status متنی با موجودی عددی
--     کل UI فعلی روی stock_status سوار است، پس این اتصال حیاتی است.
--     مهم: محصولاتی که هیچ ردیف warehouse_stock ندارند دست‌نخورده می‌مانند
--     (وضعیت دستی‌شان حفظ می‌شود) تا داده‌های موجود تخریب نشود.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.sync_product_stock_status(_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _total numeric;
  _rows int;
BEGIN
  SELECT COALESCE(SUM(quantity), 0), COUNT(*)
    INTO _total, _rows
    FROM public.warehouse_stock
   WHERE product_id = _product_id;

  -- محصول بدون هیچ ردیف انباری = هنوز وارد مدل چندانباره نشده؛ دست نزن.
  IF _rows = 0 THEN
    RETURN;
  END IF;

  UPDATE public.products
     SET stock_status = CASE
           WHEN _total > 0 THEN 'available'::public.stock_status
           ELSE 'unavailable'::public.stock_status
         END
   WHERE id = _product_id
     AND stock_status IS DISTINCT FROM CASE
           WHEN _total > 0 THEN 'available'::public.stock_status
           ELSE 'unavailable'::public.stock_status
         END;
END;
$function$;

-- ===========================================================================
-- هستهٔ حرکت موجودی — تنها نقطهٔ نوشتن روی warehouse_stock
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  _product_id uuid,
  _warehouse_id uuid,
  _movement_type text,
  _quantity numeric,
  _ref_type text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _related_warehouse_id uuid DEFAULT NULL,
  _note text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _delta numeric;
  _current numeric;
  _movement_id uuid;
  _product_name text;
  _warehouse_name text;
BEGIN
  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'انبار مشخص نشده است.' USING ERRCODE = '22023';
  END IF;
  IF _quantity IS NULL THEN
    RAISE EXCEPTION 'مقدار حرکت کالا مشخص نشده است.' USING ERRCODE = '22023';
  END IF;

  -- 'adjust' تنها نوعی است که مقدار علامت‌دار می‌گیرد (تعدیل به بالا یا پایین).
  -- بقیهٔ انواع جهتشان از movement_type می‌آید، پس مقدار باید مثبت باشد.
  IF _movement_type = 'adjust' THEN
    IF _quantity = 0 THEN
      RAISE EXCEPTION 'تعدیل با مقدار صفر بی‌اثر است.' USING ERRCODE = '22023';
    END IF;
    _delta := _quantity;
  ELSIF _movement_type IN ('in','transfer_in') THEN
    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'مقدار حرکت کالا باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    _delta := _quantity;
  ELSIF _movement_type IN ('out','transfer_out') THEN
    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'مقدار حرکت کالا باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    _delta := -_quantity;
  ELSE
    RAISE EXCEPTION 'نوع حرکت کالا نامعتبر است: %', _movement_type USING ERRCODE = '22023';
  END IF;

  -- ردیف موجودی را قطعی کن و قفل بگیر (جلوگیری از race در کسر همزمان)
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (_warehouse_id, _product_id, 0)
  ON CONFLICT (warehouse_id, product_id) DO NOTHING;

  SELECT quantity INTO _current
    FROM public.warehouse_stock
   WHERE warehouse_id = _warehouse_id AND product_id = _product_id
   FOR UPDATE;

  -- ۱۷۵ — کسر بیش از موجودی مجاز نیست، با پیام فارسی روشن.
  IF _current + _delta < 0 THEN
    SELECT name INTO _product_name FROM public.products WHERE id = _product_id;
    SELECT name INTO _warehouse_name FROM public.warehouses WHERE id = _warehouse_id;
    RAISE EXCEPTION
      'موجودی کافی نیست: «%» در انبار «%» فقط % عدد موجود دارد و درخواست % عدد است.',
      COALESCE(_product_name, '؟'), COALESCE(_warehouse_name, '؟'), _current, abs(_delta)
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.warehouse_stock
     SET quantity = _current + _delta, updated_at = now()
   WHERE warehouse_id = _warehouse_id AND product_id = _product_id;

  -- quantity همیشه مثبت (CHECK فاز ۸.۱)؛ جهت در delta ثبت می‌شود.
  INSERT INTO public.stock_movements
    (product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id,
     related_warehouse_id, note, created_by)
  VALUES
    (_product_id, _warehouse_id, _movement_type, abs(_delta), _delta, _ref_type, _ref_id,
     _related_warehouse_id, _note, COALESCE(_created_by, auth.uid()))
  RETURNING id INTO _movement_id;

  PERFORM public.sync_product_stock_status(_product_id);

  RETURN _movement_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_stock_movement(uuid,uuid,text,numeric,text,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid,uuid,text,numeric,text,uuid,uuid,text,uuid)
  TO authenticated, service_role, postgres;

-- انبار پیش‌فرض (fallback وقتی سند انبار ندارد)
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
$function$;

GRANT EXECUTE ON FUNCTION public.default_warehouse_id() TO authenticated, service_role, postgres;

-- ===========================================================================
-- ۸.۲ خرید → افزایش موجودی + کاردکس 'in'
--     تریگر روی purchase_items تا هر ردیف کالا اثر خودش را بگذارد.
-- ===========================================================================
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
$function$;

DROP TRIGGER IF EXISTS trg_purchase_items_stock_in ON public.purchase_items;
CREATE TRIGGER trg_purchase_items_stock_in
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_item_stock_in();

-- ===========================================================================
-- ۸.۳ قطعی‌کردن پیش‌فاکتور → کسر موجودی + کاردکس 'out'
--     نقطهٔ قطعی = گذار status به 'accepted'.
--     چک موجودی (۱۷۵) داخل apply_stock_movement است، پس اگر کافی نباشد کل
--     UPDATE رد می‌شود و پیش‌فاکتور accepted نمی‌شود.
-- ===========================================================================
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
$function$;

DROP TRIGGER IF EXISTS trg_sales_quotes_stock_out ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_stock_out
  AFTER UPDATE OF status ON public.sales_quotes
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.trg_sales_quote_stock_out();

-- ۱۷۵ — چک موجودی پیش از قطعی، برای پیش‌نمایش در UI (خطا نمی‌دهد، گزارش می‌دهد).
CREATE OR REPLACE FUNCTION public.check_quote_stock_availability(
  _quote_id uuid,
  _warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  required numeric,
  available numeric,
  is_sufficient boolean
)
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
$function$;

GRANT EXECUTE ON FUNCTION public.check_quote_stock_availability(uuid, uuid)
  TO authenticated, service_role, postgres;

-- ===========================================================================
-- ۸.۴ انتقال بین‌انباری → دو ردیف کاردکس (transfer_out + transfer_in)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.trg_stock_transfer_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
     WHERE ref_type = 'transfer' AND ref_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = NEW.id) THEN
    RAISE EXCEPTION 'سند انتقال بدون کالا قابل قطعی‌کردن نیست.' USING ERRCODE = '22023';
  END IF;

  FOR _item IN
    SELECT product_id, quantity FROM public.stock_transfer_items WHERE transfer_id = NEW.id
  LOOP
    -- مبدأ اول کم می‌شود تا اگر موجودی کافی نبود، کل تراکنش رد شود.
    PERFORM public.apply_stock_movement(
      _item.product_id, NEW.from_warehouse_id, 'transfer_out', _item.quantity,
      'transfer', NEW.id, NEW.to_warehouse_id, 'انتقال بین‌انباری — خروج از مبدأ', NULL
    );
    PERFORM public.apply_stock_movement(
      _item.product_id, NEW.to_warehouse_id, 'transfer_in', _item.quantity,
      'transfer', NEW.id, NEW.from_warehouse_id, 'انتقال بین‌انباری — ورود به مقصد', NULL
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stock_transfers_confirm ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfers_confirm
  AFTER UPDATE OF status ON public.stock_transfers
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.trg_stock_transfer_confirm();

-- ===========================================================================
-- تعدیل دستی موجودی (adjust) — برای UI مدیریت انبار
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.adjust_warehouse_stock(
  _product_id uuid,
  _warehouse_id uuid,
  _new_quantity numeric,
  _note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current numeric;
  _delta numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای تعدیل موجودی را ندارید.' USING ERRCODE = '42501';
  END IF;
  IF _new_quantity IS NULL OR _new_quantity < 0 THEN
    RAISE EXCEPTION 'موجودی جدید نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(quantity, 0) INTO _current
    FROM public.warehouse_stock
   WHERE product_id = _product_id AND warehouse_id = _warehouse_id;
  _current := COALESCE(_current, 0);

  _delta := _new_quantity - _current;
  IF _delta = 0 THEN
    RETURN _current;
  END IF;

  PERFORM public.apply_stock_movement(
    _product_id, _warehouse_id, 'adjust', _delta,
    'manual', NULL, NULL, COALESCE(_note, 'تعدیل دستی موجودی'), auth.uid()
  );

  RETURN _new_quantity;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_warehouse_stock(uuid, uuid, numeric, text)
  TO authenticated, service_role, postgres;

COMMIT;
