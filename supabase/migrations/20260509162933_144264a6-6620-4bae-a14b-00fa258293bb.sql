
-- Function: sync sale_list_items snapshots from latest published price
CREATE OR REPLACE FUNCTION public.sync_sale_list_items_from_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_new NUMERIC;
  v_latest_old NUMERIC;
BEGIN
  -- Get the latest history row for this (product, sale_price_type)
  SELECT new_sale_price, old_sale_price
    INTO v_latest_new, v_latest_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = NEW.sale_price_type_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_latest_new IS NULL OR v_latest_new <= 0 THEN
    RETURN NEW;
  END IF;

  -- Update every sale_list_items row that uses this product on a list
  -- whose sale_price_type matches NEW.sale_price_type_id.
  UPDATE public.sale_list_items sli
  SET
    current_price  = v_latest_new,
    previous_price = v_latest_old,
    change_amount  = CASE WHEN v_latest_old IS NOT NULL
                          THEN v_latest_new - v_latest_old
                          ELSE NULL END,
    change_percent = CASE WHEN v_latest_old IS NOT NULL AND v_latest_old <> 0
                          THEN ROUND(((v_latest_new - v_latest_old) / v_latest_old) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = NEW.product_id
    AND sl.sale_price_type_id = NEW.sale_price_type_id;

  RETURN NEW;
END;
$$;

-- Trigger
DROP TRIGGER IF EXISTS trg_sync_sale_list_items ON public.product_sale_price_history;
CREATE TRIGGER trg_sync_sale_list_items
AFTER INSERT OR UPDATE ON public.product_sale_price_history
FOR EACH ROW
EXECUTE FUNCTION public.sync_sale_list_items_from_history();

-- Index to speed up the lookup inside the trigger and elsewhere
CREATE INDEX IF NOT EXISTS idx_psph_product_type_created
  ON public.product_sale_price_history (product_id, sale_price_type_id, created_at DESC);

-- Backfill: fix existing zero snapshots when a valid history price exists
WITH latest AS (
  SELECT DISTINCT ON (h.product_id, h.sale_price_type_id)
    h.product_id,
    h.sale_price_type_id,
    h.new_sale_price,
    h.old_sale_price
  FROM public.product_sale_price_history h
  WHERE h.new_sale_price IS NOT NULL AND h.new_sale_price > 0
  ORDER BY h.product_id, h.sale_price_type_id, h.created_at DESC
)
UPDATE public.sale_list_items sli
SET
  current_price  = l.new_sale_price,
  previous_price = COALESCE(sli.previous_price, l.old_sale_price),
  change_amount  = CASE WHEN COALESCE(sli.previous_price, l.old_sale_price) IS NOT NULL
                        THEN l.new_sale_price - COALESCE(sli.previous_price, l.old_sale_price)
                        ELSE sli.change_amount END,
  change_percent = CASE WHEN COALESCE(sli.previous_price, l.old_sale_price) IS NOT NULL
                         AND COALESCE(sli.previous_price, l.old_sale_price) <> 0
                        THEN ROUND(((l.new_sale_price - COALESCE(sli.previous_price, l.old_sale_price))
                                    / COALESCE(sli.previous_price, l.old_sale_price)) * 100, 2)
                        ELSE sli.change_percent END
FROM public.sale_lists sl, latest l
WHERE sli.sale_list_id = sl.id
  AND sli.product_id = l.product_id
  AND sl.sale_price_type_id = l.sale_price_type_id
  AND (sli.current_price IS NULL OR sli.current_price = 0);
