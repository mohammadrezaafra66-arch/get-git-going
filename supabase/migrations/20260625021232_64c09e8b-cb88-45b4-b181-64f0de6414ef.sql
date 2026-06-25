
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('bijak','invoice','havale')),
  reference_id uuid,
  reference_type text check (reference_type in ('inquiry','purchase_request') or reference_type is null),
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  status text not null default 'pending_review'
    check (status in ('pending_review','confirmed','rejected','expired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  review_deadline timestamptz not null default (now() + interval '10 minutes'),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

grant select, insert, update on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;

create table public.document_status_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id),
  note text,
  changed_at timestamptz not null default now()
);

grant select, insert on public.document_status_history to authenticated;
grant all on public.document_status_history to service_role;
alter table public.document_status_history enable row level security;

create index documents_type_idx on public.documents(type);
create index documents_status_idx on public.documents(status);
create index documents_uploaded_by_idx on public.documents(uploaded_by);
create index documents_reference_id_idx on public.documents(reference_id);
create index documents_pending_deadline_idx on public.documents(review_deadline) where status = 'pending_review';
create index document_status_history_document_idx on public.document_status_history(document_id);

create trigger set_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create policy "uploader sees own documents"
  on public.documents for select
  using (uploaded_by = auth.uid());

create policy "managers see all documents"
  on public.documents for select
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

create policy "accountant can insert documents"
  on public.documents for insert
  with check (
    uploaded_by = auth.uid() and (
      public.has_role(auth.uid(),'accountant') or
      public.has_role(auth.uid(),'admin') or
      public.has_role(auth.uid(),'manager')
    )
  );

create policy "reviewer can update document status"
  on public.documents for update
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

create policy "see history of accessible documents"
  on public.document_status_history for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and (
          d.uploaded_by = auth.uid() or
          public.has_role(auth.uid(),'admin') or
          public.has_role(auth.uid(),'manager')
        )
    )
  );

create policy "insert document history"
  on public.document_status_history for insert
  with check (changed_by = auth.uid() or changed_by is null);

