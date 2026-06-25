-- Slice 9: Purchase requests, status history, receipts

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  product_id uuid not null references public.products(id),
  quantity numeric not null check (quantity > 0),
  unit text not null default 'عدد',
  requested_by uuid not null references auth.users(id),
  assigned_to uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','approved','purchased','delivered','cancelled')),
  notes text,
  expected_price numeric,
  final_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.purchase_requests to authenticated;
grant all on public.purchase_requests to service_role;

alter table public.purchase_requests enable row level security;

create policy "requester sees own requests"
  on public.purchase_requests for select to authenticated
  using (requested_by = auth.uid());

create policy "assignee sees assigned requests"
  on public.purchase_requests for select to authenticated
  using (assigned_to = auth.uid());

create policy "managers see all requests"
  on public.purchase_requests for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

create policy "sales and manager can insert"
  on public.purchase_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and (
      public.has_role(auth.uid(), 'sales') or
      public.has_role(auth.uid(), 'manager') or
      public.has_role(auth.uid(), 'admin')
    )
  );

create policy "update by assignee or manager"
  on public.purchase_requests for update to authenticated
  using (
    assigned_to = auth.uid() or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'admin')
  );

create index on public.purchase_requests(status);
create index on public.purchase_requests(requested_by);
create index on public.purchase_requests(assigned_to);
create index on public.purchase_requests(inquiry_id);
create index on public.purchase_requests(product_id);

create trigger trg_purchase_requests_updated_at
  before update on public.purchase_requests
  for each row execute function public.set_updated_at();

-- Status history
create table public.purchase_request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid not null references auth.users(id),
  note text,
  changed_at timestamptz not null default now()
);

grant select, insert on public.purchase_request_status_history to authenticated;
grant all on public.purchase_request_status_history to service_role;

alter table public.purchase_request_status_history enable row level security;

create policy "see history of own requests"
  on public.purchase_request_status_history for select to authenticated
  using (
    exists (
      select 1 from public.purchase_requests pr
      where pr.id = request_id
        and (pr.requested_by = auth.uid() or pr.assigned_to = auth.uid())
    )
  );

create policy "managers see all history"
  on public.purchase_request_status_history for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

create policy "insert history by participants"
  on public.purchase_request_status_history for insert to authenticated
  with check (changed_by = auth.uid());

create index on public.purchase_request_status_history(request_id);

-- Receipts
create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

grant select, insert, delete on public.purchase_receipts to authenticated;
grant all on public.purchase_receipts to service_role;

alter table public.purchase_receipts enable row level security;

create policy "participants see receipts"
  on public.purchase_receipts for select to authenticated
  using (
    exists (
      select 1 from public.purchase_requests pr
      where pr.id = request_id
        and (pr.requested_by = auth.uid() or pr.assigned_to = auth.uid())
    )
  );

create policy "managers see all receipts"
  on public.purchase_receipts for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

create policy "assignee can upload receipt"
  on public.purchase_receipts for insert to authenticated
  with check (uploaded_by = auth.uid());

create policy "uploader or manager can delete receipt"
  on public.purchase_receipts for delete to authenticated
  using (
    uploaded_by = auth.uid() or
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager')
  );

create index on public.purchase_receipts(request_id);

-- ============ RPCs ============

create or replace function public.create_purchase_request(
  p_product_id uuid,
  p_quantity numeric,
  p_unit text,
  p_inquiry_id uuid default null,
  p_notes text default null,
  p_expected_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_assigned_to uuid;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'احراز هویت لازم است';
  end if;

  if not (
    public.has_role(v_caller, 'sales') or
    public.has_role(v_caller, 'manager') or
    public.has_role(v_caller, 'admin')
  ) then
    raise exception 'دسترسی برای ثبت درخواست خرید ندارید';
  end if;

  select p.id into v_assigned_to
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where p.is_active = true and ur.role = 'manager'
  order by p.created_at asc
  limit 1;

  insert into public.purchase_requests (
    product_id, quantity, unit, inquiry_id,
    requested_by, assigned_to, notes, expected_price
  ) values (
    p_product_id, p_quantity, coalesce(p_unit, 'عدد'), p_inquiry_id,
    v_caller, v_assigned_to, p_notes, p_expected_price
  )
  returning id into v_request_id;

  insert into public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  values
    (v_request_id, null, 'pending', v_caller, 'درخواست ایجاد شد');

  if v_assigned_to is not null then
    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'purchase_request_new', v_assigned_to, 'in_app',
      jsonb_build_object(
        'title','درخواست خرید جدید',
        'body','یک درخواست خرید جدید برای بررسی ثبت شده است.',
        'reference_type','purchase_request',
        'reference_id', v_request_id
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'purchase_request', v_request_id::text, 'created',
    v_caller,
    jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity)
  );

  return v_request_id;
