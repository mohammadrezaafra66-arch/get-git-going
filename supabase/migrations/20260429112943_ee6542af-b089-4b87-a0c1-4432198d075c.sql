-- Auto-generate unique code (SPT-XXX) for sale_price_types when not provided
CREATE OR REPLACE FUNCTION public.generate_sale_price_type_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
  new_code text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '^SPT-(\d+)$') AS int)), 0) + 1
    INTO next_num
  FROM public.sale_price_types
  WHERE code ~ '^SPT-\d+$';

  LOOP
    new_code := 'SPT-' || LPAD(next_num::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sale_price_types WHERE code = new_code);
    next_num := next_num + 1;
  END LOOP;

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sale_price_type_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.generate_sale_price_type_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sale_price_type_code ON public.sale_price_types;
CREATE TRIGGER trg_set_sale_price_type_code
BEFORE INSERT ON public.sale_price_types
FOR EACH ROW
EXECUTE FUNCTION public.set_sale_price_type_code();

-- Allow authenticated users to call the helper from client (for preview)
GRANT EXECUTE ON FUNCTION public.generate_sale_price_type_code() TO authenticated;