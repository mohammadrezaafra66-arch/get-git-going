SET client_encoding = 'UTF8';

-- 215 — Allow sales quote/pre-invoice creation regardless of stock.
--
-- Business rule:
--   Creation may happen even when product stock is zero, below requested
--   quantity, or the product is currently unavailable.
--   Stock must be enforced only when the quote is finalized/accepted.
--
-- Safety:
--   This migration does not remove finalization protection. The accepted-status
--   trigger `trg_sales_quotes_stock_out` still calls `apply_stock_movement`,
--   which locks `warehouse_stock` and raises a clear insufficient-stock error.
--
-- Rollback:
--   Re-apply `supabase/migrations/20260729170000_212_quote_credit_commitment_and_stock_guard.sql`
--   after reviewing the current live function signature. Do not edit old
--   migrations in place.

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old_block text;
  v_new_block text;
BEGIN
  SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_sales_quote_with_items'
   ORDER BY p.oid DESC
   LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'create_sales_quote_with_items was not found';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  v_old_block := $old$
  -- 212.8 — hard inventory guard at creation time.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) elem
    WHERE elem->>'source' = 'product_price' AND NULLIF(elem->>'product_id','') IS NOT NULL
  ) THEN
    IF _wh IS NULL THEN
      RAISE EXCEPTION 'برای کنترل موجودی، انبار یا انبار پیش‌فرض باید مشخص باشد.' USING ERRCODE = '22023';
    END IF;

    FOR _need IN
      SELECT
        NULLIF(elem->>'product_id','')::uuid AS product_id,
        COALESCE(NULLIF(elem->>'title_snapshot',''), 'محصول') AS product_name,
        SUM((elem->>'quantity')::numeric) AS required
      FROM jsonb_array_elements(p_items) elem
      WHERE elem->>'source' = 'product_price' AND NULLIF(elem->>'product_id','') IS NOT NULL
      GROUP BY NULLIF(elem->>'product_id','')::uuid, COALESCE(NULLIF(elem->>'title_snapshot',''), 'محصول')
    LOOP
      SELECT COALESCE((
        SELECT ws.quantity
        FROM public.warehouse_stock ws
        WHERE ws.product_id = _need.product_id AND ws.warehouse_id = _wh
      ), 0)
      INTO _available;

      IF _available < COALESCE(_need.required, 0) THEN
        RAISE EXCEPTION
          'موجودی کافی نیست: «%»؛ تعداد درخواستی % عدد، موجودی فعلی % عدد است.',
          COALESCE(_need.product_name, '؟'), COALESCE(_need.required, 0), _available
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
$old$;

  v_new_block := $new$
  -- 215 — creation deliberately does not validate stock.
  -- Stock is checked only when status changes to accepted/finalized by
  -- trg_sales_quotes_stock_out -> apply_stock_movement. That path keeps row
  -- locking and rejects insufficient stock transactionally.
$new$;

  IF position(v_old_block IN v_def) = 0 THEN
    RAISE EXCEPTION 'Expected creation-time stock guard block was not found in create_sales_quote_with_items';
  END IF;

  EXECUTE replace(v_def, v_old_block, v_new_block);
END $$;
