
-- 1) Snapshots table
CREATE TABLE public.score_snapshots (
  id bigserial PRIMARY KEY,
  employee_id uuid NOT NULL,
  daily_score numeric NOT NULL DEFAULT 0,
  weekly_score numeric NOT NULL DEFAULT 0,
  monthly_score numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  normalized_score numeric NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_score_snapshots_employee ON public.score_snapshots(employee_id);
CREATE INDEX idx_score_snapshots_captured_at ON public.score_snapshots(captured_at DESC);
CREATE INDEX idx_score_snapshots_employee_time ON public.score_snapshots(employee_id, captured_at DESC);

ALTER TABLE public.score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Self/admin/manager view snapshots"
  ON public.score_snapshots FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
  );

-- 2) Snapshot capture function
CREATE OR REPLACE FUNCTION public.capture_score_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  INSERT INTO public.score_snapshots (
    employee_id, daily_score, weekly_score, monthly_score,
    total_score, normalized_score, captured_at
  )
  SELECT employee_id, daily_score, weekly_score, monthly_score,
         total_score, normalized_score, now()
  FROM public.employee_scores;
  GET DIAGNOSTICS _count = ROW_COUNT;

  -- retention: 90 days
  DELETE FROM public.score_snapshots
   WHERE captured_at < now() - interval '90 days';

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_score_snapshots() FROM public;

-- 3) Leaderboard helper (generic — period: 'daily' | 'weekly' | 'monthly' | 'all_time')
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  _period text DEFAULT 'monthly',
  _team text DEFAULT NULL,
  _department text DEFAULT NULL,
  _role text DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  team text,
  department text,
  role text,
  score numeric,
  rank bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      es.employee_id,
      p.full_name,
      NULLIF(p.team, '')       AS team,
      NULLIF(p.department, '') AS department,
      ur.role::text            AS role,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'monthly'  THEN es.monthly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
    LEFT JOIN LATERAL (
      SELECT role FROM public.user_roles WHERE user_id = es.employee_id LIMIT 1
    ) ur ON TRUE
  )
  SELECT
    b.employee_id, b.full_name, b.team, b.department, b.role, b.score,
    RANK() OVER (ORDER BY b.score DESC) AS rank
  FROM base b
  WHERE (_team       IS NULL OR b.team       = _team)
    AND (_department IS NULL OR b.department = _department)
    AND (_role       IS NULL OR b.role       = _role)
  ORDER BY b.score DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(text,text,text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer) TO authenticated;

-- 4) Convenience wrappers
CREATE OR REPLACE FUNCTION public.get_leaderboard_daily(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL, _limit integer DEFAULT 50
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('daily', _team, _department, _role, _limit);
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL, _limit integer DEFAULT 50
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('weekly', _team, _department, _role, _limit);
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_monthly(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL, _limit integer DEFAULT 50
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('monthly', _team, _department, _role, _limit);
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_all_time(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL, _limit integer DEFAULT 50
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('all_time', _team, _department, _role, _limit);
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_daily(text,text,text,integer)    FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer)   FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer)  FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer) TO authenticated;

-- 5) Cron — every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('capture-score-snapshots-5min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='capture-score-snapshots-5min');
    PERFORM cron.schedule(
      'capture-score-snapshots-5min',
      '*/5 * * * *',
      $cron$ SELECT public.capture_score_snapshots(); $cron$
    );
  END IF;
END $$;
