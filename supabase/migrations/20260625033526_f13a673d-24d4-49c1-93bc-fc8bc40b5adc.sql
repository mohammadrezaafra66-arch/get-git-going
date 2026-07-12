-- =========================
-- 1) Tables
-- =========================
create table if not exists public.delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('shipping_receipt','delivery_receipt')),
  invoice_id uuid references public.invoices(id),
  customer_id uuid references public.customers(id),
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  status text not null default 'pending_review'
    check (status in ('pending_review','confirmed','rejected','expired')),
  notes text,
  review_deadline timestamptz not null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_receipt_status_history (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.delivery_receipts(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id),
  note text,
  changed_at timestamptz not null default now()
);

-- =========================
-- 2) GRANTs
-- =========================
grant select, insert, update on public.delivery_receipts to authenticated;
grant all on public.delivery_receipts to service_role;
grant select, insert on public.delivery_receipt_status_history to authenticated;
grant all on public.delivery_receipt_status_history to service_role;

-- =========================
-- 3) Indexes
-- =========================
create index if not exists delivery_receipts_type_idx on public.delivery_receipts(type);
create index if not exists delivery_receipts_status_idx on public.delivery_receipts(status);
create index if not exists delivery_receipts_uploaded_by_idx on public.delivery_receipts(uploaded_by);
create index if not exists delivery_receipts_invoice_id_idx on public.delivery_receipts(invoice_id);
create index if not exists delivery_receipts_customer_id_idx on public.delivery_receipts(customer_id);
create index if not exists delivery_receipts_pending_deadline_idx
  on public.delivery_receipts(review_deadline)
  where status = 'pending_review';
create index if not exists delivery_receipt_status_history_receipt_idx
  on public.delivery_receipt_status_history(receipt_id);

-- =========================
-- 4) updated_at trigger
-- =========================
drop trigger if exists set_delivery_receipts_updated_at on public.delivery_receipts;
create trigger set_delivery_receipts_updated_at
  before update on public.delivery_receipts
  for each row execute function public.set_updated_at();

-- =========================
-- 5) RLS
-- =========================
alter table public.delivery_receipts enable row level security;
alter table public.delivery_receipt_status_history enable row level security;

drop policy if exists "uploader sees own receipts" on public.delivery_receipts;
create policy "uploader sees own receipts"
  on public.delivery_receipts for select
  to authenticated
  using (uploaded_by = auth.uid());

drop policy if exists "managers see all receipts" on public.delivery_receipts;
create policy "managers see all receipts"
  on public.delivery_receipts for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager')
  );

drop policy if exists "sales sees pending review" on public.delivery_receipts;
create policy "sales sees pending review"
  on public.delivery_receipts for select
  to authenticated
  using (
    status = 'pending_review' and
    public.has_role(auth.uid(), 'sales')
  );

drop policy if exists "manager and sales can upload" on public.delivery_receipts;
create policy "manager and sales can upload"
  on public.delivery_receipts for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'sales')
  );

drop policy if exists "reviewer can update" on public.delivery_receipts;
create policy "reviewer can update"
  on public.delivery_receipts for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'sales')
  )
  with check (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'sales')
  );

drop policy if exists "see history of accessible receipts" on public.delivery_receipt_status_history;
create policy "see history of accessible receipts"
  on public.delivery_receipt_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.delivery_receipts dr
      where dr.id = receipt_id
      and (
        dr.uploaded_by = auth.uid() or
        public.has_role(auth.uid(), 'admin') or
        public.has_role(auth.uid(), 'manager') or
        public.has_role(auth.uid(), 'sales')
      )
    )
  );

drop policy if exists "insert history" on public.delivery_receipt_status_history;
create policy "insert history"
  on public.delivery_receipt_status_history for insert
  to authenticated
  with check (changed_by = auth.uid() or changed_by is null);

