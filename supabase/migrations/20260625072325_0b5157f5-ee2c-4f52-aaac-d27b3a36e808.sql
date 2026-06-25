drop function if exists public.calculate_employee_score(uuid);

create or replace function public.get_leaderboard_daily(
  _team text default null, _department text default null, _role text default null,
  _limit int default 50, _offset int default 0
) returns table (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
language sql security definer set search_path = public as $$
  select es.employee_id, p.full_name, null::text, null::text, ur.role::text,
    es.daily_score, row_number() over (order by es.daily_score desc)
  from employee_scores es
  join profiles p on p.id = es.employee_id
  left join user_roles ur on ur.user_id = es.employee_id
  where (_role is null or ur.role::text = _role)
  order by es.daily_score desc limit _limit offset _offset;
$$;
grant execute on function public.get_leaderboard_daily(text,text,text,int,int) to authenticated;

create or replace function public.get_leaderboard_weekly(
  _team text default null, _department text default null, _role text default null,
  _limit int default 50, _offset int default 0
) returns table (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
language sql security definer set search_path = public as $$
  select es.employee_id, p.full_name, null::text, null::text, ur.role::text,
    es.weekly_score, row_number() over (order by es.weekly_score desc)
  from employee_scores es
  join profiles p on p.id = es.employee_id
  left join user_roles ur on ur.user_id = es.employee_id
  where (_role is null or ur.role::text = _role)
  order by es.weekly_score desc limit _limit offset _offset;
$$;
grant execute on function public.get_leaderboard_weekly(text,text,text,int,int) to authenticated;

create or replace function public.get_leaderboard_monthly(
  _team text default null, _department text default null, _role text default null,
  _limit int default 50, _offset int default 0
) returns table (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
language sql security definer set search_path = public as $$
  select es.employee_id, p.full_name, null::text, null::text, ur.role::text,
    es.monthly_score, row_number() over (order by es.monthly_score desc)
  from employee_scores es
  join profiles p on p.id = es.employee_id
  left join user_roles ur on ur.user_id = es.employee_id
  where (_role is null or ur.role::text = _role)
  order by es.monthly_score desc limit _limit offset _offset;
$$;
grant execute on function public.get_leaderboard_monthly(text,text,text,int,int) to authenticated;

create or replace function public.get_leaderboard_all_time(
  _team text default null, _department text default null, _role text default null,
  _limit int default 50, _offset int default 0
) returns table (employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
language sql security definer set search_path = public as $$
  select es.employee_id, p.full_name, null::text, null::text, ur.role::text,
    es.total_score, row_number() over (order by es.total_score desc)
  from employee_scores es
  join profiles p on p.id = es.employee_id
  left join user_roles ur on ur.user_id = es.employee_id
  where (_role is null or ur.role::text = _role)
  order by es.total_score desc limit _limit offset _offset;
$$;
grant execute on function public.get_leaderboard_all_time(text,text,text,int,int) to authenticated;

create or replace function public.get_employee_rank(_employee_id uuid default null)
returns table (employee_id uuid, daily_score numeric, weekly_score numeric, monthly_score numeric,
  total_score numeric, daily_rank bigint, weekly_rank bigint, monthly_rank bigint, all_time_rank bigint)
language sql security definer set search_path = public as $$
  with ranked as (
    select es.employee_id, es.daily_score, es.weekly_score, es.monthly_score, es.total_score,
      row_number() over (order by es.daily_score desc),
      row_number() over (order by es.weekly_score desc),
      row_number() over (order by es.monthly_score desc),
      row_number() over (order by es.total_score desc)
    from employee_scores es
  )
  select * from ranked where employee_id = coalesce(_employee_id, auth.uid());
$$;
grant execute on function public.get_employee_rank(uuid) to authenticated;

create or replace function public.get_rank_neighbors(
  _employee_id uuid, _period text default 'monthly', _window int default 3
) returns table (employee_id uuid, full_name text, score numeric, rank bigint, relative_position text)
language sql security definer set search_path = public as $$
  with ranked as (
    select es.employee_id, p.full_name,
      case _period when 'daily' then es.daily_score when 'weekly' then es.weekly_score
        when 'all_time' then es.total_score else es.monthly_score end as score,
      row_number() over (order by case _period
        when 'daily' then es.daily_score when 'weekly' then es.weekly_score
        when 'all_time' then es.total_score else es.monthly_score end desc) as rank
    from employee_scores es join profiles p on p.id = es.employee_id
  ),
  self_rank as (select rank from ranked where employee_id = _employee_id)
  select r.employee_id, r.full_name, r.score, r.rank,
    case when r.employee_id = _employee_id then 'self'
      when r.rank < (select rank from self_rank) then 'above' else 'below' end
  from ranked r, self_rank sr
  where r.rank between sr.rank - _window and sr.rank + _window
  order by r.rank;
$$;
grant execute on function public.get_rank_neighbors(uuid,text,int) to authenticated;

create or replace function public.calculate_employee_score(_employee_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  v_target := coalesce(_employee_id, auth.uid());
  insert into employee_scores (employee_id, daily_score, weekly_score, monthly_score, total_score, last_calculated_at)
  values (
    v_target,
    (select coalesce(sum(score_value),0) from employee_score_events where employee_id = v_target and created_at >= current_date),
    (select coalesce(sum(score_value),0) from employee_score_events where employee_id = v_target and created_at >= date_trunc('week', current_date)),
    (select coalesce(sum(score_value),0) from employee_score_events where employee_id = v_target and created_at >= date_trunc('month', current_date)),
    (select coalesce(sum(score_value),0) from employee_score_events where employee_id = v_target),
    now()
  )
  on conflict (employee_id) do update set
    daily_score = excluded.daily_score, weekly_score = excluded.weekly_score,
    monthly_score = excluded.monthly_score, total_score = excluded.total_score,
    last_calculated_at = now();
end; $$;
grant execute on function public.calculate_employee_score(uuid) to authenticated;

create or replace function public.admin_gamification_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager')) then
    raise exception 'دسترسی ندارید';
  end if;
  select jsonb_build_object(
    'total_employees', (select count(*) from employee_scores),
    'total_events_today', (select count(*) from employee_score_events where created_at >= current_date),
    'top_scorer_today', (
      select jsonb_build_object('employee_id', es.employee_id, 'full_name', p.full_name, 'score', es.daily_score)
      from employee_scores es join profiles p on p.id = es.employee_id
      order by es.daily_score desc limit 1
    ),
    'total_penalties_today', (select count(*) from performance_penalties where created_at >= current_date),
    'total_xp_awarded_today', (select coalesce(sum(score_value),0) from employee_score_events where created_at >= current_date and score_value > 0)
  ) into v_result;
  return v_result;
end; $$;
grant execute on function public.admin_gamification_overview() to authenticated;