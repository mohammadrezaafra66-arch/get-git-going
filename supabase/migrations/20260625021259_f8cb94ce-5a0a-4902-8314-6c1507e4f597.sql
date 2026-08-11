
create policy "accountant and manager can upload documents storage"
  on storage.objects for insert
  with check (
    bucket_id = 'documents' and
    auth.role() = 'authenticated' and (
      public.has_role(auth.uid(),'accountant') or
      public.has_role(auth.uid(),'admin') or
      public.has_role(auth.uid(),'manager')
    )
  );

create policy "authenticated can view documents storage"
  on storage.objects for select
  using (
    bucket_id = 'documents' and auth.role() = 'authenticated'
  );
