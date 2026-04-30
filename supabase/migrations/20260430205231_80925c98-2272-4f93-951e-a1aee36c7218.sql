
-- Achievements catalog
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  description text,
  icon text,
  xp_reward integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_achievements_employee ON public.employee_achievements(employee_id, unlocked_at DESC);

-- Missions catalog
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  description text,
  target_value numeric NOT NULL DEFAULT 1,
  xp_reward integer NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'daily', -- daily | weekly
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  period_key text NOT NULL, -- e.g. '2026-04-30' for daily, '2026-W18' for weekly
  progress numeric NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, mission_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_emp_mission_progress_employee
  ON public.employee_mission_progress(employee_id, period_key);

-- Streaks
CREATE TABLE IF NOT EXISTS public.employee_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  streak_type text NOT NULL, -- 'login' | 'sales' | 'calls'
  current_count integer NOT NULL DEFAULT 0,
  best_count integer NOT NULL DEFAULT 0,
  last_event_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, streak_type)
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_emp_mission_progress_updated_at ON public.employee_mission_progress;
CREATE TRIGGER trg_emp_mission_progress_updated_at
BEFORE UPDATE ON public.employee_mission_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_emp_streaks_updated_at ON public.employee_streaks;
CREATE TRIGGER trg_emp_streaks_updated_at
BEFORE UPDATE ON public.employee_streaks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_read_all" ON public.achievements;
CREATE POLICY "achievements_read_all" ON public.achievements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "missions_read_all" ON public.missions;
CREATE POLICY "missions_read_all" ON public.missions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "emp_ach_self_or_admin" ON public.employee_achievements;
CREATE POLICY "emp_ach_self_or_admin" ON public.employee_achievements FOR SELECT TO authenticated
USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "emp_mission_self_or_admin" ON public.employee_mission_progress;
CREATE POLICY "emp_mission_self_or_admin" ON public.employee_mission_progress FOR SELECT TO authenticated
USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "emp_streaks_self_or_admin" ON public.employee_streaks;
CREATE POLICY "emp_streaks_self_or_admin" ON public.employee_streaks FOR SELECT TO authenticated
USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Admin/manager management policies
DROP POLICY IF EXISTS "achievements_admin_all" ON public.achievements;
CREATE POLICY "achievements_admin_all" ON public.achievements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "missions_admin_all" ON public.missions;
CREATE POLICY "missions_admin_all" ON public.missions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
