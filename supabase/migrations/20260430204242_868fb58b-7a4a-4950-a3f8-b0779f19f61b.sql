
-- =======================================================
-- Phase 3 — League System
-- =======================================================

-- League tier enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'league_tier') THEN
    CREATE TYPE public.league_tier AS ENUM ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend');
  END IF;
END$$;

-- league_seasons
CREATE TABLE IF NOT EXISTS public.league_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_seasons_active ON public.league_seasons(is_active) WHERE is_active;

-- employee_leagues
CREATE TABLE IF NOT EXISTS public.employee_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  league public.league_tier NOT NULL DEFAULT 'Bronze',
  rank integer,
  score numeric NOT NULL DEFAULT 0,
  promoted boolean NOT NULL DEFAULT false,
  demoted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_leagues_season ON public.employee_leagues(season_id, league, rank);
CREATE INDEX IF NOT EXISTS idx_employee_leagues_employee ON public.employee_leagues(employee_id, created_at DESC);

-- RLS
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "league_seasons_read_all" ON public.league_seasons;
CREATE POLICY "league_seasons_read_all"
ON public.league_seasons FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "employee_leagues_read_all" ON public.employee_leagues;
CREATE POLICY "employee_leagues_read_all"
ON public.employee_leagues FOR SELECT
TO authenticated
USING (true);

