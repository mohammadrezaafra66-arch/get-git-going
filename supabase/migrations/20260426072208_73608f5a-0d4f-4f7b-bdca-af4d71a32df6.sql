CREATE OR REPLACE FUNCTION public.bot_key_stats_today()
RETURNS TABLE(
  api_key_id uuid,
  requests_today bigint,
  errors_today bigint,
  last_used_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.api_key_id,
      count(*)                                                        AS requests_today,
      count(*) FILTER (WHERE l.status_code >= 400)                    AS errors_today,
      max(l.created_at)                                               AS last_used_at
    FROM public.bot_api_usage_logs l
    WHERE l.api_key_id IS NOT NULL
      AND l.created_at >= date_trunc('day', now())
    GROUP BY l.api_key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_suspicious_ips(p_limit int DEFAULT 20)
RETURNS TABLE(
  ip text,
  failed_count bigint,
  last_attempt_at timestamptz,
  distinct_endpoints bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.ip,
      count(*)                       AS failed_count,
      max(l.created_at)              AS last_attempt_at,
      count(DISTINCT l.endpoint)     AS distinct_endpoints
    FROM public.bot_api_usage_logs l
    WHERE l.ip IS NOT NULL
      AND l.status_code >= 400
      AND l.created_at >= now() - interval '24 hours'
    GROUP BY l.ip
    HAVING count(*) >= 5
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;