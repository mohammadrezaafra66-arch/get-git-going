-- Phase 10.7B: Gamification Manager Analytics RPCs
-- All functions are SECURITY DEFINER, validate admin/manager role internally,
-- and bound results with limits. They aggregate ONLY public.gamification data
-- and do not expose any sensitive PII beyond profile name already used in app.

-- Helper: assert caller is admin or manager
CREATE OR REPLACE FUNCTION public.gamification_assert_manager()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: فقط مدیر یا مدیر ارشد می‌تواند داده‌های تحلیلی را ببیند' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.gamification_assert_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_assert_manager() TO authenticated;

-- 1. Summary KPI cards (single row)
CREATE OR REPLACE FUNCTION public.gamification_analytics_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_employee_id uuid DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE(
  total_events bigint,
  total_achievements bigint,
  total_missions_completed bigint,
  active_employees bigint,
  avg_events_per_employee numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT employee_id
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
      AND (p_event_type IS NULL OR event_type = p_event_type)
  ),
  ach AS (
    SELECT 1 FROM public.employee_achievements
    WHERE unlocked_at >= p_from AND unlocked_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
  ),
  mis AS (
    SELECT 1 FROM public.employee_mission_progress
    WHERE completed = true
      AND completed_at IS NOT NULL
      AND completed_at >= p_from AND completed_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
  )
  SELECT
    (SELECT count(*) FROM ev)::bigint                                  AS total_events,
    (SELECT count(*) FROM ach)::bigint                                 AS total_achievements,
    (SELECT count(*) FROM mis)::bigint                                 AS total_missions_completed,
    (SELECT count(DISTINCT employee_id) FROM ev)::bigint               AS active_employees,
    CASE WHEN (SELECT count(DISTINCT employee_id) FROM ev) > 0
         THEN round(((SELECT count(*) FROM ev))::numeric / (SELECT count(DISTINCT employee_id) FROM ev), 2)
         ELSE 0
    END                                                                AS avg_events_per_employee;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_summary(timestamptz, timestamptz, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_summary(timestamptz, timestamptz, uuid, text) TO authenticated;

-- 2. Activity trend (events per day, capped at 90 days)
CREATE OR REPLACE FUNCTION public.gamification_analytics_trend(
  p_from timestamptz,
  p_to timestamptz,
  p_employee_id uuid DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE(
  day date,
  event_type text,
  cnt bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to timestamptz := LEAST(p_to, p_from + interval '90 days');
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT (e.triggered_at AT TIME ZONE 'UTC')::date AS day,
         e.event_type,
         count(*)::bigint AS cnt
  FROM public.employee_score_events e
  WHERE e.triggered_at >= p_from AND e.triggered_at < v_to
    AND (p_employee_id IS NULL OR e.employee_id = p_employee_id)
    AND (p_event_type IS NULL OR e.event_type = p_event_type)
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC
  LIMIT 5000;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_trend(timestamptz, timestamptz, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_trend(timestamptz, timestamptz, uuid, text) TO authenticated;

-- 3. Top employees (limit 50)
CREATE OR REPLACE FUNCTION public.gamification_analytics_top_employees(
  p_from timestamptz,
  p_to timestamptz,
  p_event_type text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  events_count bigint,
  missions_count bigint,
  achievements_count bigint,
  current_league text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
      AND (p_event_type IS NULL OR event_type = p_event_type)
    GROUP BY employee_id
  ),
  mis AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_mission_progress
    WHERE completed = true AND completed_at IS NOT NULL
      AND completed_at >= p_from AND completed_at < p_to
    GROUP BY employee_id
  ),
  ach AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_achievements
    WHERE unlocked_at >= p_from AND unlocked_at < p_to
    GROUP BY employee_id
  ),
  lg AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT
    ev.employee_id,
    p.full_name,
    ev.c                                  AS events_count,
    COALESCE(mis.c, 0)                    AS missions_count,
    COALESCE(ach.c, 0)                    AS achievements_count,
    lg.league                             AS current_league
  FROM ev
  LEFT JOIN public.profiles p ON p.id = ev.employee_id
  LEFT JOIN mis ON mis.employee_id = ev.employee_id
  LEFT JOIN ach ON ach.employee_id = ev.employee_id
  LEFT JOIN lg  ON lg.employee_id  = ev.employee_id
  ORDER BY ev.c DESC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_top_employees(timestamptz, timestamptz, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_top_employees(timestamptz, timestamptz, text, integer) TO authenticated;

-- 4. KPI effectiveness — count per event_type joined to gamification_kpi_rules
CREATE OR REPLACE FUNCTION public.gamification_analytics_kpi_effectiveness(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  event_key text,
  title_fa text,
  xp_amount numeric,
  is_active boolean,
  events_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT event_type, count(*)::bigint AS c
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
    GROUP BY event_type
  )
  SELECT
    COALESCE(r.event_key, ev.event_type)               AS event_key,
    r.title_fa,
    r.xp_amount,
    COALESCE(r.is_active, false)                       AS is_active,
    COALESCE(ev.c, 0)                                  AS events_count
  FROM public.gamification_kpi_rules r
  FULL OUTER JOIN ev ON ev.event_type = r.event_key
  ORDER BY events_count DESC NULLS LAST
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_kpi_effectiveness(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_kpi_effectiveness(timestamptz, timestamptz) TO authenticated;

-- 5. Mission analytics
CREATE OR REPLACE FUNCTION public.gamification_analytics_missions(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  mission_id uuid,
  title_fa text,
  xp_reward integer,
  enabled boolean,
  completions bigint,
  unique_employees bigint,
  avg_progress numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH p AS (
    SELECT mission_id,
           count(*) FILTER (WHERE completed = true AND completed_at >= p_from AND completed_at < p_to)::bigint AS completions,
           count(DISTINCT employee_id) FILTER (WHERE completed = true AND completed_at >= p_from AND completed_at < p_to)::bigint AS uniq,
           round(avg(progress) FILTER (WHERE created_at >= p_from AND created_at < p_to), 2) AS avgp
    FROM public.employee_mission_progress
    GROUP BY mission_id
  )
  SELECT m.id,
         m.title_fa,
         m.xp_reward,
         m.enabled,
         COALESCE(p.completions, 0),
         COALESCE(p.uniq, 0),
         COALESCE(p.avgp, 0)
  FROM public.missions m
  LEFT JOIN p ON p.mission_id = m.id
  ORDER BY COALESCE(p.completions, 0) DESC, m.title_fa ASC
  LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_missions(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_missions(timestamptz, timestamptz) TO authenticated;

-- 6. Achievement analytics
CREATE OR REPLACE FUNCTION public.gamification_analytics_achievements(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  achievement_id uuid,
  title_fa text,
  xp_reward integer,
  enabled boolean,
  unlocks bigint,
  last_unlock timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ea AS (
    SELECT achievement_id,
           count(*) FILTER (WHERE unlocked_at >= p_from AND unlocked_at < p_to)::bigint AS unlocks,
           max(unlocked_at) AS last_unlock
    FROM public.employee_achievements
    GROUP BY achievement_id
  )
  SELECT a.id, a.title_fa, a.xp_reward, a.enabled,
         COALESCE(ea.unlocks, 0), ea.last_unlock
  FROM public.achievements a
  LEFT JOIN ea ON ea.achievement_id = a.id
  ORDER BY COALESCE(ea.unlocks, 0) DESC, a.title_fa ASC
  LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_achievements(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_achievements(timestamptz, timestamptz) TO authenticated;

-- 7. League distribution (latest per employee)
CREATE OR REPLACE FUNCTION public.gamification_analytics_league_distribution()
RETURNS TABLE(
  league text,
  employees_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT league, count(*)::bigint
  FROM latest
  GROUP BY league
  ORDER BY 1;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_league_distribution() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_league_distribution() TO authenticated;

-- 8. Risk / inactivity — among employees with at least one historical event,
-- compute event count in window and last event time. Returns up to 50 with
-- lowest activity in window.
CREATE OR REPLACE FUNCTION public.gamification_analytics_risk(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  events_in_window bigint,
  last_event_at timestamptz,
  current_league text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH agg AS (
    SELECT employee_id,
           count(*) FILTER (WHERE triggered_at >= p_from AND triggered_at < p_to)::bigint AS in_win,
           max(triggered_at) AS last_at
    FROM public.employee_score_events
    GROUP BY employee_id
  ),
  lg AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT a.employee_id,
         p.full_name,
         a.in_win,
         a.last_at,
         lg.league,
         CASE
           WHEN a.in_win = 0 THEN 'inactive'
           WHEN a.in_win < 5 THEN 'low'
           ELSE 'normal'
         END AS status
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.employee_id
  LEFT JOIN lg ON lg.employee_id = a.employee_id
  WHERE a.in_win < 5
  ORDER BY a.in_win ASC, a.last_at ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_risk(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_risk(timestamptz, timestamptz, integer) TO authenticated;

-- 9. Helper: lightweight employee list for filter (admin/manager only)
CREATE OR REPLACE FUNCTION public.gamification_analytics_employees()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.employee_score_events e WHERE e.employee_id = p.id)
  ORDER BY p.full_name ASC
  LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_employees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_employees() TO authenticated;

-- 10. Active league season
CREATE OR REPLACE FUNCTION public.gamification_analytics_active_season()
RETURNS TABLE(id uuid, title_fa text, starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT s.id, s.title_fa, s.starts_at, s.ends_at
  FROM public.league_seasons s
  WHERE s.status = 'active'
  ORDER BY s.starts_at DESC
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_analytics_active_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gamification_analytics_active_season() TO authenticated;