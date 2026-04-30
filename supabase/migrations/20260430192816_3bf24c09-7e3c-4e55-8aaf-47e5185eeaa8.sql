-- =====================================================
-- Price Alert Center — schema, RLS, trigger and RPC
-- =====================================================

-- 1) price_alert_rules
CREATE TABLE IF NOT EXISTS public.price_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sale_price_type_id uuid NULL REFERENCES public.sale_price_types(id) ON DELETE SET NULL,
  operator text NOT NULL,
  target_value numeric NULL,
  target_currency text NOT NULL DEFAULT 'toman',
  baseline_price numeric NULL,
  baseline_change_percent numeric NULL,
  stock_status_from text NULL,
  stock_status_to text NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_repeatable boolean NOT NULL DEFAULT false,
  last_triggered_at timestamptz NULL,
  triggered_count integer NOT NULL DEFAULT 0,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT par_operator_chk CHECK (operator IN (
    'below_price','above_price','increase_percent','decrease_percent',
    'stock_status_changed','below_usd_price','above_usd_price'
  )),
  CONSTRAINT par_currency_chk CHECK (target_currency IN ('toman','usd')),
  CONSTRAINT par_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_par_user ON public.price_alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_par_product ON public.price_alert_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_par_spt ON public.price_alert_rules(sale_price_type_id);
CREATE INDEX IF NOT EXISTS idx_par_operator ON public.price_alert_rules(operator);
CREATE INDEX IF NOT EXISTS idx_par_active ON public.price_alert_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_par_last_trig ON public.price_alert_rules(last_triggered_at);
CREATE INDEX IF NOT EXISTS idx_par_lookup_active
  ON public.price_alert_rules(product_id, sale_price_type_id, is_active);

-- Prevent duplicate active rules for same product + price type + operator + target_value
CREATE UNIQUE INDEX IF NOT EXISTS uq_par_active_dedup
  ON public.price_alert_rules(user_id, product_id, COALESCE(sale_price_type_id::text,'-'), operator, COALESCE(target_value,-1), target_currency)
  WHERE is_active = true;

ALTER TABLE public.price_alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS par_select_own ON public.price_alert_rules;
CREATE POLICY par_select_own ON public.price_alert_rules
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS par_insert_own ON public.price_alert_rules;
CREATE POLICY par_insert_own ON public.price_alert_rules
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS par_update_own ON public.price_alert_rules;
CREATE POLICY par_update_own ON public.price_alert_rules
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS par_delete_own ON public.price_alert_rules;
CREATE POLICY par_delete_own ON public.price_alert_rules
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._par_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_par_updated_at ON public.price_alert_rules;
CREATE TRIGGER trg_par_updated_at
  BEFORE UPDATE ON public.price_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public._par_set_updated_at();

-- 2) price_alert_notifications
CREATE TABLE IF NOT EXISTS public.price_alert_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_rule_id uuid NOT NULL REFERENCES public.price_alert_rules(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  sale_price_type_id uuid NULL,
  title text NOT NULL,
  message text NOT NULL,
  current_price numeric NULL,
  previous_price numeric NULL,
  change_percent numeric NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pan_user ON public.price_alert_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_pan_unread ON public.price_alert_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_pan_created ON public.price_alert_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pan_product ON public.price_alert_notifications(product_id);

ALTER TABLE public.price_alert_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pan_select_own ON public.price_alert_notifications;
CREATE POLICY pan_select_own ON public.price_alert_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS pan_update_own ON public.price_alert_notifications;
CREATE POLICY pan_update_own ON public.price_alert_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pan_delete_own ON public.price_alert_notifications;
CREATE POLICY pan_delete_own ON public.price_alert_notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- (No insert policy for clients — only the security-definer RPC/trigger inserts)

-- 3) Latest USD rate helper
CREATE OR REPLACE FUNCTION public._par_latest_usd_rate()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT rate_to_toman FROM public.currency_rates
  WHERE currency = 'USD' AND is_active = true
  ORDER BY effective_at DESC LIMIT 1;
$$;

