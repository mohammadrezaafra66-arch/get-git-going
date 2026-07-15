
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS product_video_required boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_delivery_receipt(
  p_type text,
  p_storage_path text,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_receipt_id uuid;
  v_timer_minutes int;
  v_deadline timestamptz;
  v_video_required boolean;
  v_is_video boolean;
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

  v_is_video := coalesce(p_mime_type,'') like 'video/%';

  if p_invoice_id is not null then
    select coalesce(product_video_required, false)
      into v_video_required
    from public.invoices where id = p_invoice_id;

    if coalesce(v_video_required, false) and not v_is_video then
      raise exception 'برای این فاکتور آپلود ویدئوی محصول الزامی است';
    end if;
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
  ) returning id into v_receipt_id;

  insert into public.delivery_receipt_status_history(receipt_id, from_status, to_status, changed_by, note)
  values (v_receipt_id, null, 'pending_review', auth.uid(), null);

  return v_receipt_id;
end;
$function$;
