-- M1
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS received_at DATE;

-- M2
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS base_margin_percent NUMERIC(5,2) DEFAULT 15.0;

-- M3: seed global_default_margin in shop_settings (value is jsonb)
INSERT INTO public.shop_settings (key, value)
VALUES ('global_default_margin', to_jsonb(15))
ON CONFLICT (key) DO NOTHING;

-- M4
ALTER TABLE public.market_indicators
  ADD COLUMN IF NOT EXISTS rate_type TEXT
    CHECK (rate_type IN ('نیمایی', 'آزاد', 'توافقی'));

-- M5: holding-period adjusted price
CREATE OR REPLACE FUNCTION public.calculate_adjusted_price(_product_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price    NUMERIC;
  v_received_at   DATE;
  v_category_id   UUID;
  v_cat_margin    NUMERIC;
  v_global_margin NUMERIC := 15.0;
  v_margin        NUMERIC;
  v_holding_days  INTEGER := 0;
BEGIN
  SELECT p.received_at, p.category_id
  INTO   v_received_at, v_category_id
  FROM   public.products p
  WHERE  p.id = _product_id;

  -- Latest computed sale price (use rounded then final)
  SELECT COALESCE(pcp.rounded_sale_price, pcp.final_sale_price, 0)
  INTO   v_base_price
  FROM   public.product_computed_prices pcp
  WHERE  pcp.product_id = _product_id
  ORDER BY pcp.computed_at DESC
  LIMIT 1;

  IF v_base_price IS NULL OR v_base_price = 0 THEN
    RETURN 0;
  END IF;

  SELECT c.base_margin_percent
  INTO   v_cat_margin
  FROM   public.categories c
  WHERE  c.id = v_category_id;

  BEGIN
    SELECT (value #>> '{}')::NUMERIC
    INTO   v_global_margin
    FROM   public.shop_settings
    WHERE  key = 'global_default_margin'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_global_margin := 15.0;
  END;

  v_margin := COALESCE(v_cat_margin, v_global_margin, 15.0);

  IF v_received_at IS NOT NULL THEN
    v_holding_days := (CURRENT_DATE - v_received_at);
  END IF;

  IF    v_holding_days <= 30 THEN NULL;
  ELSIF v_holding_days <= 60 THEN v_margin := v_margin + 2;
  ELSIF v_holding_days <= 90 THEN v_margin := v_margin + 5;
  ELSE                            v_margin := v_margin + 10;
  END IF;

  RETURN ROUND(v_base_price * (1 + v_margin / 100.0), 0);
END;
$$;