-- =========================
-- 6) RPC: create_delivery_receipt
-- =========================
create or replace function public.create_delivery_receipt(
  p_type text,
  p_storage_path text,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_invoice_id uuid default null,
  p_customer_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_timer_minutes int;
  v_reviewer uuid;
  v_deadline timestamptz;
begin
  if not (
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'sales')
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  if p_type not in ('shipping_receipt','delivery_receipt') then
    raise exception 'نوع رسید نامعتبر است';
  end if;

  select timer_minutes into v_timer_minutes
  from public.workflow_settings
  where process_key = p_type and is_active = true;

  v_timer_minutes := coalesce(v_timer_minutes, 180);
  v_deadline := now() + (v_timer_minutes || ' minutes')::interval;

  insert into public.delivery_receipts (
    type, storage_path, file_name, file_size, mime_type,
    invoice_id, customer_id, uploaded_by, notes, review_deadline
  ) values (
    p_type, p_storage_path, p_file_name, p_file_size, p_mime_type,
    p_invoice_id, p_customer_id, auth.uid(), p_notes, v_deadline
  )
  returning id into v_receipt_id;

  insert into public.delivery_receipt_status_history
    (receipt_id, from_status, to_status, changed_by, note)
  values
    (v_receipt_id, null, 'pending_review', auth.uid(), 'رسید آپلود شد');

  select p.id into v_reviewer
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where p.is_active = true and ur.role = 'sales'
  order by p.created_at asc
  limit 1;

  if v_reviewer is not null then
    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'delivery_receipt_pending',
      v_reviewer,
      'in_app',
      jsonb_build_object(
        'title', 'رسید جدید در انتظار تأیید',
        'body', 'یک رسید جدید برای تأیید آپلود شده است.',
        'reference_type', 'delivery_receipt',
        'reference_id', v_receipt_id,
        'deadline', v_deadline
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'delivery_receipt', v_receipt_id::text, 'created',
    auth.uid(),
    jsonb_build_object('type', p_type, 'file_name', p_file_name)
  );

  return v_receipt_id;
end;
$$;

grant execute on function public.create_delivery_receipt(text, text, text, bigint, text, uuid, uuid, text) to authenticated;

-- =========================
-- 7) RPC: review_delivery_receipt
-- =========================
create or replace function public.review_delivery_receipt(
  p_receipt_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_uploader uuid;
  v_type text;
begin
  if not (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'sales')
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  if p_decision not in ('confirmed','rejected') then
    raise exception 'تصمیم نامعتبر است';
  end if;

  select status, uploaded_by, type
  into v_old_status, v_uploader, v_type
  from public.delivery_receipts
  where id = p_receipt_id;

  if not found then
    raise exception 'رسید یافت نشد';
  end if;

  if v_old_status <> 'pending_review' then
    raise exception 'این رسید قبلاً بررسی شده است';
  end if;

  update public.delivery_receipts
  set
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_receipt_id;

  insert into public.delivery_receipt_status_history
    (receipt_id, from_status, to_status, changed_by, note)
  values
    (p_receipt_id, v_old_status, p_decision, auth.uid(), p_note);

  insert into public.notification_events
    (event_type, user_id, channel, payload, status)
  values (
    'delivery_receipt_reviewed',
    v_uploader,
    'in_app',
    jsonb_build_object(
      'title', case p_decision when 'confirmed' then 'رسید تأیید شد' else 'رسید رد شد' end,
      'body', case p_decision
        when 'confirmed' then 'رسید شما تأیید شد.'
        else 'رسید شما رد شد. لطفاً دوباره بررسی کنید.'
      end,
      'reference_type', 'delivery_receipt',
      'reference_id', p_receipt_id
    ),
    'pending'
  );

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'delivery_receipt', p_receipt_id::text, p_decision,
    auth.uid(),
    jsonb_build_object('note', p_note)
  );
end;
$$;

grant execute on function public.review_delivery_receipt(uuid, text, text) to authenticated;

-- =========================
-- 8) RPC: expire_pending_delivery_receipts
-- =========================
create or replace function public.expire_pending_delivery_receipts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_penalty_enabled boolean;
begin
  for v_rec in
    select dr.id, dr.uploaded_by, dr.type
    from public.delivery_receipts dr
    where dr.status = 'pending_review'
    and dr.review_deadline < now()
    for update
  loop
    update public.delivery_receipts
    set status = 'expired', updated_at = now()
    where id = v_rec.id;

    insert into public.delivery_receipt_status_history
      (receipt_id, from_status, to_status, changed_by, note)
    values
      (v_rec.id, 'pending_review', 'expired', null,
       'منقضی شد — تأییدکننده در مهلت مقرر پاسخ نداد');

    select penalty_enabled into v_penalty_enabled
    from public.workflow_settings
    where process_key = v_rec.type and is_active = true;

    if coalesce(v_penalty_enabled, true) then
      perform public.auto_submit_penalty(
        null,
        v_rec.uploaded_by,
        'no_confirm_store',
        'low',
        'عدم آپلود رسید ' || v_rec.type || ' در مهلت مقرر'
      );
    end if;

    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'delivery_receipt_expired',
      v_rec.uploaded_by,
      'in_app',
      jsonb_build_object(
        'title', 'رسید منقضی شد',
        'body', 'مهلت آپلود رسید به پایان رسید.',
        'reference_type', 'delivery_receipt',
        'reference_id', v_rec.id
      ),
      'pending'
    );
  end loop;
