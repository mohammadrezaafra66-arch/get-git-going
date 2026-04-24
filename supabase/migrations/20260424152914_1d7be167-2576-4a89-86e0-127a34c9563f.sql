-- 1) Generic event logger (callable by authenticated users; SECURITY INVOKER so RLS applies)
create or replace function public.log_event(
  _entity_type text,
  _entity_id text,
  _action text,
  _diff jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), _entity_type, _entity_id, _action, _diff);
end;
$$;

revoke all on function public.log_event(text, text, text, jsonb) from public;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated;

-- 2) Controlled role assignment (admin only)
create or replace function public.assign_user_role(
  _target_user uuid,
  _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: only admins can assign roles' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, assigned_by)
  values (_target_user, _role, auth.uid())
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.assign_user_role(uuid, public.app_role) from public;
grant execute on function public.assign_user_role(uuid, public.app_role) to authenticated;

-- 3) Controlled role revocation (admin only; cannot revoke own admin)
create or replace function public.revoke_user_role(
  _target_user uuid,
  _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: only admins can revoke roles' using errcode = '42501';
  end if;

  if _target_user = auth.uid() and _role = 'admin' then
    raise exception 'forbidden: admins cannot revoke their own admin role' using errcode = '42501';
  end if;

  delete from public.user_roles
  where user_id = _target_user and role = _role;
end;
$$;

revoke all on function public.revoke_user_role(uuid, public.app_role) from public;
grant execute on function public.revoke_user_role(uuid, public.app_role) to authenticated;