create or replace function public.create_document(
  p_type text,
  p_storage_path text,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_reference_id uuid default null,
  p_reference_type text default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_doc_id uuid;
  v_reviewer uuid;
begin
  if not (
    public.has_role(auth.uid(),'accountant') or
    public.has_role(auth.uid(),'admin') or
    public.has_role(auth.uid(),'manager')
  ) then
    raise exception 'فقط حسابدار یا مدیر می‌تواند سند آپلود کند';
  end if;

  insert into public.documents (
    type, storage_path, file_name, file_size, mime_type,
    reference_id, reference_type, uploaded_by, notes
  ) values (
    p_type, p_storage_path, p_file_name, p_file_size, p_mime_type,
    p_reference_id, p_reference_type, auth.uid(), p_notes
  ) returning id into v_doc_id;

  insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
  values (v_doc_id, null, 'pending_review', auth.uid(), 'سند آپلود شد');

  select p.id into v_reviewer
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where coalesce(p.is_active, true) = true
    and ur.role = 'manager'
  order by p.created_at asc
  limit 1;

  if v_reviewer is not null then
    insert into public.notification_events(event_type, user_id, channel, payload, status)
    values (
      'document_pending_review', v_reviewer, 'in_app',
      jsonb_build_object(
        'title','سند جدید در انتظار تأیید',
        'body','یک ' || p_type || ' جدید برای تأیید آپلود شده است.',
        'reference_type','document',
        'reference_id', v_doc_id,
        'deadline', (now() + interval '10 minutes')
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  values ('document', v_doc_id::text, 'created', auth.uid(),
          jsonb_build_object('type', p_type, 'file_name', p_file_name));

  return v_doc_id;
end;
$$;

grant execute on function public.create_document(text,text,text,bigint,text,uuid,text,text) to authenticated;

create or replace function public.review_document(
  p_document_id uuid,
  p_decision text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old_status text;
  v_uploader uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'تصمیم نامعتبر';
  end if;

  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'فقط مدیر می‌تواند سند را تأیید یا رد کند';
  end if;

  select status, uploaded_by into v_old_status, v_uploader
  from public.documents where id = p_document_id for update;

  if not found then raise exception 'سند یافت نشد'; end if;
  if v_old_status <> 'pending_review' then
    raise exception 'این سند قبلاً بررسی شده است';
  end if;

  update public.documents
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_document_id;

  insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
  values (p_document_id, v_old_status, p_decision, auth.uid(), p_note);

  insert into public.notification_events(event_type, user_id, channel, payload, status)
  values (
    'document_reviewed', v_uploader, 'in_app',
    jsonb_build_object(
      'title', case p_decision when 'confirmed' then 'سند تأیید شد' else 'سند رد شد' end,
      'body',  case p_decision when 'confirmed' then 'سند شما با موفقیت تأیید شد.' else 'سند شما رد شد. لطفاً دوباره بررسی کنید.' end,
      'reference_type','document',
      'reference_id', p_document_id
    ),
    'pending'
  );

  insert into public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  values ('document', p_document_id::text, p_decision, auth.uid(),
          jsonb_build_object('note', p_note));
end;
$$;

grant execute on function public.review_document(uuid,text,text) to authenticated;

create or replace function public.expire_pending_documents()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_doc record;
  v_manager uuid;
begin
  for v_doc in
    select id, uploaded_by
    from public.documents
    where status = 'pending_review' and review_deadline < now()
    for update
  loop
    update public.documents set status = 'expired', updated_at = now() where id = v_doc.id;

    insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
    values (v_doc.id, 'pending_review', 'expired', null,
            'منقضی شد — مسئول فروشگاه در ۱۰ دقیقه پاسخ نداد');

    select p.id into v_manager
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where coalesce(p.is_active, true) = true and ur.role = 'manager'
    order by p.created_at asc limit 1;

    if v_manager is not null then
      perform public.auto_submit_penalty(
        null, v_manager, 'no_confirm_store', 'low',
        'عدم تأیید سند ' || v_doc.id::text || ' در مهلت ۱۰ دقیقه'
      );
    end if;

    insert into public.notification_events(event_type, user_id, channel, payload, status)
    values (
      'document_expired', v_doc.uploaded_by, 'in_app',
      jsonb_build_object(
        'title','سند منقضی شد',
        'body','مسئول فروشگاه در مهلت مقرر پاسخ نداد.',
        'reference_type','document',
        'reference_id', v_doc.id
      ),
      'pending'
    );
  end loop;
end;
$$;

grant execute on function public.expire_pending_documents() to service_role;

create or replace function public.get_documents(
  p_type text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid, type text, status text, file_name text, file_size bigint,
  storage_path text, reference_id uuid, reference_type text,
  uploaded_by uuid, uploader_name text,
  reviewed_by uuid, reviewer_name text,
  notes text, created_at timestamptz, review_deadline timestamptz, reviewed_at timestamptz
)
language sql security definer set search_path = public
as $$
  select
    d.id, d.type, d.status, d.file_name, d.file_size,
    d.storage_path, d.reference_id, d.reference_type,
    d.uploaded_by, up.full_name,
    d.reviewed_by, rv.full_name,
    d.notes, d.created_at, d.review_deadline, d.reviewed_at
  from public.documents d
  join public.profiles up on up.id = d.uploaded_by
  left join public.profiles rv on rv.id = d.reviewed_by
  where (p_type is null or d.type = p_type)
    and (p_status is null or d.status = p_status)
    and (
      d.uploaded_by = auth.uid() or
      public.has_role(auth.uid(),'admin') or
      public.has_role(auth.uid(),'manager')
    )
  order by d.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_documents(text,text,int,int) to authenticated;

create or replace function public.tick_inquiries()
returns void
language plpgsql security definer set search_path = public
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
end;
$function$;