-- Helper: tier ordering
CREATE OR REPLACE FUNCTION public.league_tier_index(_tier public.league_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _tier
    WHEN 'Bronze'   THEN 1
    WHEN 'Silver'   THEN 2
    WHEN 'Gold'     THEN 3
    WHEN 'Platinum' THEN 4
    WHEN 'Diamond'  THEN 5
    WHEN 'Legend'   THEN 6
  END;
$$;

CREATE OR REPLACE FUNCTION public.league_tier_from_index(_idx integer)
RETURNS public.league_tier
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE LEAST(GREATEST(_idx, 1), 6)
    WHEN 1 THEN 'Bronze'::public.league_tier
    WHEN 2 THEN 'Silver'::public.league_tier
    WHEN 3 THEN 'Gold'::public.league_tier
    WHEN 4 THEN 'Platinum'::public.league_tier
    WHEN 5 THEN 'Diamond'::public.league_tier
    WHEN 6 THEN 'Legend'::public.league_tier
  END;
$$;

-- get_current_league
CREATE OR REPLACE FUNCTION public.get_current_league(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  season_rec public.league_seasons%ROWTYPE;
  el public.employee_leagues%ROWTYPE;
BEGIN
  SELECT * INTO season_rec FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('league', NULL, 'season', NULL);
  END IF;

  SELECT * INTO el
  FROM public.employee_leagues
  WHERE employee_id = _employee_id AND season_id = season_rec.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'employee_id', _employee_id,
      'season_id', season_rec.id,
      'season_name', season_rec.season_name,
      'league', 'Bronze',
      'rank', NULL,
      'score', 0,
      'promoted', false,
      'demoted', false
    );
  END IF;

  RETURN jsonb_build_object(
    'employee_id', el.employee_id,
    'season_id', season_rec.id,
    'season_name', season_rec.season_name,
    'league', el.league,
    'rank', el.rank,
    'score', el.score,
    'promoted', el.promoted,
    'demoted', el.demoted
  );
END;
$$;

-- get_league_leaderboard
CREATE OR REPLACE FUNCTION public.get_league_leaderboard(
  _league public.league_tier,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  league public.league_tier,
  score numeric,
  rank integer,
  promoted boolean,
  demoted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  season_id_v uuid;
BEGIN
  SELECT id INTO season_id_v FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;
  IF season_id_v IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    el.employee_id,
    p.full_name,
    el.league,
    el.score,
    RANK() OVER (ORDER BY el.score DESC)::integer AS rank,
    el.promoted,
    el.demoted
  FROM public.employee_leagues el
  LEFT JOIN public.profiles p ON p.id = el.employee_id
  WHERE el.season_id = season_id_v AND el.league = _league
  ORDER BY el.score DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

-- start_league_season (admin/manager)
CREATE OR REPLACE FUNCTION public.start_league_season(
  _name text,
  _start date,
  _end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.league_seasons SET is_active = false WHERE is_active;

  INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
  VALUES (_name, _start, _end, true)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- settle_league_season: close active, assign tiers, open next
CREATE OR REPLACE FUNCTION public.settle_league_season()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_season public.league_seasons%ROWTYPE;
  next_start date;
  next_end date;
  next_name text;
  next_id uuid;
  total_count integer;
  promote_cut integer;
  demote_cut integer;
BEGIN
  SELECT * INTO active_season FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;

  -- If no active season, bootstrap current month and exit
  IF NOT FOUND THEN
    next_start := date_trunc('month', current_date)::date;
    next_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    next_name := to_char(next_start, 'YYYY-MM');
    INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
    VALUES (next_name, next_start, next_end, true)
    ON CONFLICT (season_name) DO UPDATE SET is_active = true
    RETURNING id INTO next_id;
    RETURN jsonb_build_object('bootstrapped', true, 'season_id', next_id);
  END IF;

  -- 1. Snapshot final monthly scores into the active season
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score)
  SELECT es.employee_id, active_season.id, 'Bronze'::public.league_tier, COALESCE(es.monthly_score, 0)
  FROM public.employee_scores es
  ON CONFLICT (employee_id, season_id) DO UPDATE
    SET score = EXCLUDED.score;

  -- 2. Compute rank within current league tier
  WITH ranked AS (
    SELECT id,
           league,
           RANK() OVER (PARTITION BY league ORDER BY score DESC) AS r,
           COUNT(*) OVER (PARTITION BY league) AS tier_count
    FROM public.employee_leagues
    WHERE season_id = active_season.id
  )
  UPDATE public.employee_leagues el
  SET rank = ranked.r
  FROM ranked
  WHERE el.id = ranked.id;

  -- Mark active as settled
  UPDATE public.league_seasons
  SET is_active = false, settled_at = now()
  WHERE id = active_season.id;

  -- 3. Open next month's season
  next_start := (active_season.end_date + interval '1 day')::date;
  next_end := (date_trunc('month', next_start) + interval '1 month - 1 day')::date;
  next_name := to_char(next_start, 'YYYY-MM');

  INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
  VALUES (next_name, next_start, next_end, true)
  ON CONFLICT (season_name) DO UPDATE SET is_active = true, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
  RETURNING id INTO next_id;

  -- 4. Carry forward members to the new season with promotion/demotion
  --    Within each tier of the just-settled season:
  --      top 20% -> promoted (tier + 1, capped at Legend)
  --      bottom 20% -> demoted (tier - 1, floored at Bronze)
  --      else stays
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score, promoted, demoted)
  SELECT
    el.employee_id,
    next_id,
    CASE
      WHEN el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int
        THEN public.league_tier_from_index(public.league_tier_index(el.league) + 1)
      WHEN el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
        AND public.league_tier_index(el.league) > 1
        THEN public.league_tier_from_index(public.league_tier_index(el.league) - 1)
      ELSE el.league
    END AS new_league,
    0 AS score,
    (el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int) AS promoted,
    (el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
      AND public.league_tier_index(el.league) > 1) AS demoted
  FROM (
    SELECT
      el.*,
      COUNT(*) OVER (PARTITION BY el.league) AS tier_count
    FROM public.employee_leagues el
    WHERE el.season_id = active_season.id
  ) el
  ON CONFLICT (employee_id, season_id) DO NOTHING;

  SELECT COUNT(*) INTO total_count FROM public.employee_leagues WHERE season_id = active_season.id;

  RETURN jsonb_build_object(
    'settled_season_id', active_season.id,
    'settled_season_name', active_season.season_name,
    'new_season_id', next_id,
    'new_season_name', next_name,
    'employees_settled', total_count
  );
END;
$$;
