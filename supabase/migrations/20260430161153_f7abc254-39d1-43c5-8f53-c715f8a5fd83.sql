
-- 1) currencies table (single source of truth for currency codes)
CREATE TABLE IF NOT EXISTS public.currencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  symbol TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- normalize code lowercase
CREATE OR REPLACE FUNCTION public.currencies_normalize_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := lower(trim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_currencies_normalize ON public.currencies;
CREATE TRIGGER trg_currencies_normalize
  BEFORE INSERT OR UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.currencies_normalize_code();

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currencies_read_authed ON public.currencies;
CREATE POLICY currencies_read_authed ON public.currencies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS currencies_write_admin_accountant ON public.currencies;
CREATE POLICY currencies_write_admin_accountant ON public.currencies
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- seed defaults (matches existing base_currency enum)
INSERT INTO public.currencies (code, title, symbol, sort_order)
VALUES
  ('toman', 'تومان', 'تومان', 0),
  ('usd',   'دلار آمریکا', '$', 1),
  ('aed',   'درهم امارات', 'د.إ', 2)
ON CONFLICT (code) DO NOTHING;

-- 2) Convert products.base_currency from enum to text validated against currencies table
ALTER TABLE public.products
  ALTER COLUMN base_currency TYPE TEXT USING base_currency::text;

ALTER TABLE public.products
  ALTER COLUMN base_currency SET DEFAULT 'toman';

-- Validation trigger (cannot use FK to non-PK column reliably with enum legacy; use trigger)
CREATE OR REPLACE FUNCTION public.products_validate_base_currency()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_active BOOLEAN;
BEGIN
  IF NEW.base_currency IS NULL OR length(trim(NEW.base_currency)) = 0 THEN
    RAISE EXCEPTION 'base_currency is required';
  END IF;
  NEW.base_currency := lower(trim(NEW.base_currency));
  SELECT is_active INTO v_active FROM public.currencies WHERE code = NEW.base_currency;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'currency code "%" does not exist', NEW.base_currency;
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'currency code "%" is not active', NEW.base_currency;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_validate_base_currency ON public.products;
CREATE TRIGGER trg_products_validate_base_currency
  BEFORE INSERT OR UPDATE OF base_currency ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_validate_base_currency();
