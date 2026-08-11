-- Slice 9: RLS for purchase-receipts storage bucket
-- File path convention: <purchase_request_id>/<filename>

create policy "view purchase receipts (participants and managers)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'purchase-receipts'
    and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'manager')
      or exists (
        select 1 from public.purchase_requests pr
        where pr.id::text = split_part(name, '/', 1)
          and (pr.requested_by = auth.uid() or pr.assigned_to = auth.uid())
      )
    )
  );

create policy "upload purchase receipts (assignee or manager)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'purchase-receipts'
    and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'manager')
      or exists (
        select 1 from public.purchase_requests pr
        where pr.id::text = split_part(name, '/', 1)
          and pr.assigned_to = auth.uid()
      )
    )
  );

create policy "delete purchase receipts (owner or manager)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'purchase-receipts'
    and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'manager')
      or owner = auth.uid()
    )
  );
