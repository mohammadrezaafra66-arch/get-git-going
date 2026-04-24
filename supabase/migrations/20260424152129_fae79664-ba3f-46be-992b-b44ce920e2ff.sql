-- Audit trigger for user_roles changes
create or replace function public.audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', new.user_id::text, 'role_assigned',
            jsonb_build_object('role', new.role, 'assigned_by', new.assigned_by));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', old.user_id::text, 'role_revoked',
            jsonb_build_object('role', old.role));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', new.user_id::text, 'role_updated',
            jsonb_build_object('old_role', old.role, 'new_role', new.role));
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_user_roles();