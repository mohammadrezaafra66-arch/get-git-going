
-- Fix 1: get_leaderboard — "role" was ambiguous (output column + CTE column)
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  _period text DEFAULT 'monthly'::text,
  _team text DEFAULT NULL::text,
  _department text DEFAULT NULL::text,
  _role text DEFAULT NULL::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      es.employee_id AS emp_id,
      p.full_name    AS full_name,
      NULLIF(p.team, '')        AS team_v,
      NULLIF(p.department, '')  AS dept_v,
      ur.role::text             AS role_v,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'monthly'  THEN es.monthly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score_v
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
    LEFT JOIN LATERAL (
      SELECT ur2.role FROM public.user_roles ur2 WHERE ur2.user_id = es.employee_id LIMIT 1
    ) ur ON TRUE
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_team       IS NULL OR team_v = _team)
      AND (_department IS NULL OR dept_v = _department)
      AND (_role       IS NULL OR role_v = _role)
  ),
  ranked AS (
    SELECT f.*, RANK() OVER (ORDER BY f.score_v DESC) AS rnk FROM filtered f
  )
  SELECT
    r.emp_id     AS employee_id,
    r.full_name  AS full_name,
    r.team_v     AS team,
    r.dept_v     AS department,
    r.role_v     AS role,
    r.score_v    AS score,
    r.rnk        AS rank
  FROM ranked r
  ORDER BY r.rnk, r.emp_id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$function$;

-- Fix 2: get_employee_rank — "employee_id" was ambiguous (output col + CTE col)
CREATE OR REPLACE FUNCTION public.get_employee_rank(_employee_id uuid)
RETURNS TABLE(
  employee_id uuid,
  daily_score numeric, weekly_score numeric, monthly_score numeric, total_score numeric,
  daily_rank bigint, weekly_rank bigint, monthly_rank bigint, all_time_rank bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      es.daily_score, es.weekly_score, es.monthly_score, es.total_score,
      RANK() OVER (ORDER BY es.daily_score   DESC) AS d_rank,
      RANK() OVER (ORDER BY es.weekly_score  DESC) AS w_rank,
      RANK() OVER (ORDER BY es.monthly_score DESC) AS m_rank,
      RANK() OVER (ORDER BY es.total_score   DESC) AS a_rank
    FROM public.employee_scores es
  )
  SELECT
    r.emp_id        AS employee_id,
    r.daily_score, r.weekly_score, r.monthly_score, r.total_score,
    r.d_rank        AS daily_rank,
    r.w_rank        AS weekly_rank,
    r.m_rank        AS monthly_rank,
    r.a_rank        AS all_time_rank
  FROM ranked r
  WHERE r.emp_id = _employee_id;
END;
$function$;

-- Fix 3: get_rank_neighbors — "rank" / "employee_id" ambiguous (output col + CTE col)
CREATE OR REPLACE FUNCTION public.get_rank_neighbors(
  _employee_id uuid,
  _period text DEFAULT 'monthly'::text,
  _window integer DEFAULT 3
)
RETURNS TABLE(employee_id uuid, full_name text, score numeric, rank bigint, relative_position text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      p.full_name    AS full_name,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score_v,
      RANK() OVER (ORDER BY
        CASE _period
          WHEN 'daily'    THEN es.daily_score
          WHEN 'weekly'   THEN es.weekly_score
          WHEN 'all_time' THEN es.total_score
          ELSE es.monthly_score
        END DESC
      ) AS rnk
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
  ),
  me AS (
    SELECT r.rnk AS r FROM ranked r WHERE r.emp_id = _employee_id LIMIT 1
  )
  SELECT
    r.emp_id    AS employee_id,
    r.full_name AS full_name,
    r.score_v   AS score,
    r.rnk       AS rank,
    CASE
      WHEN r.emp_id = _employee_id THEN 'self'
      WHEN r.rnk < (SELECT m.r FROM me m) THEN 'above'
      ELSE 'below'
    END AS relative_position
  FROM ranked r, me
  WHERE r.rnk BETWEEN (me.r - _window) AND (me.r + _window)
  ORDER BY r.rnk;
END;
$function$;
