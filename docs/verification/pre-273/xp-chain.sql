SET
Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.add_employee_xp(_employee_id uuid, _xp numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.award_xp_from_score(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.calc_xp_for_level(_level integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT floor(100 * power(GREATEST(_level, 1)::numeric, 1.5));
$function$


CREATE OR REPLACE FUNCTION public.trg_award_xp_after_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.award_xp_from_score(NEW.employee_id);
  RETURN NEW;
END;
$function$


