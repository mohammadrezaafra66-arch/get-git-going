-- 1) Extend shipping_cost_type enum with 'currency'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shipping_cost_type' AND e.enumlabel = 'currency'
  ) THEN
    ALTER TYPE public.shipping_cost_type ADD VALUE 'currency';
  END IF;
END $$;

-- 2) Add cost_currency column referencing currencies(code)
ALTER TABLE public.shipping_cost_rules
  ADD COLUMN IF NOT EXISTS cost_currency TEXT NULL;

-- Soft FK to currencies(code) — allow NULL but if set must be valid currency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'shipping_cost_rules'
      AND constraint_name = 'shipping_cost_rules_cost_currency_fkey'
  ) THEN
    ALTER TABLE public.shipping_cost_rules
      ADD CONSTRAINT shipping_cost_rules_cost_currency_fkey
      FOREIGN KEY (cost_currency) REFERENCES public.currencies(code) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3) Validation trigger: if cost_type='currency' then cost_currency required
CREATE OR REPLACE FUNCTION public.validate_shipping_rule_currency()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cost_type = 'currency' AND (NEW.cost_currency IS NULL OR length(trim(NEW.cost_currency)) = 0) THEN
    RAISE EXCEPTION 'cost_currency is required when cost_type = currency';
  END IF;
  IF NEW.cost_type <> 'currency' THEN
    NEW.cost_currency := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_shipping_rule_currency ON public.shipping_cost_rules;
CREATE TRIGGER trg_validate_shipping_rule_currency
  BEFORE INSERT OR UPDATE ON public.shipping_cost_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_shipping_rule_currency();

-- 4) Index for fast lookup of active rules per product
CREATE INDEX IF NOT EXISTS idx_shipping_rules_product_active
  ON public.shipping_cost_rules(product_id)
  WHERE is_active = true AND product_id IS NOT NULL;