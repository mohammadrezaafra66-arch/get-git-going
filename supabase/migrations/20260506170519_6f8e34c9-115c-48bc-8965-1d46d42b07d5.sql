
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS cash_price numeric(18,2),
  ADD COLUMN IF NOT EXISTS cash_price_currency text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id);

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_cash_price_currency_check;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_cash_price_currency_check
  CHECK (cash_price_currency IS NULL OR cash_price_currency IN ('toman','usd','aed'));

CREATE INDEX IF NOT EXISTS idx_purchases_paid_at ON public.purchases (paid_at);

INSERT INTO public.shop_settings (key, value)
VALUES
  ('accountant_daily_interest_rate', '0.001'),
  ('purchase_score_enabled', 'true'),
  ('purchase_score_grace_days', '2')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "shop_settings_write_accountant_purchase_keys" ON public.shop_settings;
CREATE POLICY "shop_settings_write_accountant_purchase_keys"
  ON public.shop_settings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'accountant'::app_role)
    AND key IN ('accountant_daily_interest_rate','purchase_score_enabled','purchase_score_grace_days')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'accountant'::app_role)
    AND key IN ('accountant_daily_interest_rate','purchase_score_enabled','purchase_score_grace_days')
  );

INSERT INTO public.gamification_kpi_rules (event_key, title_fa, description, xp_amount, is_active, sort_order)
VALUES
  ('purchase_long_term_score',
   'خرید با مهلت تسویه‌ی هوشمند',
   'امتیاز برای خریدی که با قیمتی نزدیک به نقدی، مهلت تسویه‌ی طولانی‌تر گرفته است',
   0, true, 100),
  ('payment_late_pay_score',
   'بهره‌برداری از مهلت تسویه',
   'امتیاز حسابدار برای پرداخت در نزدیکی پایان مهلت تسویه (بدون دیرکرد)',
   0, true, 110)
ON CONFLICT (event_key) DO NOTHING;

CREATE OR REPLACE VIEW public.vw_purchase_float AS
SELECT
  p.id AS purchase_id,
  p.product_id,
  p.supplier_id,
  p.created_by AS buyer_id,
  p.paid_by AS accountant_id,
  p.purchase_date,
  p.purchase_price,
  p.cash_price,
  p.quantity,
  p.payment_term_id,
  pt.days AS promised_days,
  p.paid_at,
  CASE
    WHEN p.paid_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (p.paid_at - p.purchase_date::timestamptz)) / 86400.0
    ELSE NULL
  END AS actual_days,
  CASE
    WHEN p.cash_price IS NOT NULL
      AND p.cash_price > 0
      AND COALESCE(pt.days, 0) > 0
      THEN ((p.purchase_price - p.cash_price) / p.cash_price) / pt.days
    ELSE NULL
  END AS implied_daily_cost
FROM public.purchases p
LEFT JOIN public.payment_terms pt ON pt.id = p.payment_term_id;

GRANT SELECT ON public.vw_purchase_float TO authenticated;

CREATE OR REPLACE FUNCTION public.get_numeric_setting(_key text, _default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(value,'')::numeric, _default)
  FROM public.shop_settings WHERE key = _key
  UNION ALL SELECT _default
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.award_buyer_purchase_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enabled_txt text;
  ref_rate numeric;
  promised_days int;
  amount numeric;
  implied_daily numeric;
  raw_score numeric;
  final_score numeric;
BEGIN
  SELECT value INTO enabled_txt FROM public.shop_settings WHERE key = 'purchase_score_enabled';
  IF COALESCE(enabled_txt,'true') <> 'true' THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

  ref_rate := public.get_numeric_setting('accountant_daily_interest_rate', 0.001);

  SELECT pt.days INTO promised_days FROM public.payment_terms pt WHERE pt.id = NEW.payment_term_id;
  IF promised_days IS NULL OR promised_days <= 0 THEN
    INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
    VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
            jsonb_build_object('score', 0, 'reason', 'cash_or_no_term'));
    RETURN NEW;
  END IF;

  amount := COALESCE(NEW.purchase_price,0) * COALESCE(NEW.quantity,1);

  IF NEW.cash_price IS NULL OR NEW.cash_price <= 0 THEN
    INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
    VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
            jsonb_build_object('score', 0, 'reason', 'missing_cash_price', 'promised_days', promised_days));
    RETURN NEW;
  END IF;

  implied_daily := ((NEW.purchase_price - NEW.cash_price) / NEW.cash_price) / promised_days;
  raw_score := (ref_rate - implied_daily) * promised_days * amount;
  final_score := round(raw_score / 100000.0, 2);
  IF final_score < 0 THEN final_score := 0; END IF;

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
  VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
          jsonb_build_object(
            'score', final_score,
            'promised_days', promised_days,
            'cash_price', NEW.cash_price,
            'purchase_price', NEW.purchase_price,
            'implied_daily_cost', implied_daily,
            'reference_daily_rate', ref_rate,
            'amount', amount
          ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_buyer_purchase_score ON public.purchases;
CREATE TRIGGER trg_award_buyer_purchase_score
AFTER INSERT ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.award_buyer_purchase_score();

CREATE OR REPLACE FUNCTION public.award_accountant_payment_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enabled_txt text;
  promised_days int;
  grace int;
  actual_days numeric;
  amount numeric;
  ref_rate numeric;
  raw_score numeric;
  final_score numeric;
  reason text;
BEGIN
  IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT value INTO enabled_txt FROM public.shop_settings WHERE key = 'purchase_score_enabled';
  IF COALESCE(enabled_txt,'true') <> 'true' THEN RETURN NEW; END IF;
  IF NEW.paid_by IS NULL THEN RETURN NEW; END IF;

  SELECT pt.days INTO promised_days FROM public.payment_terms pt WHERE pt.id = NEW.payment_term_id;
  promised_days := COALESCE(promised_days, 0);
  grace := public.get_numeric_setting('purchase_score_grace_days', 2)::int;
  ref_rate := public.get_numeric_setting('accountant_daily_interest_rate', 0.001);

  actual_days := EXTRACT(EPOCH FROM (NEW.paid_at - NEW.purchase_date::timestamptz)) / 86400.0;
  amount := COALESCE(NEW.purchase_price,0) * COALESCE(NEW.quantity,1);

  IF actual_days > promised_days + grace THEN
    final_score := -round((actual_days - promised_days - grace) * amount * ref_rate / 100000.0, 2);
    reason := 'late_payment_penalty';
  ELSIF actual_days <= promised_days * 0.5 THEN
    final_score := 0;
    reason := 'paid_too_early';
  ELSE
    raw_score := (actual_days - promised_days * 0.5) * amount * ref_rate;
    final_score := round(raw_score / 100000.0, 2);
    reason := 'used_term_well';
  END IF;

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
  VALUES (NEW.paid_by, 'payment_late_pay_score', 'purchases', NEW.id::text,
          jsonb_build_object(
            'score', final_score,
            'reason', reason,
            'promised_days', promised_days,
            'actual_days', actual_days,
            'grace', grace,
            'reference_daily_rate', ref_rate,
            'amount', amount
          ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_accountant_payment_score ON public.purchases;
CREATE TRIGGER trg_award_accountant_payment_score
AFTER UPDATE OF paid_at ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.award_accountant_payment_score();
