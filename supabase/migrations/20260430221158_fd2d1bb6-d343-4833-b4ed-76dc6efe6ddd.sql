-- 1) Extend employee_achievements with audit/source columns
ALTER TABLE public.employee_achievements
  ADD COLUMN IF NOT EXISTS xp_awarded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_event_type text,
  ADD COLUMN IF NOT EXISTS source_event_count bigint,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2) Index for fast count(employee_id, event_type)
CREATE INDEX IF NOT EXISTS idx_score_events_employee_type
  ON public.employee_score_events (employee_id, event_type);

-- 3) Lock down INSERT/UPDATE/DELETE on employee_achievements (engine uses SECURITY DEFINER)
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy WHERE polrelid='public.employee_achievements'::regclass
      AND polcmd IN ('a','w','d')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.employee_achievements', p.polname);
  END LOOP;
END $$;
-- (No new write policies created. Only SECURITY DEFINER engine can write.)

-- 4) The unlock engine
CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements_for_employee(
  _employee_id uuid,
  _event_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ach record;
  current_count bigint;
  passes boolean;
  unlock_id uuid;
  unlocked_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  -- Guard: never let our own reward events recurse
  IF _event_type IS NULL OR _event_type = 'achievement_unlocked' THEN
    RETURN jsonb_build_object('unlocked', 0, 'skipped', 'self_event_or_null');
  END IF;

  -- Fast count of employee events for this event type
  SELECT count(*) INTO current_count
  FROM public.employee_score_events
  WHERE employee_id = _employee_id AND event_type = _event_type;

  FOR ach IN
    SELECT a.id, a.title_fa, a.condition_event_key, a.condition_operator,
           a.condition_value, a.xp_reward
    FROM public.achievements a
    WHERE a.enabled = true
      AND a.condition_event_key = _event_type
      AND a.condition_operator IS NOT NULL
      AND a.condition_value IS NOT NULL
      AND a.condition_value > 0
      -- skip if already unlocked for this employee
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_achievements ea
        WHERE ea.employee_id = _employee_id AND ea.achievement_id = a.id
      )
  LOOP
    passes := CASE ach.condition_operator
      WHEN '>=' THEN current_count >= ach.condition_value
      WHEN '>'  THEN current_count >  ach.condition_value
      WHEN '='  THEN current_count =  ach.condition_value
      WHEN '<=' THEN current_count <= ach.condition_value
      WHEN '<'  THEN current_count <  ach.condition_value
      ELSE NULL
    END;

    IF passes IS NULL THEN
      RAISE WARNING 'Invalid operator % for achievement %', ach.condition_operator, ach.id;
      CONTINUE;
    END IF;

    IF passes THEN
      -- Insert unlock; unique(employee_id, achievement_id) guarantees idempotence
      BEGIN
        INSERT INTO public.employee_achievements
          (employee_id, achievement_id, unlocked_at, xp_awarded,
           source_event_type, source_event_count)
        VALUES
          (_employee_id, ach.id, now(), COALESCE(ach.xp_reward, 0),
           _event_type, current_count)
        RETURNING id INTO unlock_id;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;

      unlocked_count := unlocked_count + 1;

      -- Award XP and record a reward score event (event_type avoids loop)
      IF COALESCE(ach.xp_reward, 0) > 0 THEN
        PERFORM public.add_employee_xp(_employee_id, ach.xp_reward);
        INSERT INTO public.employee_score_events
          (employee_id, event_type, source_table, source_id, payload)
        VALUES
          (_employee_id, 'achievement_unlocked', 'employee_achievements',
           unlock_id::text,
           jsonb_build_object(
             'achievement_id', ach.id,
             'title_fa', ach.title_fa,
             'xp_awarded', ach.xp_reward
           ));
      END IF;

      -- Audit log (one entry per unlock)
      INSERT INTO public.audit_logs
        (actor_id, entity_type, entity_id, action, diff)
      VALUES
        (_employee_id, 'gamification_achievement', ach.id::text,
         'achievement_unlocked',
         jsonb_build_object(
           'employee_id', _employee_id,
           'achievement_id', ach.id,
           'title_fa', ach.title_fa,
           'condition_event_key', ach.condition_event_key,
           'condition_operator', ach.condition_operator,
           'condition_value', ach.condition_value,
           'current_value', current_count,
           'xp_awarded', COALESCE(ach.xp_reward, 0),
           'unlocked_at', now()
         ));

      results := results || jsonb_build_object(
        'achievement_id', ach.id,
        'title_fa', ach.title_fa,
        'xp_awarded', COALESCE(ach.xp_reward, 0),
        'current_value', current_count
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('unlocked', unlocked_count, 'items', results);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_and_unlock_achievements_for_employee(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(uuid, text) TO authenticated;

-- 5) Auto-fire after every score event
CREATE OR REPLACE FUNCTION public.trg_check_achievements_after_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Don't recurse on our own reward events
  IF NEW.event_type IS DISTINCT FROM 'achievement_unlocked' THEN
    PERFORM public.check_and_unlock_achievements_for_employee(NEW.employee_id, NEW.event_type);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_achievements_after_score ON public.employee_score_events;
CREATE TRIGGER trg_check_achievements_after_score
  AFTER INSERT ON public.employee_score_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_after_score();