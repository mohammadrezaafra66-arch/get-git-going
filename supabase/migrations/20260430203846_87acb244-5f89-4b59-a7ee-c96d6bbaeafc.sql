
-- Generic timestamp helper (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.employee_progress (
  employee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  xp_current numeric NOT NULL DEFAULT 0,
  xp_total numeric NOT NULL DEFAULT 0,
  xp_next_level numeric NOT NULL DEFAULT 100,
  last_score_converted numeric NOT NULL DEFAULT 0,
  last_level_up timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_progress_level ON public.employee_progress(level DESC);

CREATE TABLE IF NOT EXISTS public.employee_level_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_level integer NOT NULL,
  new_level integer NOT NULL,
  xp_total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_level_up_events_employee
  ON public.employee_level_up_events(employee_id, created_at DESC);

ALTER TABLE public.employee_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_level_up_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_self_or_admin_select" ON public.employee_progress;
CREATE POLICY "progress_self_or_admin_select"
ON public.employee_progress FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

DROP POLICY IF EXISTS "level_up_self_or_admin_select" ON public.employee_level_up_events;
CREATE POLICY "level_up_self_or_admin_select"
ON public.employee_level_up_events FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

DROP TRIGGER IF EXISTS trg_employee_progress_updated_at ON public.employee_progress;
CREATE TRIGGER trg_employee_progress_updated_at
BEFORE UPDATE ON public.employee_progress
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.calc_xp_for_level(_level integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT floor(100 * power(GREATEST(_level, 1)::numeric, 1.5));
$$;

CREATE OR REPLACE FUNCTION public.add_employee_xp(_employee_id uuid, _xp numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.employee_progress%ROWTYPE;
  old_level integer;
  leveled_up boolean := false;
BEGIN
  INSERT INTO public.employee_progress(employee_id, xp_next_level)
  VALUES (_employee_id, public.calc_xp_for_level(1))
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT * INTO rec FROM public.employee_progress WHERE employee_id = _employee_id FOR UPDATE;

  IF _xp IS NULL OR _xp <= 0 THEN
    RETURN jsonb_build_object(
      'employee_id', rec.employee_id,
      'level', rec.level,
      'xp_current', rec.xp_current,
      'xp_total', rec.xp_total,
      'xp_next_level', rec.xp_next_level,
      'leveled_up', false
    );
  END IF;

  old_level := rec.level;
  rec.xp_current := rec.xp_current + _xp;
  rec.xp_total := rec.xp_total + _xp;

  WHILE rec.xp_current >= rec.xp_next_level LOOP
    rec.xp_current := rec.xp_current - rec.xp_next_level;
    rec.level := rec.level + 1;
    rec.xp_next_level := public.calc_xp_for_level(rec.level);
    leveled_up := true;
  END LOOP;

  IF leveled_up THEN
    rec.last_level_up := now();
    INSERT INTO public.employee_level_up_events(employee_id, old_level, new_level, xp_total)
    VALUES (_employee_id, old_level, rec.level, rec.xp_total);
  END IF;

  UPDATE public.employee_progress
  SET level = rec.level,
      xp_current = rec.xp_current,
      xp_total = rec.xp_total,
      xp_next_level = rec.xp_next_level,
      last_level_up = rec.last_level_up
  WHERE employee_id = _employee_id;

  RETURN jsonb_build_object(
    'employee_id', rec.employee_id,
    'level', rec.level,
    'xp_current', rec.xp_current,
    'xp_total', rec.xp_total,
    'xp_next_level', rec.xp_next_level,
    'leveled_up', leveled_up,
    'old_level', old_level,
    'new_level', rec.level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.award_xp_from_score(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_total numeric;
  last_converted numeric;
  delta numeric;
  xp_to_add numeric;
BEGIN
  SELECT total_score INTO current_total
  FROM public.employee_scores
  WHERE employee_id = _employee_id;

  IF current_total IS NULL THEN
    RETURN jsonb_build_object('xp_added', 0, 'reason', 'no_score');
  END IF;

  INSERT INTO public.employee_progress(employee_id, xp_next_level)
  VALUES (_employee_id, public.calc_xp_for_level(1))
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT last_score_converted INTO last_converted
  FROM public.employee_progress
  WHERE employee_id = _employee_id;

  delta := GREATEST(current_total - COALESCE(last_converted, 0), 0);
  xp_to_add := floor(delta / 100);

  UPDATE public.employee_progress
  SET last_score_converted = current_total
  WHERE employee_id = _employee_id;

  IF xp_to_add > 0 THEN
    RETURN public.add_employee_xp(_employee_id, xp_to_add) || jsonb_build_object('xp_added', xp_to_add);
  END IF;

  RETURN jsonb_build_object('xp_added', 0, 'score_delta', delta);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_progress(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.employee_progress%ROWTYPE;
  pct numeric;
BEGIN
  SELECT * INTO rec FROM public.employee_progress WHERE employee_id = _employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'employee_id', _employee_id,
      'level', 1,
      'xp_current', 0,
      'xp_total', 0,
      'xp_next_level', public.calc_xp_for_level(1),
      'progress_percent', 0,
      'last_level_up', NULL
    );
  END IF;

  pct := CASE
    WHEN rec.xp_next_level > 0
      THEN LEAST(100, ROUND((rec.xp_current / rec.xp_next_level) * 100, 2))
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'employee_id', rec.employee_id,
    'level', rec.level,
    'xp_current', rec.xp_current,
    'xp_total', rec.xp_total,
    'xp_next_level', rec.xp_next_level,
    'progress_percent', pct,
    'last_level_up', rec.last_level_up
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_award_xp_after_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_xp_from_score(NEW.employee_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_scores_award_xp ON public.employee_scores;
CREATE TRIGGER trg_employee_scores_award_xp
AFTER INSERT OR UPDATE OF total_score ON public.employee_scores
FOR EACH ROW
EXECUTE FUNCTION public.trg_award_xp_after_score();
