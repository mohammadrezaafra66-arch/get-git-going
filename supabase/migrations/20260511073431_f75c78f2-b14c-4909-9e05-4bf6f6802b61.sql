
-- Canonical source: latest product_computed_prices per (product, sale_price_type).
-- Fallback for previous_price: product_sale_price_history.

CREATE OR REPLACE FUNCTION public.refresh_sale_list_prices(p_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (pcp.product_id, pcp.sale_price_type_id)
      pcp.product_id,
      pcp.sale_price_type_id,
      pcp.rounded_sale_price AS new_price
    FROM public.product_computed_prices pcp
    WHERE pcp.rounded_sale_price IS NOT NULL AND pcp.rounded_sale_price > 0
    ORDER BY pcp.product_id, pcp.sale_price_type_id, pcp.computed_at DESC
  ),
  hist AS (
    SELECT DISTINCT ON (h.product_id, h.sale_price_type_id)
      h.product_id, h.sale_price_type_id, h.old_sale_price, h.new_sale_price
    FROM public.product_sale_price_history h
    ORDER BY h.product_id, h.sale_price_type_id, h.created_at DESC
  )
  UPDATE public.sale_list_items sli
  SET
    current_price  = l.new_price,
    previous_price = COALESCE(hist.old_sale_price, hist.new_sale_price),
    change_amount  = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                          THEN l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price)
                          ELSE NULL END,
    change_percent = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                           AND COALESCE(hist.old_sale_price, hist.new_sale_price) <> 0
                          THEN ROUND(((l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price))
                                    / COALESCE(hist.old_sale_price, hist.new_sale_price)) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  JOIN latest l ON sl.sale_price_type_id = l.sale_price_type_id
  LEFT JOIN hist ON hist.product_id = l.product_id AND hist.sale_price_type_id = l.sale_price_type_id
  WHERE sli.sale_list_id = p_list_id
    AND sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND (sli.current_price IS DISTINCT FROM l.new_price);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_sale_list_prices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (pcp.product_id, pcp.sale_price_type_id)
      pcp.product_id,
      pcp.sale_price_type_id,
      pcp.rounded_sale_price AS new_price
    FROM public.product_computed_prices pcp
    WHERE pcp.rounded_sale_price IS NOT NULL AND pcp.rounded_sale_price > 0
    ORDER BY pcp.product_id, pcp.sale_price_type_id, pcp.computed_at DESC
  ),
  hist AS (
    SELECT DISTINCT ON (h.product_id, h.sale_price_type_id)
      h.product_id, h.sale_price_type_id, h.old_sale_price, h.new_sale_price
    FROM public.product_sale_price_history h
    ORDER BY h.product_id, h.sale_price_type_id, h.created_at DESC
  )
  UPDATE public.sale_list_items sli
  SET
    current_price  = l.new_price,
    previous_price = COALESCE(hist.old_sale_price, hist.new_sale_price),
    change_amount  = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                          THEN l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price)
                          ELSE NULL END,
    change_percent = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                           AND COALESCE(hist.old_sale_price, hist.new_sale_price) <> 0
                          THEN ROUND(((l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price))
                                    / COALESCE(hist.old_sale_price, hist.new_sale_price)) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  JOIN latest l ON sl.sale_price_type_id = l.sale_price_type_id
  LEFT JOIN hist ON hist.product_id = l.product_id AND hist.sale_price_type_id = l.sale_price_type_id
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND (sli.current_price IS DISTINCT FROM l.new_price);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_sale_list_prices(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_sale_list_prices() TO authenticated;

-- BEFORE INSERT trigger: auto-fill from canonical source
CREATE OR REPLACE FUNCTION public.fill_sale_list_item_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spt uuid;
  v_new numeric;
  v_old numeric;
BEGIN
  SELECT sale_price_type_id INTO v_spt FROM public.sale_lists WHERE id = NEW.sale_list_id;
  IF v_spt IS NULL THEN RETURN NEW; END IF;

  -- Canonical: latest product_computed_prices
  SELECT rounded_sale_price INTO v_new
  FROM public.product_computed_prices
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = v_spt
    AND rounded_sale_price IS NOT NULL AND rounded_sale_price > 0
  ORDER BY computed_at DESC
  LIMIT 1;

  -- Fallback to history if no computed price
  IF v_new IS NULL THEN
    SELECT new_sale_price INTO v_new
    FROM public.product_sale_price_history
    WHERE product_id = NEW.product_id
      AND sale_price_type_id = v_spt
      AND new_sale_price IS NOT NULL AND new_sale_price > 0
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Previous price from history (best-effort)
  SELECT COALESCE(old_sale_price, new_sale_price) INTO v_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = v_spt
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_new IS NOT NULL THEN
    NEW.current_price := v_new;
    NEW.previous_price := v_old;
    IF v_old IS NOT NULL AND v_old <> 0 THEN
      NEW.change_amount := v_new - v_old;
      NEW.change_percent := ROUND(((v_new - v_old) / v_old) * 100, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_sale_list_item_on_insert ON public.sale_list_items;
CREATE TRIGGER trg_fill_sale_list_item_on_insert
BEFORE INSERT ON public.sale_list_items
FOR EACH ROW
EXECUTE FUNCTION public.fill_sale_list_item_on_insert();

-- AFTER INSERT/UPDATE on product_computed_prices → propagate to sale_list_items
CREATE OR REPLACE FUNCTION public.sync_sale_list_items_from_computed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old numeric;
BEGIN
  IF NEW.rounded_sale_price IS NULL OR NEW.rounded_sale_price <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(old_sale_price, new_sale_price) INTO v_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = NEW.sale_price_type_id
  ORDER BY created_at DESC
  LIMIT 1;

  UPDATE public.sale_list_items sli
  SET
    current_price  = NEW.rounded_sale_price,
    previous_price = v_old,
    change_amount  = CASE WHEN v_old IS NOT NULL THEN NEW.rounded_sale_price - v_old ELSE NULL END,
    change_percent = CASE WHEN v_old IS NOT NULL AND v_old <> 0
                          THEN ROUND(((NEW.rounded_sale_price - v_old) / v_old) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = NEW.product_id
    AND sl.sale_price_type_id = NEW.sale_price_type_id
    AND sli.current_price IS DISTINCT FROM NEW.rounded_sale_price;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_list_items_from_computed ON public.product_computed_prices;
CREATE TRIGGER trg_sync_sale_list_items_from_computed
AFTER INSERT OR UPDATE ON public.product_computed_prices
FOR EACH ROW
EXECUTE FUNCTION public.sync_sale_list_items_from_computed();

-- One-time backfill so existing lists immediately get canonical prices
SELECT public.refresh_all_sale_list_prices();
