-- Revoke EXECUTE from PUBLIC/anon/authenticated on engine RPCs that should
-- only be invoked by AFTER INSERT triggers (SECURITY DEFINER bypasses ACLs
-- when called from a trigger owned by postgres).
REVOKE EXECUTE ON FUNCTION public.award_xp_from_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(uuid, text) FROM PUBLIC, anon, authenticated;

-- Wrap get_employee_progress with a self/admin/manager access check so normal
-- users cannot read other employees' XP / level data.
CREATE OR REPLACE FUNCTION public.get_employee_progress(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec public.employee_progress%ROWTYPE;
  pct numeric;
BEGIN
  -- Access control: caller must be the same employee, an admin, or a manager.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() <> _employee_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

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
$function$;