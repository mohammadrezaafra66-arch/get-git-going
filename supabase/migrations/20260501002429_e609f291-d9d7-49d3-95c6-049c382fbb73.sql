
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
      p.full_name    AS full_name_v,
      NULL::text     AS team_v,
      NULL::text     AS dept_v,
      ur.role::text  AS role_v,
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
    r.emp_id      AS employee_id,
    r.full_name_v AS full_name,
    r.team_v      AS team,
    r.dept_v      AS department,
    r.role_v      AS role,
    r.score_v     AS score,
    r.rnk         AS rank
  FROM ranked r
  ORDER BY r.rnk, r.emp_id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$function$;
