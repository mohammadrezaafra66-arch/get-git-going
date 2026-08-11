SET client_encoding='UTF8';

-- =============================================================================
-- DOWN script for migration 274 (D8-8 line-level warehouse).
-- Deliberately NOT inside supabase/migrations/.
--
-- HOW TO RUN — this file contains NO BEGIN/COMMIT on purpose (the 273 lesson:
-- an embedded COMMIT hijacks the transaction of any dry-run harness that \i's
-- it, and the harness's ROLLBACK then silently no-ops):
--   docker cp docs/verification/274-down.sql afrakala-lan-db:/tmp/274down.sql
--   docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/274down.sql
--
-- ⚠️ WHAT REVERTING COSTS
-- Every line reverts to being deducted from the DOCUMENT's warehouse. Any
-- proforma whose lines were deliberately split across warehouses will, from
-- then on, deduct entirely from one warehouse — silently and wrongly. Check
-- for split documents before running this:
--   SELECT quote_id, COUNT(DISTINCT warehouse_id)
--     FROM public.sales_quote_items WHERE warehouse_id IS NOT NULL
--    GROUP BY quote_id HAVING COUNT(DISTINCT warehouse_id) > 1;
--
-- The warehouse_id COLUMNS are intentionally NOT dropped — dropping them would
-- destroy the per-line choices a user made, which this script cannot rebuild.
-- Reverting the logic is reversible; deleting the data is not.
-- Function bodies restored verbatim from docs/verification/pre-274/stock-functions.sql.
-- =============================================================================

-- 1. Restore the sales deduction trigger (document warehouse, grouped by product only).
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

-- 2. Restore the purchase receipt trigger.
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

-- 3. Restore the single-warehouse availability signature.
DROP FUNCTION IF EXISTS public.check_quote_stock_availability(uuid, uuid);

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
$function$;

REVOKE EXECUTE ON FUNCTION public.check_quote_stock_availability(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_quote_stock_availability(uuid, uuid) TO authenticated;

-- 4. Drop what 274 introduced, EXCEPT the columns (see the header).
DROP FUNCTION IF EXISTS public.effective_line_warehouse(uuid, uuid);
DROP INDEX IF EXISTS public.idx_sales_quote_items_warehouse_product;
DROP INDEX IF EXISTS public.idx_purchase_items_warehouse_product;
