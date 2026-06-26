-- M1: last_seen_at on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
  ON public.profiles(last_seen_at DESC);

-- M2: employee_profiles
CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE
                          REFERENCES public.profiles(id) ON DELETE CASCADE,
  employment_start_date DATE,
  department            TEXT,
  direct_manager_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  bio                   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employee_profiles TO authenticated;
GRANT ALL ON public.employee_profiles TO service_role;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ep_select_auth" ON public.employee_profiles;
CREATE POLICY "ep_select_auth" ON public.employee_profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ep_write_own" ON public.employee_profiles;
CREATE POLICY "ep_write_own" ON public.employee_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_employee_profiles_updated_at ON public.employee_profiles;
CREATE TRIGGER trg_employee_profiles_updated_at
  BEFORE UPDATE ON public.employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- M3: presence_logs
CREATE TABLE IF NOT EXISTS public.presence_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clock_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out_at  TIMESTAMPTZ,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  total_minutes INTEGER,
  notes         TEXT
);
GRANT SELECT, INSERT, UPDATE ON public.presence_logs TO authenticated;
GRANT ALL ON public.presence_logs TO service_role;
CREATE INDEX IF NOT EXISTS idx_presence_logs_user_date
  ON public.presence_logs(user_id, date);
ALTER TABLE public.presence_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pl_select" ON public.presence_logs;
CREATE POLICY "pl_select" ON public.presence_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "pl_insert" ON public.presence_logs;
CREATE POLICY "pl_insert" ON public.presence_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pl_update" ON public.presence_logs;
CREATE POLICY "pl_update" ON public.presence_logs
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- M4: monthly hours view
CREATE OR REPLACE VIEW public.employee_monthly_hours AS
SELECT
  user_id,
  date_trunc('month', date)::date AS month,
  SUM(total_minutes)              AS total_minutes,
  COUNT(*)                        AS days_present
FROM public.presence_logs
WHERE clock_out_at IS NOT NULL
GROUP BY user_id, date_trunc('month', date);

GRANT SELECT ON public.employee_monthly_hours TO authenticated;
GRANT ALL ON public.employee_monthly_hours TO service_role;

-- M5: is_user_online
CREATE OR REPLACE FUNCTION public.is_user_online(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT last_seen_at > NOW() - INTERVAL '5 minutes'
    FROM public.profiles WHERE id = _user_id
$$;