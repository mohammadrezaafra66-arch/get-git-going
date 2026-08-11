
DROP POLICY IF EXISTS "authenticated can view documents storage" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_read_restricted" ON storage.objects;

CREATE POLICY "documents read by allowed roles"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'accountant')
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = storage.objects.name
        AND d.uploaded_by = auth.uid()
    )
  )
);