end;
$$;

revoke execute on function public.create_purchase_request(uuid, numeric, text, uuid, text, numeric) from public;
grant execute on function public.create_purchase_request(uuid, numeric, text, uuid, text, numeric) to authenticated;

create or replace function public.update_purchase_status(
  p_request_id uuid,
  p_new_status text,
  p_note text default null,
  p_final_price numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_requester uuid;
  v_assignee uuid;
  v_caller uuid := auth.uid();
  v_status_fa text;
begin
  if v_caller is null then
    raise exception 'احراز هویت لازم است';
  end if;

  if p_new_status not in ('pending','approved','purchased','delivered','cancelled') then
    raise exception 'وضعیت نامعتبر است';
  end if;

  select status, requested_by, assigned_to
    into v_old_status, v_requester, v_assignee
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'درخواست یافت نشد';
  end if;

  if not (
    public.has_role(v_caller, 'admin') or
    public.has_role(v_caller, 'manager') or
    v_assignee = v_caller
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  update public.purchase_requests
  set
    status = p_new_status,
    final_price = coalesce(p_final_price, final_price),
    updated_at = now()
  where id = p_request_id;

  insert into public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  values
    (p_request_id, v_old_status, p_new_status, v_caller, p_note);

  v_status_fa := case p_new_status
    when 'pending' then 'در انتظار تأیید'
    when 'approved' then 'تأیید شده'
    when 'purchased' then 'خرید انجام شد'
    when 'delivered' then 'تحویل داده شد'
    when 'cancelled' then 'لغو شد'
    else p_new_status
  end;

  insert into public.notification_events
    (event_type, user_id, channel, payload, status)
  values (
    'purchase_status_changed', v_requester, 'in_app',
    jsonb_build_object(
      'title','وضعیت درخواست خرید تغییر کرد',
      'body','وضعیت درخواست خرید شما به «' || v_status_fa || '» تغییر یافت.',
      'reference_type','purchase_request',
      'reference_id', p_request_id,
      'from', v_old_status,
      'to', p_new_status
    ),
    'pending'
  );

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'purchase_request', p_request_id::text, 'status_changed',
    v_caller,
    jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$$;

revoke execute on function public.update_purchase_status(uuid, text, text, numeric) from public;
grant execute on function public.update_purchase_status(uuid, text, text, numeric) to authenticated;

create or replace function public.get_purchase_requests(
  p_status text default null,
  p_product_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  quantity numeric,
  unit text,
  status text,
  requested_by uuid,
  requester_name text,
  assigned_to uuid,
  assignee_name text,
  inquiry_id uuid,
  expected_price numeric,
  final_price numeric,
  notes text,
  created_at timestamptz,
  receipt_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.product_id,
    p.name as product_name,
    pr.quantity,
    pr.unit,
    pr.status,
    pr.requested_by,
    rq.full_name as requester_name,
    pr.assigned_to,
    aq.full_name as assignee_name,
    pr.inquiry_id,
    pr.expected_price,
    pr.final_price,
    pr.notes,
    pr.created_at,
    count(rc.id) as receipt_count
  from public.purchase_requests pr
  join public.products p on p.id = pr.product_id
  join public.profiles rq on rq.id = pr.requested_by
  left join public.profiles aq on aq.id = pr.assigned_to
  left join public.purchase_receipts rc on rc.request_id = pr.id
  where
    (p_status is null or pr.status = p_status) and
    (p_product_id is null or pr.product_id = p_product_id) and
    (
      pr.requested_by = auth.uid() or
      pr.assigned_to = auth.uid() or
      public.has_role(auth.uid(), 'admin') or
      public.has_role(auth.uid(), 'manager')
    )
  group by pr.id, p.name, rq.full_name, aq.full_name
  order by pr.created_at desc
  limit p_limit offset p_offset;
$$;

revoke execute on function public.get_purchase_requests(text, uuid, int, int) from public;
grant execute on function public.get_purchase_requests(text, uuid, int, int) to authenticated;
