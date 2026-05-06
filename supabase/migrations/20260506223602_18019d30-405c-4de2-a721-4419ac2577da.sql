-- Phase 21.6D minimal fix: revoke anon/PUBLIC from SECURITY DEFINER calculate_employee_score
REVOKE EXECUTE ON FUNCTION public.calculate_employee_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_employee_score(uuid) TO authenticated;