-- Extend achievements for Phase 10.2 condition-based unlocks
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS condition_event_key text,
  ADD COLUMN IF NOT EXISTS condition_operator text,
  ADD COLUMN IF NOT EXISTS condition_value numeric,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_condition_operator_chk;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_condition_operator_chk
  CHECK (condition_operator IS NULL OR condition_operator IN ('>=','>','=','<=','<'));

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_condition_value_chk;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_condition_value_chk
  CHECK (condition_value IS NULL OR condition_value > 0);

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_xp_reward_chk;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_xp_reward_chk CHECK (xp_reward >= 0);

-- Unique combo per event+operator+value (only when all set)
CREATE UNIQUE INDEX IF NOT EXISTS achievements_condition_uniq
  ON public.achievements (condition_event_key, condition_operator, condition_value)
  WHERE condition_event_key IS NOT NULL
    AND condition_operator IS NOT NULL
    AND condition_value IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_achievements_updated_at ON public.achievements;
CREATE TRIGGER trg_achievements_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: lock down to admin/manager
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid='public.achievements'::regclass LOOP
    EXECUTE format('DROP POLICY %I ON public.achievements', p.polname);
  END LOOP;
END $$;

CREATE POLICY "Admin/manager view achievements"
  ON public.achievements FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin/manager insert achievements"
  ON public.achievements FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin/manager update achievements"
  ON public.achievements FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- No DELETE policy = hard delete forbidden by RLS