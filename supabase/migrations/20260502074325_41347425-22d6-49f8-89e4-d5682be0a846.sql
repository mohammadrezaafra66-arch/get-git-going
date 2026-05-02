
-- 1. Private storage bucket
insert into storage.buckets (id, name, public)
values ('payment-receipt-documents', 'payment-receipt-documents', false)
on conflict (id) do nothing;

-- 2. Documents table
create table public.payment_receipt_documents (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.payment_receipts(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size >= 0),
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);

create index idx_prd_receipt_id on public.payment_receipt_documents(receipt_id);
create index idx_prd_uploaded_by on public.payment_receipt_documents(uploaded_by);

alter table public.payment_receipt_documents enable row level security;

-- 3. RLS on documents table
create policy "prd_select_privileged"
on public.payment_receipt_documents for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'manager'::app_role)
  or public.has_role(auth.uid(), 'accountant'::app_role)
);

create policy "prd_insert_admin_accountant"
on public.payment_receipt_documents for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'accountant'::app_role)
  )
);

create policy "prd_delete_admin_accountant"
on public.payment_receipt_documents for delete
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'accountant'::app_role)
);

-- 4. RLS on storage.objects scoped to this bucket
create policy "prd_storage_select_privileged"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipt-documents'
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'manager'::app_role)
    or public.has_role(auth.uid(), 'accountant'::app_role)
  )
);

create policy "prd_storage_insert_admin_accountant"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-receipt-documents'
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'accountant'::app_role)
  )
);

create policy "prd_storage_delete_admin_accountant"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'payment-receipt-documents'
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'accountant'::app_role)
  )
);
