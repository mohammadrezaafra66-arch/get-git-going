-- 1) achievements: rule_type + rule_value
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS rule_value numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'achievements_rule_type_check'
  ) THEN
    ALTER TABLE public.achievements
      ADD CONSTRAINT achievements_rule_type_check
      CHECK (rule_type IN ('manual','level','streak','score','missions_completed'));
  END IF;
END $$;

-- 2) league_settings (singleton row)
CREATE TABLE IF NOT EXISTS public.league_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_percent numeric NOT NULL DEFAULT 20 CHECK (promotion_percent >= 0 AND promotion_percent <= 100),
  demotion_percent numeric NOT NULL DEFAULT 20 CHECK (demotion_percent >= 0 AND demotion_percent <= 100),
  season_duration_days integer NOT NULL DEFAULT 30 CHECK (season_duration_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_settings_read ON public.league_settings;
CREATE POLICY league_settings_read ON public.league_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS league_settings_admin_all ON public.league_settings;
CREATE POLICY league_settings_admin_all ON public.league_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE OR REPLACE TRIGGER trg_league_settings_updated_at
  BEFORE UPDATE ON public.league_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.league_settings (promotion_percent, demotion_percent, season_duration_days)
SELECT 20, 20, 30
WHERE NOT EXISTS (SELECT 1 FROM public.league_settings);

-- 3) gamification_rewards
CREATE TABLE IF NOT EXISTS public.gamification_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('level','league','streak','manual')),
  trigger_value numeric NOT NULL DEFAULT 0,
  reward_type text NOT NULL CHECK (reward_type IN ('xp_bonus','badge','gift','custom')),
  reward_value numeric,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gamification_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rewards_read ON public.gamification_rewards;
CREATE POLICY rewards_read ON public.gamification_rewards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rewards_admin_all ON public.gamification_rewards;
CREATE POLICY rewards_admin_all ON public.gamification_rewards
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE OR REPLACE TRIGGER trg_gamification_rewards_updated_at
  BEFORE UPDATE ON public.gamification_rewards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a few starter rewards
INSERT INTO public.gamification_rewards (key, title_fa, description, trigger_type, trigger_value, reward_type, reward_value, display_order) VALUES
  ('level_10_bonus', 'پاداش سطح ۱۰', 'به سطح ۱۰ رسیدید', 'level', 10, 'xp_bonus', 500, 1),
  ('level_20_gift', 'هدیه سطح ۲۰', 'هدیه ویژه برای رسیدن به سطح ۲۰', 'level', 20, 'gift', NULL, 2),
  ('league_gold_bonus', 'پاداش لیگ طلا', 'ورود به لیگ طلا', 'league', 3, 'xp_bonus', 1000, 3)
ON CONFLICT (key) DO NOTHING;

-- 4) Admin overview function
CREATE OR REPLACE FUNCTION public.admin_gamification_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_employees', (SELECT count(*) FROM public.employee_progress),
    'avg_xp', COALESCE((SELECT round(avg(xp_total)::numeric, 1) FROM public.employee_progress), 0),
    'avg_level', COALESCE((SELECT round(avg(level)::numeric, 1) FROM public.employee_progress), 0),
    'top_players', COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT ep.employee_id, p.full_name, ep.level, ep.xp_total
        FROM public.employee_progress ep
        LEFT JOIN public.profiles p ON p.id = ep.employee_id
        ORDER BY ep.xp_total DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'league_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('league', league, 'count', cnt))
      FROM (
        SELECT league, count(*) AS cnt
        FROM public.employee_leagues el
        WHERE el.season = (SELECT id::text FROM public.league_seasons WHERE is_active LIMIT 1)
           OR NOT EXISTS (SELECT 1 FROM public.league_seasons WHERE is_active)
        GROUP BY league
      ) s
    ), '[]'::jsonb),
    'xp_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'count', cnt) ORDER BY ord)
      FROM (
        SELECT
          CASE
            WHEN xp_total < 500 THEN '0-500'
            WHEN xp_total < 2000 THEN '500-2k'
            WHEN xp_total < 5000 THEN '2k-5k'
            WHEN xp_total < 10000 THEN '5k-10k'
            ELSE '10k+'
          END AS bucket,
          CASE
            WHEN xp_total < 500 THEN 1
            WHEN xp_total < 2000 THEN 2
            WHEN xp_total < 5000 THEN 3
            WHEN xp_total < 10000 THEN 4
            ELSE 5
          END AS ord,
          count(*) AS cnt
        FROM public.employee_progress
        GROUP BY bucket, ord
      ) s
    ), '[]'::jsonb),
    'missions_completion', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mission', title_fa, 'completed', completed, 'total', total))
      FROM (
        SELECT m.title_fa,
               count(emp.*) FILTER (WHERE emp.completed) AS completed,
               count(emp.*) AS total
        FROM public.missions m
        LEFT JOIN public.employee_mission_progress emp ON emp.mission_id = m.id
        WHERE m.enabled
        GROUP BY m.title_fa
        ORDER BY total DESC
        LIMIT 10
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_gamification_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_gamification_overview() TO authenticated;