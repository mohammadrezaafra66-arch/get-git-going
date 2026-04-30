-- 1. Birth date columns
alter table public.customers add column if not exists birth_date date;
alter table public.profiles  add column if not exists birth_date date;

-- 2. Default birthday message template (insert only if missing)
insert into public.shop_settings (key, value)
values ('birthday_message_template', '🎂 تولدت مبارک! سالی پر از موفقیت و سلامتی برایت آرزومندیم.')
on conflict (key) do nothing;

-- 3. RPC: generate today's birthday notifications, deduped per recipient/person/day.
create or replace function public.generate_birthday_notifications()
returns table (created_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_template text;
  v_today date := current_date;
  v_count integer := 0;
  r_person record;
  r_recipient record;
  v_title text;
  v_body text;
  v_ref_type text;
  v_ref_id uuid;
  v_exists boolean;
begin
  -- Auth + role gate
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  if not has_any_role(v_caller, array['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) then
    raise exception 'insufficient privileges';
  end if;

  -- Load message template (fallback if missing)
  select coalesce(nullif(value, ''), '🎂 تولدت مبارک!')
    into v_template
  from public.shop_settings
  where key = 'birthday_message_template'
  limit 1;
  if v_template is null then
    v_template := '🎂 تولدت مبارک!';
  end if;

  -- Iterate customers + users whose birthday matches today (day+month)
  for r_person in
    select 'customer'::text as kind, c.id as person_id, c.name as person_name
      from public.customers c
      where c.birth_date is not null
        and c.is_active = true
        and extract(month from c.birth_date) = extract(month from v_today)
        and extract(day   from c.birth_date) = extract(day   from v_today)
    union all
    select 'user'::text as kind, p.id as person_id,
           coalesce(p.full_name, p.email, 'کاربر') as person_name
      from public.profiles p
      where p.birth_date is not null
        and extract(month from p.birth_date) = extract(month from v_today)
        and extract(day   from p.birth_date) = extract(day   from v_today)
  loop
    v_ref_type := r_person.kind;
    v_ref_id   := r_person.person_id;
    v_title := case r_person.kind
                 when 'customer' then 'تولد مشتری: ' || r_person.person_name
                 else 'تولد کاربر: ' || r_person.person_name
               end;
    v_body  := v_template || E'\n' ||
               case r_person.kind when 'customer' then 'مشتری: ' else 'کاربر: ' end
               || r_person.person_name;

    -- For each admin/accountant recipient
    for r_recipient in
      select distinct ur.user_id
      from public.user_roles ur
      where ur.role in ('admin'::app_role, 'accountant'::app_role)
    loop
      -- Dedupe: same recipient, same person, type=birthday, today
      select exists(
        select 1 from public.notification_queue n
        where n.user_id = r_recipient.user_id
          and n.type = 'birthday'
          and n.reference_type = v_ref_type
          and n.reference_id = v_ref_id
          and n.created_at >= v_today::timestamptz
          and n.created_at <  (v_today + 1)::timestamptz
      ) into v_exists;

      if not v_exists then
        insert into public.notification_queue
          (user_id, title, body, type, reference_type, reference_id)
        values
          (r_recipient.user_id, v_title, v_body, 'birthday', v_ref_type, v_ref_id);
        v_count := v_count + 1;

        insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        values (
          v_caller,
          v_ref_type,
          v_ref_id::text,
          'birthday_notification_sent',
          jsonb_build_object(
            'recipient_id', r_recipient.user_id,
            'person_kind',  v_ref_type,
            'person_id',    v_ref_id,
            'person_name',  r_person.person_name,
            'date',         v_today
          )
        );
      end if;
    end loop;
  end loop;

  return query select v_count;
end;
$$;

revoke all on function public.generate_birthday_notifications() from public, anon;
grant execute on function public.generate_birthday_notifications() to authenticated;

-- Constraint: birth_date must not be in the future
alter table public.customers drop constraint if exists customers_birth_date_not_future;
alter table public.customers add constraint customers_birth_date_not_future
  check (birth_date is null or birth_date <= current_date) not valid;

alter table public.profiles  drop constraint if exists profiles_birth_date_not_future;
alter table public.profiles  add constraint profiles_birth_date_not_future
  check (birth_date is null or birth_date <= current_date) not valid;