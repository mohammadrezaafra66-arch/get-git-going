-- 1) Cleanup: delete invalid zero-price history rows
DELETE FROM public.product_sale_price_history
WHERE new_sale_price IS NULL OR new_sale_price <= 0;

-- 2) Merge old "پیش واریز" (inactive) into new active type for products missing on new
WITH old_type AS (
  SELECT '111c2fdf-cf2e-40b4-9f2c-9431964d00bf'::uuid AS id
), new_type AS (
  SELECT '4860300a-edfc-45f5-a13b-7b497f6b7534'::uuid AS id
), latest_old AS (
  SELECT DISTINCT ON (h.product_id)
    h.product_id, h.new_sale_price, h.created_by
  FROM public.product_sale_price_history h, old_type
  WHERE h.sale_price_type_id = old_type.id
    AND h.new_sale_price > 0
  ORDER BY h.product_id, h.created_at DESC
)
INSERT INTO public.product_sale_price_history
  (product_id, new_sale_price, sale_price_type_id, created_by, created_at)
SELECT lo.product_id, lo.new_sale_price, nt.id, lo.created_by, now()
FROM latest_old lo, new_type nt
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_sale_price_history h2
  WHERE h2.product_id = lo.product_id
    AND h2.sale_price_type_id = nt.id
);

-- 3) Unique constraint on active sale_price_types title (case-insensitive, trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS sale_price_types_title_unique_active
ON public.sale_price_types (lower(trim(title)))
WHERE is_active = true;

-- 4) Validation trigger preventing zero/null sale prices
CREATE OR REPLACE FUNCTION public.validate_sale_price_positive()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.new_sale_price IS NULL OR NEW.new_sale_price <= 0 THEN
    RAISE EXCEPTION 'قیمت فروش باید بزرگ‌تر از صفر باشد (مقدار دریافتی: %)', NEW.new_sale_price
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sale_price_positive ON public.product_sale_price_history;
CREATE TRIGGER trg_validate_sale_price_positive
BEFORE INSERT OR UPDATE ON public.product_sale_price_history
FOR EACH ROW EXECUTE FUNCTION public.validate_sale_price_positive();