end;
$$;

grant execute on function public.expire_pending_delivery_receipts() to service_role;

-- =========================
-- 9) RPC: get_delivery_receipts
-- =========================
create or replace function public.get_delivery_receipts(
  p_type text default null,
  p_status text default null,
  p_invoice_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  type text,
  status text,
  file_name text,
  file_size bigint,
  storage_path text,
  invoice_id uuid,
  customer_id uuid,
  uploaded_by uuid,
  uploader_name text,
  reviewed_by uuid,
  reviewer_name text,
  notes text,
  created_at timestamptz,
  review_deadline timestamptz,
  reviewed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    dr.id, dr.type, dr.status, dr.file_name, dr.file_size,
    dr.storage_path, dr.invoice_id, dr.customer_id,
    dr.uploaded_by,
    up.full_name as uploader_name,
    dr.reviewed_by,
    rv.full_name as reviewer_name,
    dr.notes, dr.created_at, dr.review_deadline, dr.reviewed_at
  from public.delivery_receipts dr
  join public.profiles up on up.id = dr.uploaded_by
  left join public.profiles rv on rv.id = dr.reviewed_by
  where
    (p_type is null or dr.type = p_type) and
    (p_status is null or dr.status = p_status) and
    (p_invoice_id is null or dr.invoice_id = p_invoice_id) and
    (
      dr.uploaded_by = auth.uid() or
      public.has_role(auth.uid(), 'admin') or
      public.has_role(auth.uid(), 'manager') or
      public.has_role(auth.uid(), 'sales')
    )
  order by dr.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_delivery_receipts(text, text, uuid, int, int) to authenticated;

-- =========================
-- 10) Hook into tick_inquiries (same body + extra perform)
-- =========================
create or replace function public.tick_inquiries()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
  v_target_user uuid;
begin
  for r in select id, status from public.inquiries
    where status = 'pending' and now() - created_at > interval '5 minutes' for update
  loop
    update public.inquiries set status = 'warning_5min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'warning_5min', null, 'auto-tick');
  end loop;

  for r in select id, status from public.inquiries
    where status = 'warning_5min' and now() - created_at > interval '8 minutes' for update
  loop
    update public.inquiries set status = 'danger_8min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'danger_8min', null, 'auto-tick');
  end loop;

  for r in select id, status, assigned_to, requested_by from public.inquiries
    where status = 'danger_8min' and now() - created_at > interval '10 minutes' for update
  loop
    update public.inquiries set status = 'critical_10min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'critical_10min', null, 'auto-tick');

    v_target_user := coalesce(r.assigned_to, r.requested_by);
    if v_target_user is not null then
      perform public.auto_submit_penalty(
        r.id, v_target_user, 'no_response_primary', 'medium',
        'عدم پاسخ مسئول اول طی ۱۰ دقیقه'
      );
    end if;
  end loop;

  for r in select id, status from public.inquiries
    where status = 'critical_10min' and now() - created_at > interval '10 minutes' for update
  loop
    update public.inquiries set status = 'transfer_available' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'transfer_available', null, 'auto-tick');
  end loop;

  for r in select id, status from public.inquiries
    where status not in ('answered','completed_on_time','completed_late','expired','cancelled','rejected')
    and now() - created_at > interval '30 minutes' for update
  loop
    update public.inquiries set status = 'expired', closed_at = now() where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'expired', null, 'auto-tick');
  end loop;

  perform public.expire_pending_documents();
  perform public.expire_pending_delivery_receipts();
end;
$function$;

-- =========================
-- 11) Storage policies for bucket 'delivery-receipts'
-- =========================
drop policy if exists "delivery_receipts upload by allowed roles" on storage.objects;
create policy "delivery_receipts upload by allowed roles"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'delivery-receipts' and (
      public.has_role(auth.uid(), 'admin') or
      public.has_role(auth.uid(), 'manager') or
      public.has_role(auth.uid(), 'sales')
    )
  );

drop policy if exists "delivery_receipts read by authenticated" on storage.objects;
create policy "delivery_receipts read by authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'delivery-receipts');
