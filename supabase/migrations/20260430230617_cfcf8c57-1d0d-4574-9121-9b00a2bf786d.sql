-- Lock down public.add_employee_xp: revoke EXECUTE from public/anon/authenticated
-- Internal SECURITY DEFINER engines (check_and_unlock_*, award_xp_from_score,
-- check_and_update_mission_progress_*) continue to work because their owner
-- (postgres) retains EXECUTE.
REVOKE ALL ON FUNCTION public.add_employee_xp(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_employee_xp(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.add_employee_xp(uuid, numeric) FROM authenticated;
-- service_role retains access for trusted server-side admin operations.