DROP VIEW IF EXISTS public.market_rate_ticks_public;

CREATE OR REPLACE FUNCTION public.list_market_rate_ticks_public(
  p_indicator_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  id uuid, indicator_id uuid, source_id uuid, value numeric, unit text,
  observed_at timestamptz, jalali_date_label text,
  change_amount numeric, change_percent numeric, status text
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT t.id, t.indicator_id, t.source_id, t.value, t.unit, t.observed_at,
         t.jalali_date_label, t.change_amount, t.change_percent, t.status
  FROM public.market_rate_ticks t
  WHERE t.status = 'accepted'
    AND (p_indicator_id IS NULL OR t.indicator_id = p_indicator_id)
  ORDER BY t.observed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid, integer) TO authenticated;
