-- Indexes for bot_api_usage_logs
CREATE INDEX IF NOT EXISTS idx_bot_usage_key_created
  ON public.bot_api_usage_logs (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_ip_created
  ON public.bot_api_usage_logs (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_table_created
  ON public.bot_api_usage_logs (table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_status_created
  ON public.bot_api_usage_logs (status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_error_created
  ON public.bot_api_usage_logs (error_code, created_at DESC) WHERE error_code IS NOT NULL;

-- Rate limit check
-- Returns: ok boolean, retry_after_seconds int, reason text
CREATE OR REPLACE FUNCTION public.bot_check_rate_limit(
  p_key_id uuid,
  p_ip text
) RETURNS TABLE(ok boolean, retry_after_seconds int, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _per_min_count int;
  _per_day_count int;
  _ip_fail_count int;
  _max_per_min constant int := 120;
  _max_per_day constant int := 5000;
  _max_ip_fail constant int := 30;
BEGIN
  IF p_key_id IS NOT NULL THEN
    SELECT count(*) INTO _per_min_count
      FROM public.bot_api_usage_logs
      WHERE api_key_id = p_key_id
        AND created_at >= now() - interval '1 minute';
    IF _per_min_count >= _max_per_min THEN
      RETURN QUERY SELECT false, 60, 'rate_limit_per_minute'::text;
      RETURN;
    END IF;

    SELECT count(*) INTO _per_day_count
      FROM public.bot_api_usage_logs
      WHERE api_key_id = p_key_id
        AND created_at >= now() - interval '1 day';
    IF _per_day_count >= _max_per_day THEN
      RETURN QUERY SELECT false, 3600, 'rate_limit_per_day'::text;
      RETURN;
    END IF;
  ELSIF p_ip IS NOT NULL THEN
    -- Unauthenticated IP-based limit (failed attempts)
    SELECT count(*) INTO _ip_fail_count
      FROM public.bot_api_usage_logs
      WHERE ip = p_ip
        AND api_key_id IS NULL
        AND status_code >= 400
        AND created_at >= now() - interval '10 minutes';
    IF _ip_fail_count >= _max_ip_fail THEN
      RETURN QUERY SELECT false, 600, 'rate_limit_ip_failures'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 0, ''::text;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_check_rate_limit(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_check_rate_limit(uuid, text) TO service_role;

-- Per-key daily stats (for management UI)
CREATE OR REPLACE FUNCTION public.bot_key_stats_today()
RETURNS TABLE(
  api_key_id uuid,
  requests_today bigint,
  errors_today bigint,
  last_used_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    l.api_key_id,
    count(*)                                                        AS requests_today,
    count(*) FILTER (WHERE l.status_code >= 400)                    AS errors_today,
    max(l.created_at)                                               AS last_used_at
  FROM public.bot_api_usage_logs l
  WHERE l.api_key_id IS NOT NULL
    AND l.created_at >= date_trunc('day', now())
  GROUP BY l.api_key_id;
$$;

REVOKE ALL ON FUNCTION public.bot_key_stats_today() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bot_key_stats_today() TO authenticated;

-- Suspicious IP stats (recent failed attempts without valid key)
CREATE OR REPLACE FUNCTION public.bot_suspicious_ips(p_limit int DEFAULT 20)
RETURNS TABLE(
  ip text,
  failed_count bigint,
  last_attempt_at timestamptz,
  distinct_endpoints bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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
  ORDER BY failed_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

REVOKE ALL ON FUNCTION public.bot_suspicious_ips(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bot_suspicious_ips(int) TO authenticated;