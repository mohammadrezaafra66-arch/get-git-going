
-- ============================================================
-- Phase 10.6 — Gamification League Admin / Season Rules
-- ============================================================

-- ---------- 1. league_settings: convert to per-tier ----------
ALTER TABLE public.league_settings
  ADD COLUMN IF NOT EXISTS tier league_tier,
  ADD COLUMN IF NOT EXISTS title_fa text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_xp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Drop legacy single-row constraints if they exist (we no longer use season_duration_days as required)
ALTER TABLE public.league_settings ALTER COLUMN season_duration_days DROP NOT NULL;

-- Per-tier defaults for promotion / demotion
ALTER TABLE public.league_settings ALTER COLUMN promotion_percent SET DEFAULT 20;
ALTER TABLE public.league_settings ALTER COLUMN demotion_percent SET DEFAULT 20;

-- Seed the 6 base tiers, only when no tier rows exist yet
INSERT INTO public.league_settings (tier, title_fa, title_en, min_level, min_xp, promotion_percent, demotion_percent, sort_order, is_active)
SELECT * FROM (VALUES
  ('Bronze'::league_tier,   'برنز',   'Bronze',   0,   0,     20::numeric, 20::numeric, 1, true),
  ('Silver'::league_tier,   'نقره',   'Silver',   5,   500,   20::numeric, 20::numeric, 2, true),
  ('Gold'::league_tier,     'طلا',     'Gold',     10,  2000,  20::numeric, 20::numeric, 3, true),
  ('Platinum'::league_tier, 'پلاتین', 'Platinum', 20,  5000,  15::numeric, 15::numeric, 4, true),
  ('Diamond'::league_tier,  'الماس',  'Diamond',  35,  12000, 10::numeric, 10::numeric, 5, true),
  ('Legend'::league_tier,   'افسانه', 'Legend',   50,  25000, 0::numeric,  10::numeric, 6, true)
) AS v(tier, title_fa, title_en, min_level, min_xp, promotion_percent, demotion_percent, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.league_settings WHERE tier IS NOT NULL);

-- Make tier unique once seeded (only enforce on rows that have tier set)
CREATE UNIQUE INDEX IF NOT EXISTS league_settings_tier_uniq
  ON public.league_settings (tier) WHERE tier IS NOT NULL;

-- Validation trigger (avoids non-immutable CHECK and gives Persian errors)
CREATE OR REPLACE FUNCTION public.validate_league_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tier IS NULL THEN
    RAISE EXCEPTION 'لیگ الزامی است';
  END IF;
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.min_level < 0 THEN RAISE EXCEPTION 'حداقل سطح نمی‌تواند منفی باشد'; END IF;
  IF NEW.min_xp < 0 THEN RAISE EXCEPTION 'حداقل XP نمی‌تواند منفی باشد'; END IF;
  IF NEW.promotion_percent < 0 OR NEW.promotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF NEW.demotion_percent < 0 OR NEW.demotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد سقوط باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF (NEW.promotion_percent + NEW.demotion_percent) > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا و سقوط نمی‌توانند مجموعاً بیشتر از ۱۰۰ باشند';
  END IF;
  IF NEW.sort_order < 0 THEN RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد'; END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_validate_league_setting ON public.league_settings;
CREATE TRIGGER trg_validate_league_setting
  BEFORE INSERT OR UPDATE ON public.league_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_league_setting();

-- Tighten RLS: drop the broad read-all policy; only admin/manager can read/write
DROP POLICY IF EXISTS league_settings_read ON public.league_settings;
DROP POLICY IF EXISTS league_settings_admin_all ON public.league_settings;

CREATE POLICY league_settings_admin_select ON public.league_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY league_settings_admin_insert ON public.league_settings
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY league_settings_admin_update ON public.league_settings
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Read-only public view exposing only display-safe columns to authenticated users
CREATE OR REPLACE VIEW public.v_league_tiers_public AS
  SELECT id, tier, title_fa, title_en, min_level, min_xp, sort_order, is_active
  FROM public.league_settings
  WHERE tier IS NOT NULL AND is_active = true;

GRANT SELECT ON public.v_league_tiers_public TO authenticated;

-- ---------- 2. league_seasons: extend with i18n + status ----------
ALTER TABLE public.league_seasons
  ADD COLUMN IF NOT EXISTS title_fa text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill new columns from legacy ones
UPDATE public.league_seasons
   SET title_fa  = COALESCE(title_fa, season_name),
       starts_at = COALESCE(starts_at, start_date::timestamptz),
       ends_at   = COALESCE(ends_at, end_date::timestamptz),
       status    = COALESCE(NULLIF(status,''), CASE WHEN is_active THEN 'active' WHEN settled_at IS NOT NULL THEN 'closed' ELSE 'draft' END);

