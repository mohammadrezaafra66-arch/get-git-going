-- FX.1C: minimal hardening — enforce role check inside public RPC so viewer cannot bypass UI guard
CREATE OR REPLACE FUNCTION public.list_market_rate_ticks_public(
  p_indicator_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 15
)
RETURNS TABLE(
  id uuid, indicator_id uuid, source_id uuid, value numeric, unit text,
  observed_at timestamp with time zone, jalali_date_label text,
  change_amount numeric, change_percent numeric, status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (
       public.has_role(v_uid,'admin'::public.app_role)
    OR public.has_role(v_uid,'manager'::public.app_role)
    OR public.has_role(v_uid,'accountant'::public.app_role)
    OR public.has_role(v_uid,'sales'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'دسترسی به نرخ‌های بازار مجاز نیست';
  END IF;

  RETURN QUERY
  SELECT t.id, t.indicator_id, t.source_id, t.value, t.unit, t.observed_at,
         t.jalali_date_label, t.change_amount, t.change_percent, t.status
  FROM public.market_rate_ticks t
  WHERE t.status = 'accepted'
    AND (p_indicator_id IS NULL OR t.indicator_id = p_indicator_id)
  ORDER BY t.observed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid, integer) TO authenticated;