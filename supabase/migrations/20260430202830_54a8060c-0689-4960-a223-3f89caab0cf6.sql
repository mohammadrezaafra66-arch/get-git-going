
CREATE INDEX IF NOT EXISTS idx_employee_scores_monthly_desc
  ON public.employee_scores(monthly_score DESC);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_employee_captured
  ON public.score_snapshots(employee_id, captured_at);

DROP FUNCTION IF EXISTS public.get_leaderboard(text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.get_leaderboard_daily(text,text,text,integer);
DROP FUNCTION IF EXISTS public.get_leaderboard_weekly(text,text,text,integer);
DROP FUNCTION IF EXISTS public.get_leaderboard_monthly(text,text,text,integer);
DROP FUNCTION IF EXISTS public.get_leaderboard_all_time(text,text,text,integer);

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  _period text DEFAULT 'monthly',
  _team text DEFAULT NULL,
  _department text DEFAULT NULL,
  _role text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  employee_id uuid, full_name text, team text, department text,
  role text, score numeric, rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      es.employee_id, p.full_name,
      NULLIF(p.team, '') AS team,
      NULLIF(p.department, '') AS department,
      ur.role::text AS role,
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
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_team       IS NULL OR team       = _team)
      AND (_department IS NULL OR department = _department)
      AND (_role       IS NULL OR role       = _role)
  ),
  ranked AS (
    SELECT f.*, RANK() OVER (ORDER BY f.score DESC) AS rank FROM filtered f
  )
  SELECT employee_id, full_name, team, department, role, score, rank
  FROM ranked
  ORDER BY rank, employee_id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard_daily(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('daily', _team, _department, _role, _limit, _offset);
$$;
CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('weekly', _team, _department, _role, _limit, _offset);
$$;
CREATE OR REPLACE FUNCTION public.get_leaderboard_monthly(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('monthly', _team, _department, _role, _limit, _offset);
$$;
CREATE OR REPLACE FUNCTION public.get_leaderboard_all_time(
  _team text DEFAULT NULL, _department text DEFAULT NULL, _role text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_leaderboard('all_time', _team, _department, _role, _limit, _offset);
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer)    FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer)   FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer)  FROM public;
REVOKE ALL ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_employee_rank(_employee_id uuid)
RETURNS TABLE (
  employee_id uuid,
  daily_score numeric, weekly_score numeric, monthly_score numeric, total_score numeric,
  daily_rank bigint, weekly_rank bigint, monthly_rank bigint, all_time_rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id, es.daily_score, es.weekly_score, es.monthly_score, es.total_score,
      RANK() OVER (ORDER BY es.daily_score   DESC) AS daily_rank,
      RANK() OVER (ORDER BY es.weekly_score  DESC) AS weekly_rank,
      RANK() OVER (ORDER BY es.monthly_score DESC) AS monthly_rank,
      RANK() OVER (ORDER BY es.total_score   DESC) AS all_time_rank
    FROM public.employee_scores es
  )
  SELECT * FROM ranked WHERE employee_id = _employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employee_rank(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_employee_rank(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_rank_neighbors(
  _employee_id uuid,
  _period text DEFAULT 'monthly',
  _window integer DEFAULT 3
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  score numeric,
  rank bigint,
  relative_position text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id,
      p.full_name,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score,
      RANK() OVER (ORDER BY
        CASE _period
          WHEN 'daily'    THEN es.daily_score
          WHEN 'weekly'   THEN es.weekly_score
          WHEN 'all_time' THEN es.total_score
          ELSE es.monthly_score
        END DESC
      ) AS rank
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
  ),
  me AS (
    SELECT rank AS r FROM ranked WHERE employee_id = _employee_id LIMIT 1
  )
  SELECT
    r.employee_id, r.full_name, r.score, r.rank,
    CASE
      WHEN r.employee_id = _employee_id THEN 'self'
      WHEN r.rank < (SELECT r FROM me) THEN 'above'
      ELSE 'below'
    END AS relative_position
  FROM ranked r, me
  WHERE r.rank BETWEEN (me.r - _window) AND (me.r + _window)
  ORDER BY r.rank;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rank_neighbors(uuid,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_rank_neighbors(uuid,text,integer) TO authenticated;
