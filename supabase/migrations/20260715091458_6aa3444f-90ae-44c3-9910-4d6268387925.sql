
DROP POLICY IF EXISTS "managers see all documents" ON public.documents;
CREATE POLICY "reviewers see all documents" ON public.documents
FOR SELECT USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
);

DROP POLICY IF EXISTS "reviewer can update document status" ON public.documents;
CREATE POLICY "reviewer can update document status" ON public.documents
FOR UPDATE USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
) WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
);

CREATE OR REPLACE FUNCTION public.review_document(p_document_id uuid, p_decision text, p_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old_status text;
  v_uploader uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'تصمیم نامعتبر';
  end if;

  if not (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'manager')
    or public.has_role(auth.uid(),'accountant')
  ) then
    raise exception 'فقط حسابدار یا مدیر می‌تواند سند را تأیید یا رد کند';
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
$function$;
