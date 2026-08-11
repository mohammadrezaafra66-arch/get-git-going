DROP POLICY IF EXISTS "delivery_receipts read by authenticated" ON storage.objects;

CREATE POLICY "delivery_receipts read by allowed roles"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-receipts'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'sales')
    OR EXISTS (
      SELECT 1 FROM public.delivery_receipts dr
      WHERE dr.storage_path = storage.objects.name
        AND dr.uploaded_by = auth.uid()
    )
  )
);