-- Allow legacy NOT NULLs to be filled automatically when new rows are inserted via new API
ALTER TABLE public.league_seasons ALTER COLUMN season_name DROP NOT NULL;
ALTER TABLE public.league_seasons ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE public.league_seasons ALTER COLUMN end_date DROP NOT NULL;

-- Status check constraint (immutable, allowed)
ALTER TABLE public.league_seasons DROP CONSTRAINT IF EXISTS league_seasons_status_chk;
ALTER TABLE public.league_seasons
  ADD CONSTRAINT league_seasons_status_chk
  CHECK (status IN ('draft','active','closed'));

-- Validation trigger: dates + only one active + legacy column sync
CREATE OR REPLACE FUNCTION public.validate_league_season()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.starts_at IS NULL THEN RAISE EXCEPTION 'تاریخ شروع الزامی است'; END IF;
  IF NEW.ends_at   IS NULL THEN RAISE EXCEPTION 'تاریخ پایان الزامی است'; END IF;
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'تاریخ پایان باید بعد از تاریخ شروع باشد';
  END IF;

  -- keep legacy columns in sync so existing readers keep working
  NEW.season_name := COALESCE(NEW.season_name, NEW.title_fa);
  NEW.start_date  := COALESCE(NEW.start_date, NEW.starts_at::date);
  NEW.end_date    := COALESCE(NEW.end_date, NEW.ends_at::date);
  NEW.is_active   := (NEW.status = 'active');
  NEW.updated_at  := now();

  -- only one active season
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.league_seasons s
     WHERE s.status = 'active' AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'فقط یک فصل فعال می‌تواند وجود داشته باشد';
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_validate_league_season ON public.league_seasons;
CREATE TRIGGER trg_validate_league_season
  BEFORE INSERT OR UPDATE ON public.league_seasons
  FOR EACH ROW EXECUTE FUNCTION public.validate_league_season();

-- Drop old broad policy and add admin/manager scoped ones; keep authenticated read for leaderboard
DROP POLICY IF EXISTS league_seasons_read_all ON public.league_seasons;

CREATE POLICY league_seasons_read_authenticated ON public.league_seasons
  FOR SELECT TO authenticated USING (true);

CREATE POLICY league_seasons_admin_insert ON public.league_seasons
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY league_seasons_admin_update ON public.league_seasons
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS idx_league_seasons_status ON public.league_seasons (status);
CREATE INDEX IF NOT EXISTS idx_league_seasons_dates ON public.league_seasons (starts_at, ends_at);

-- ---------- 3. preview_league_season_changes ----------
CREATE OR REPLACE FUNCTION public.preview_league_season_changes(_season_id uuid)
RETURNS TABLE (
  employee_id   uuid,
  full_name     text,
  current_tier  league_tier,
  score         numeric,
  rank_in_tier  integer,
  suggested_action text,
  target_tier   league_tier
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      el.employee_id,
      el.league AS current_tier,
      el.score,
      ROW_NUMBER() OVER (PARTITION BY el.league ORDER BY el.score DESC, el.employee_id) AS rnk,
      COUNT(*)    OVER (PARTITION BY el.league) AS total_in_tier
    FROM public.employee_leagues el
    WHERE el.season_id = _season_id
    LIMIT 5000
  ),
  tiers AS (
    SELECT tier, sort_order, promotion_percent, demotion_percent
    FROM public.league_settings
    WHERE tier IS NOT NULL AND is_active = true
  ),
  decided AS (
    SELECT
      r.employee_id,
      r.current_tier,
      r.score,
      r.rnk::int AS rank_in_tier,
      CASE
        WHEN r.rnk <= GREATEST(1, FLOOR(r.total_in_tier * t.promotion_percent / 100.0))
             AND EXISTS (SELECT 1 FROM tiers tu WHERE tu.sort_order = t.sort_order + 1)
          THEN 'promote'
        WHEN r.rnk > (r.total_in_tier - GREATEST(0, FLOOR(r.total_in_tier * t.demotion_percent / 100.0)))
             AND EXISTS (SELECT 1 FROM tiers td WHERE td.sort_order = t.sort_order - 1)
          THEN 'demote'
        ELSE 'stay'
      END AS suggested_action,
      t.sort_order AS cur_order
    FROM ranked r
    JOIN tiers t ON t.tier = r.current_tier
  )
  SELECT
    d.employee_id,
    COALESCE(p.full_name, p.email, d.employee_id::text) AS full_name,
    d.current_tier,
    d.score,
    d.rank_in_tier,
    d.suggested_action,
    CASE d.suggested_action
      WHEN 'promote' THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order + 1)
      WHEN 'demote'  THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order - 1)
      ELSE d.current_tier
    END AS target_tier
  FROM decided d
  LEFT JOIN public.profiles p ON p.id = d.employee_id
  ORDER BY d.cur_order DESC, d.rank_in_tier ASC
  LIMIT 5000;
END$$;

REVOKE ALL ON FUNCTION public.preview_league_season_changes(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_league_season_changes(uuid) TO authenticated;
