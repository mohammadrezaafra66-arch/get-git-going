
-- Refresh sale list prices from latest product_sale_price_history
CREATE OR REPLACE FUNCTION public.refresh_sale_list_prices(p_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    previous_price = l.old_sale_price,
    change_amount  = CASE WHEN l.old_sale_price IS NOT NULL
                          THEN l.new_sale_price - l.old_sale_price
                          ELSE NULL END,
    change_percent = CASE WHEN l.old_sale_price IS NOT NULL AND l.old_sale_price <> 0
                          THEN ROUND(((l.new_sale_price - l.old_sale_price) / l.old_sale_price) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl, latest l
  WHERE sli.sale_list_id = p_list_id
    AND sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND sl.sale_price_type_id = l.sale_price_type_id
    AND (sli.current_price IS DISTINCT FROM l.new_sale_price
      OR sli.previous_price IS DISTINCT FROM l.old_sale_price);
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
    previous_price = l.old_sale_price,
    change_amount  = CASE WHEN l.old_sale_price IS NOT NULL
                          THEN l.new_sale_price - l.old_sale_price
                          ELSE NULL END,
    change_percent = CASE WHEN l.old_sale_price IS NOT NULL AND l.old_sale_price <> 0
                          THEN ROUND(((l.new_sale_price - l.old_sale_price) / l.old_sale_price) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl, latest l
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND sl.sale_price_type_id = l.sale_price_type_id
    AND (sli.current_price IS DISTINCT FROM l.new_sale_price
      OR sli.previous_price IS DISTINCT FROM l.old_sale_price);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_sale_list_prices(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_sale_list_prices() TO authenticated;

-- Auto-fill sale_list_items on insert from latest history
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

  SELECT new_sale_price, old_sale_price
    INTO v_new, v_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = v_spt
    AND new_sale_price IS NOT NULL AND new_sale_price > 0
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_new IS NOT NULL THEN
    NEW.current_price := v_new;
    NEW.previous_price := v_old;
    IF v_old IS NOT NULL THEN
      NEW.change_amount := v_new - v_old;
      IF v_old <> 0 THEN
        NEW.change_percent := ROUND(((v_new - v_old) / v_old) * 100, 2);
      END IF;
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

-- Enable realtime for sale_list_items
ALTER TABLE public.sale_list_items REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sale_list_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_list_items';
  END IF;
END $$;
