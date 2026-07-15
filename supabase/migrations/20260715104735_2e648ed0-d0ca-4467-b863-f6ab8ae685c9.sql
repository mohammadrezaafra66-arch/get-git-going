
CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_target uuid;
begin
  v_target := coalesce(_employee_id, auth.uid());
  if v_target is null then return; end if;
  insert into employee_scores (employee_id, daily_score, weekly_score, monthly_score, total_score, last_calculated_at)
  values (
    v_target,
    (select coalesce(sum(coalesce((payload->>'amount')::numeric, 0)),0) from employee_score_events where employee_id = v_target and triggered_at >= current_date),
    (select coalesce(sum(coalesce((payload->>'amount')::numeric, 0)),0) from employee_score_events where employee_id = v_target and triggered_at >= date_trunc('week', current_date)),
    (select coalesce(sum(coalesce((payload->>'amount')::numeric, 0)),0) from employee_score_events where employee_id = v_target and triggered_at >= date_trunc('month', current_date)),
    (select coalesce(sum(coalesce((payload->>'amount')::numeric, 0)),0) from employee_score_events where employee_id = v_target),
    now()
  )
  on conflict (employee_id) do update set
    daily_score = excluded.daily_score, weekly_score = excluded.weekly_score,
    monthly_score = excluded.monthly_score, total_score = excluded.total_score,
    last_calculated_at = now();
end; $function$;
