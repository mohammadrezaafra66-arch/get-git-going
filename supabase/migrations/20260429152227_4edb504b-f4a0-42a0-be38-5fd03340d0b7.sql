
-- 1. currency_sources
CREATE TABLE public.currency_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text,
  api_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currency_sources_read"
  ON public.currency_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "currency_sources_write"
  ON public.currency_sources FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

CREATE TRIGGER trg_currency_sources_updated_at
  BEFORE UPDATE ON public.currency_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. currency_rate_fetches
CREATE TABLE public.currency_rate_fetches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.currency_sources(id) ON DELETE CASCADE,
  currency currency_code NOT NULL,
  rate numeric(15,2) NOT NULL CHECK (rate > 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  fetched_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  note text
);

CREATE INDEX idx_crf_currency ON public.currency_rate_fetches(currency);
CREATE INDEX idx_crf_status ON public.currency_rate_fetches(status);
CREATE INDEX idx_crf_fetched_at ON public.currency_rate_fetches(fetched_at DESC);
CREATE INDEX idx_crf_source_fetched ON public.currency_rate_fetches(source_id, fetched_at DESC);

ALTER TABLE public.currency_rate_fetches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crf_read"
  ON public.currency_rate_fetches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "crf_write"
  ON public.currency_rate_fetches FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

-- 3. New columns on currency_rates
ALTER TABLE public.currency_rates
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS fetch_source_id uuid REFERENCES public.currency_sources(id);

-- 4. Default alert threshold setting
INSERT INTO public.shop_settings (key, value)
VALUES ('alert_threshold_percent', '5')
ON CONFLICT (key) DO NOTHING;

-- 5. RPC: record a fetched rate (called from client after http fetch)
CREATE OR REPLACE FUNCTION public.record_currency_fetch(
  p_source_id uuid,
  p_currency currency_code,
  p_rate numeric,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
  v_id uuid;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'invalid rate';
  END IF;

  -- Rate limit: 10/hour per source
  SELECT count(*) INTO v_count
    FROM currency_rate_fetches
    WHERE source_id = p_source_id
      AND fetched_at > now() - interval '1 hour';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO currency_rate_fetches(source_id, currency, rate, fetched_by, note)
    VALUES (p_source_id, p_currency, p_rate, v_user, p_note)
    RETURNING id INTO v_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_fetched', 'currency_rate_fetches', v_id::text, v_user,
      jsonb_build_object('source_id', p_source_id, 'currency', p_currency, 'rate', p_rate));

  RETURN v_id;
END;
$$;

-- 6. RPC: approve a fetched rate (creates currency_rates row + alert)
CREATE OR REPLACE FUNCTION public.approve_currency_fetch(
  p_fetch_id uuid,
  p_deactivate_previous boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_fetch currency_rate_fetches%ROWTYPE;
  v_old_rate numeric;
  v_threshold numeric;
  v_diff_pct numeric;
  v_new_rate_id uuid;
  v_source_name text;
  r_user RECORD;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_fetch FROM currency_rate_fetches WHERE id = p_fetch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fetch not found'; END IF;
  IF v_fetch.status <> 'pending_review' THEN RAISE EXCEPTION 'already processed'; END IF;

  -- Latest active rate for diff
  SELECT rate_to_toman INTO v_old_rate
    FROM currency_rates
    WHERE currency = v_fetch.currency AND is_active = true
    ORDER BY effective_at DESC LIMIT 1;

  IF p_deactivate_previous THEN
    UPDATE currency_rates SET is_active = false
      WHERE currency = v_fetch.currency AND is_active = true;
  END IF;

  SELECT name INTO v_source_name FROM currency_sources WHERE id = v_fetch.source_id;

  INSERT INTO currency_rates(currency, rate_to_toman, source_name, is_active, approved_by, approved_at, fetch_source_id)
    VALUES (v_fetch.currency, v_fetch.rate, COALESCE(v_source_name, 'منبع خودکار'), true, v_user, now(), v_fetch.source_id)
    RETURNING id INTO v_new_rate_id;

  UPDATE currency_rate_fetches
    SET status = 'approved', approved_by = v_user, approved_at = now()
    WHERE id = p_fetch_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_approved', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('currency', v_fetch.currency, 'rate', v_fetch.rate, 'old_rate', v_old_rate));

  -- Alert if threshold exceeded
  IF v_old_rate IS NOT NULL AND v_old_rate > 0 THEN
    SELECT COALESCE(NULLIF(value,'')::numeric, 5) INTO v_threshold
      FROM shop_settings WHERE key = 'alert_threshold_percent';
    v_threshold := COALESCE(v_threshold, 5);
    v_diff_pct := abs(v_fetch.rate - v_old_rate) / v_old_rate * 100;

    IF v_diff_pct >= v_threshold THEN
      FOR r_user IN
        SELECT DISTINCT p.id
          FROM profiles p
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE ur.role IN ('admin','accountant')
      LOOP
        INSERT INTO notification_queue(user_id, title, body, type, reference_type, reference_id)
          VALUES (
            r_user.id,
            'هشدار تغییر نرخ ارز',
            format('نرخ %s از %s به %s تغییر کرده است (%s٪)', v_fetch.currency, round(v_old_rate,2), round(v_fetch.rate,2), round(v_diff_pct,2)),
            'system',
            'currency_rates',
            v_new_rate_id
          );
      END LOOP;

      INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
        VALUES ('currency_rate_alert', 'currency_rates', v_new_rate_id::text, v_user,
          jsonb_build_object('currency', v_fetch.currency, 'old_rate', v_old_rate, 'new_rate', v_fetch.rate, 'diff_pct', v_diff_pct, 'threshold', v_threshold));
    END IF;
  END IF;

  RETURN v_new_rate_id;
END;
$$;

-- 7. RPC: reject a fetched rate
CREATE OR REPLACE FUNCTION public.reject_currency_fetch(
  p_fetch_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE currency_rate_fetches
    SET status = 'rejected', approved_by = v_user, approved_at = now(),
        note = COALESCE(p_reason, note)
    WHERE id = p_fetch_id AND status = 'pending_review';

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_rejected', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('reason', p_reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_currency_fetch(uuid, currency_code, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_currency_fetch(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_currency_fetch(uuid, text) TO authenticated;