-- 4) Core check function
CREATE OR REPLACE FUNCTION public.check_price_alerts_for_product(
  p_product_id uuid,
  p_sale_price_type_id uuid,
  p_current_price numeric,
  p_previous_price numeric DEFAULT NULL,
  p_change_percent numeric DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_triggered integer := 0;
  v_match boolean;
  v_product_name text;
  v_spt_name text;
  v_title text;
  v_message text;
  v_usd_rate numeric;
  v_current_usd numeric;
  v_cooldown interval := interval '6 hours';
BEGIN
  IF p_current_price IS NULL OR p_product_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF p_sale_price_type_id IS NOT NULL THEN
    SELECT name INTO v_spt_name FROM sale_price_types WHERE id = p_sale_price_type_id;
  END IF;

  v_usd_rate := public._par_latest_usd_rate();
  IF v_usd_rate IS NOT NULL AND v_usd_rate > 0 THEN
    v_current_usd := p_current_price / v_usd_rate;
  END IF;

  FOR r IN
    SELECT * FROM price_alert_rules
    WHERE product_id = p_product_id
      AND is_active = true
      AND (sale_price_type_id IS NULL OR sale_price_type_id = p_sale_price_type_id)
  LOOP
    v_match := false;

    -- Cooldown for repeatable
    IF r.is_repeatable = true AND r.last_triggered_at IS NOT NULL
       AND r.last_triggered_at > now() - v_cooldown THEN
      CONTINUE;
    END IF;

    -- Evaluate operator
    IF r.operator = 'below_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price < r.target_value;
    ELSIF r.operator = 'above_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price > r.target_value;
    ELSIF r.operator = 'increase_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent >= r.target_value;
    ELSIF r.operator = 'decrease_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent <= -1 * r.target_value;
    ELSIF r.operator = 'below_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd < r.target_value;
    ELSIF r.operator = 'above_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd > r.target_value;
    ELSIF r.operator = 'stock_status_changed' THEN
      -- Stock change is handled by separate path; skip in price-trigger context
      v_match := false;
    END IF;

    IF v_match THEN
      v_title := COALESCE(v_product_name, 'محصول');
      v_message := CASE r.operator
        WHEN 'below_price' THEN format('قیمت %s کمتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'above_price' THEN format('قیمت %s بیشتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'increase_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% افزایش یافت.', COALESCE(v_product_name,''), to_char(p_change_percent,'FM990D0'))
        WHEN 'decrease_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% کاهش یافت.', COALESCE(v_product_name,''), to_char(abs(p_change_percent),'FM990D0'))
        WHEN 'below_usd_price' THEN format('قیمت دلاری %s کمتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        WHEN 'above_usd_price' THEN format('قیمت دلاری %s بیشتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        ELSE format('شرط هشدار قیمت %s برقرار شد.', COALESCE(v_product_name,''))
      END;

      INSERT INTO price_alert_notifications(
        user_id, alert_rule_id, product_id, sale_price_type_id,
        title, message, current_price, previous_price, change_percent
      ) VALUES (
        r.user_id, r.id, p_product_id, p_sale_price_type_id,
        v_title, v_message, p_current_price, p_previous_price, p_change_percent
      );

      INSERT INTO notification_events(event_type, user_id, channel, payload, status)
      VALUES (
        'price_alert_triggered', r.user_id, 'internal',
        jsonb_build_object(
          'alert_rule_id', r.id,
          'product_id', p_product_id,
          'sale_price_type_id', p_sale_price_type_id,
          'operator', r.operator,
          'target_value', r.target_value,
          'current_price', p_current_price,
          'previous_price', p_previous_price,
          'change_percent', p_change_percent,
          'title', v_title,
          'message', v_message
        ),
        'pending'
      );

      UPDATE price_alert_rules
      SET last_triggered_at = now(),
          triggered_count = triggered_count + 1,
          is_active = CASE WHEN is_repeatable THEN is_active ELSE false END
      WHERE id = r.id;

      v_triggered := v_triggered + 1;
    END IF;
  END LOOP;

  RETURN v_triggered;
END;$$;

REVOKE ALL ON FUNCTION public.check_price_alerts_for_product(uuid, uuid, numeric, numeric, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.check_price_alerts_for_product(uuid, uuid, numeric, numeric, numeric) TO authenticated;

-- 5) Trigger on product_sale_price_history
CREATE OR REPLACE FUNCTION public._par_after_price_history_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.check_price_alerts_for_product(
    NEW.product_id,
    NEW.sale_price_type_id,
    NEW.new_sale_price,
    NEW.old_sale_price,
    NEW.change_percent
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block price writes due to alert evaluation failure
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_par_after_price_history ON public.product_sale_price_history;
CREATE TRIGGER trg_par_after_price_history
  AFTER INSERT ON public.product_sale_price_history
  FOR EACH ROW EXECUTE FUNCTION public._par_after_price_history_insert();
