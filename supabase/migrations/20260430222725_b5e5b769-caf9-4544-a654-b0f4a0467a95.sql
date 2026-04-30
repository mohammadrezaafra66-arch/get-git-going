-- Extend mission progress with richer tracking columns
ALTER TABLE public.employee_mission_progress
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS period_end   timestamptz,
  ADD COLUMN IF NOT EXISTS target_value numeric,
  ADD COLUMN IF NOT EXISTS current_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_awarded   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_event_type text;

-- Helpful index for engine lookups by employee+mission+period
CREATE INDEX IF NOT EXISTS idx_emp_mission_progress_emp_mission
  ON public.employee_mission_progress (employee_id, mission_id);

-- ---- Engine -----------------------------------------------------------------
-- Computes [period_start, period_end] for a mission according to its type.
CREATE OR REPLACE FUNCTION public.compute_mission_period(
  _mission public.missions
) RETURNS TABLE(period_start timestamptz, period_end timestamptz, period_key text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  ps timestamptz;
  pe timestamptz;
  pk text;
BEGIN
  CASE _mission.mission_type
    WHEN 'daily' THEN
      ps := date_trunc('day', now());
      pe := ps + interval '1 day';
      pk := 'd:' || to_char(ps, 'YYYY-MM-DD');
    WHEN 'weekly' THEN
      ps := date_trunc('week', now());
      pe := ps + interval '1 week';
      pk := 'w:' || to_char(ps, 'IYYY-IW');
    WHEN 'monthly' THEN
      ps := date_trunc('month', now());
      pe := ps + interval '1 month';
      pk := 'm:' || to_char(ps, 'YYYY-MM');
    WHEN 'custom' THEN
      ps := COALESCE(_mission.starts_at, _mission.created_at);
      pe := COALESCE(_mission.ends_at, ps + interval '100 years');
      pk := 'c:' || _mission.id::text;
    ELSE
      RETURN;
  END CASE;
  period_start := ps; period_end := pe; period_key := pk;
  RETURN NEXT;
END;
$$;

-- Main engine: evaluate progress for the given employee+event_type
CREATE OR REPLACE FUNCTION public.check_and_update_mission_progress_for_employee(
  _employee_id uuid,
  _event_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  per record;
  current_count numeric;
  passes boolean;
  prev_completed boolean;
  prev_progress_id uuid;
  reward int;
  completed_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  -- Recursion / scope guard
  IF _event_type IS NULL OR _event_type IN ('mission_completed', 'achievement_unlocked') THEN
    RETURN jsonb_build_object('completed', 0, 'items', results);
  END IF;

  FOR m IN
    SELECT * FROM public.missions
    WHERE enabled = true
      AND condition_event_key = _event_type
      AND condition_value IS NOT NULL
      AND condition_operator IN ('>=','>','=','<=','<')
  LOOP
    -- Compute period
    SELECT * INTO per FROM public.compute_mission_period(m);
    IF per.period_start IS NULL THEN CONTINUE; END IF;

    -- Skip custom missions outside their window
    IF m.mission_type = 'custom' AND now() NOT BETWEEN per.period_start AND per.period_end THEN
      CONTINUE;
    END IF;

    -- Count qualifying events in this period
    SELECT COUNT(*)::numeric INTO current_count
    FROM public.employee_score_events e
    WHERE e.employee_id = _employee_id
      AND e.event_type = _event_type
      AND e.triggered_at >= per.period_start
      AND e.triggered_at <  per.period_end;

    -- Evaluate condition
    passes := CASE m.condition_operator
      WHEN '>=' THEN current_count >= m.condition_value
      WHEN '>'  THEN current_count >  m.condition_value
      WHEN '='  THEN current_count =  m.condition_value
      WHEN '<=' THEN current_count <= m.condition_value
      WHEN '<'  THEN current_count <  m.condition_value
      ELSE false
    END;

    -- Look up existing progress for this employee+mission+period
    SELECT id, completed
      INTO prev_progress_id, prev_completed
    FROM public.employee_mission_progress
    WHERE employee_id = _employee_id
      AND mission_id  = m.id
      AND period_key  = per.period_key
    LIMIT 1;

    IF prev_progress_id IS NULL THEN
      INSERT INTO public.employee_mission_progress (
        employee_id, mission_id, period_key, period_start, period_end,
        progress, current_value, target_value, completed, completed_at,
        xp_awarded, source_event_type
      ) VALUES (
        _employee_id, m.id, per.period_key, per.period_start, per.period_end,
        current_count, current_count, m.condition_value,
        passes, CASE WHEN passes THEN now() ELSE NULL END,
        0, _event_type
      )
      RETURNING id INTO prev_progress_id;
      prev_completed := false; -- fresh row; treat reward path below
    ELSE
      UPDATE public.employee_mission_progress
        SET progress = current_count,
            current_value = current_count,
            target_value = m.condition_value,
            period_start = per.period_start,
            period_end   = per.period_end,
            source_event_type = _event_type,
            completed = (completed OR passes),
            completed_at = COALESCE(completed_at, CASE WHEN passes THEN now() ELSE NULL END)
        WHERE id = prev_progress_id;
    END IF;

    -- Award reward only on first completion in this period
    IF passes AND NOT COALESCE(prev_completed, false) THEN
      reward := COALESCE(m.xp_reward, 0);
      IF reward > 0 THEN
        PERFORM public.add_employee_xp(_employee_id, reward);
        UPDATE public.employee_mission_progress
          SET xp_awarded = reward
          WHERE id = prev_progress_id;
        INSERT INTO public.employee_score_events (
          employee_id, event_type, source_table, source_id, payload
        ) VALUES (
          _employee_id, 'mission_completed', 'missions', m.id::text,
          jsonb_build_object(
            'mission_id', m.id,
            'title_fa', m.title_fa,
            'reward_xp', reward,
            'period_start', per.period_start,
            'period_end', per.period_end,
            'current_value', current_count,
            'target_value', m.condition_value
          )
        );
      END IF;

      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (
        _employee_id, 'gamification_mission', m.id::text, 'mission_completed',
        jsonb_build_object(
          'employee_id', _employee_id,
          'mission_id', m.id,
          'title_fa', m.title_fa,
          'mission_type', m.mission_type,
          'condition_event_key', m.condition_event_key,
          'condition_operator', m.condition_operator,
          'condition_value', m.condition_value,
          'current_value', current_count,
          'reward_xp', reward,
          'period_start', per.period_start,
          'period_end', per.period_end,
          'completed_at', now()
        )
      );

      completed_count := completed_count + 1;
      results := results || jsonb_build_object(
        'mission_id', m.id, 'title_fa', m.title_fa, 'reward_xp', reward
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('completed', completed_count, 'items', results);
END;
$$;

-- Trigger that runs after each score event
CREATE OR REPLACE FUNCTION public.trg_check_missions_after_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type NOT IN ('mission_completed', 'achievement_unlocked') THEN
    PERFORM public.check_and_update_mission_progress_for_employee(NEW.employee_id, NEW.event_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_missions_after_score ON public.employee_score_events;
CREATE TRIGGER trg_check_missions_after_score
  AFTER INSERT ON public.employee_score_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_missions_after_score();

-- Restrict execution to authenticated callers (engine is invoked through the trigger)
REVOKE ALL ON FUNCTION public.check_and_update_mission_progress_for_employee(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.compute_mission_period(public.missions) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_mission_period(public.missions) TO authenticated;