
-- Drop dependent CHECK constraint that references the enum
ALTER TABLE public.currency_rates DROP CONSTRAINT IF EXISTS currency_rates_currency_check;

-- Make currencies.code unique (FK target)
ALTER TABLE public.currencies
  ADD CONSTRAINT currencies_code_unique UNIQUE (code);

-- Convert currency_rates.currency from enum to text
ALTER TABLE public.currency_rates
  ALTER COLUMN currency TYPE text USING currency::text;

ALTER TABLE public.currency_rates
  ADD CONSTRAINT currency_rates_currency_fkey
  FOREIGN KEY (currency) REFERENCES public.currencies(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_currency_rates_currency_active_eff
  ON public.currency_rates (currency, is_active, effective_at DESC);

-- Convert currency_rate_fetches.currency to text too
ALTER TABLE public.currency_rate_fetches
  ALTER COLUMN currency TYPE text USING currency::text;

-- Cache table for computed prices per (product, sale_price_type)
CREATE TABLE IF NOT EXISTS public.product_computed_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sale_price_type_id uuid NOT NULL REFERENCES public.sale_price_types(id) ON DELETE CASCADE,
  purchase_price_id uuid,
  pricing_rule_id uuid,
  input_purchase_price numeric NOT NULL,
  input_currency text NOT NULL,
  currency_rate numeric NOT NULL,
  purchase_price_toman numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  margin_amount numeric NOT NULL DEFAULT 0,
  final_sale_price numeric NOT NULL,
  rounded_sale_price numeric NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid,
  source text NOT NULL DEFAULT 'manual',
  UNIQUE (product_id, sale_price_type_id)
);

CREATE INDEX IF NOT EXISTS idx_pcp_product ON public.product_computed_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_pcp_currency ON public.product_computed_prices(input_currency);

ALTER TABLE public.product_computed_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcp_read_authed"
  ON public.product_computed_prices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "pcp_write_privileged"
  ON public.product_computed_prices FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- View: effective currencies (only used by active+available/limited products)
CREATE OR REPLACE VIEW public.effective_currencies_view AS
SELECT DISTINCT
  c.code,
  c.title,
  c.symbol,
  c.is_active,
  c.sort_order
FROM public.currencies c
WHERE c.is_active = true
  AND c.code <> 'toman'
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.base_currency = c.code
      AND p.status = 'active'
      AND p.stock_status IN ('available', 'limited')
  );

GRANT SELECT ON public.effective_currencies_view TO authenticated;
