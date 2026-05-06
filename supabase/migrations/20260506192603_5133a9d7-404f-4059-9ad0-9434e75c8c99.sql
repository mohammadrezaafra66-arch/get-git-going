-- 1) Settings table (singleton)
CREATE TABLE IF NOT EXISTS public.recent_purchase_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  limited_after_hours numeric(6,2) NOT NULL DEFAULT 6,
  unavailable_after_hours numeric(6,2) NOT NULL DEFAULT 12,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT recent_purchase_settings_hours_chk
    CHECK (limited_after_hours > 0 AND unavailable_after_hours > limited_after_hours)
);

-- Seed singleton row
INSERT INTO public.recent_purchase_settings (singleton, limited_after_hours, unavailable_after_hours)
VALUES (true, 6, 12)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.recent_purchase_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recent_purchase_settings read authenticated"
  ON public.recent_purchase_settings;
CREATE POLICY "recent_purchase_settings read authenticated"
  ON public.recent_purchase_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "recent_purchase_settings update elevated"
  ON public.recent_purchase_settings;
CREATE POLICY "recent_purchase_settings update elevated"
  ON public.recent_purchase_settings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "recent_purchase_settings insert elevated"
  ON public.recent_purchase_settings;
CREATE POLICY "recent_purchase_settings insert elevated"
  ON public.recent_purchase_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_recent_purchase_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recent_purchase_settings_updated_at
  ON public.recent_purchase_settings;
CREATE TRIGGER trg_recent_purchase_settings_updated_at
  BEFORE UPDATE ON public.recent_purchase_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_recent_purchase_settings_updated_at();

-- 2) Dynamic label function (read-only, pure)
CREATE OR REPLACE FUNCTION public.get_recent_purchase_label(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_limited numeric;
  v_unavail numeric;
  v_hours numeric;
  v_status text;
  v_is_today boolean;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'none',
      'is_today_purchase', false,
      'last_purchase_at', NULL,
      'hours_since', NULL
    );
  END IF;

  SELECT limited_after_hours, unavailable_after_hours
    INTO v_limited, v_unavail
  FROM public.recent_purchase_settings
  WHERE singleton = true
  LIMIT 1;

  IF v_limited IS NULL THEN
    v_limited := 6;
    v_unavail := 12;
  END IF;

  SELECT MAX(created_at) INTO v_last
  FROM public.purchases
  WHERE product_id = p_product_id
    AND status IS DISTINCT FROM 'cancelled';

  IF v_last IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'none',
      'is_today_purchase', false,
      'last_purchase_at', NULL,
      'hours_since', NULL
    );
  END IF;

  v_hours := EXTRACT(EPOCH FROM (now() - v_last)) / 3600.0;

  IF v_hours < v_limited THEN
    v_status := 'full';
    v_is_today := true;
  ELSIF v_hours < v_unavail THEN
    v_status := 'limited';
    v_is_today := true;
  ELSE
    v_status := 'none';
    v_is_today := false;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'is_today_purchase', v_is_today,
    'last_purchase_at', v_last,
    'hours_since', round(v_hours::numeric, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_recent_purchase_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid) TO authenticated, anon;