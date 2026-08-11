DROP POLICY IF EXISTS "product_images_storage_read" ON storage.objects;
CREATE POLICY "product_images_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_storage_write" ON storage.objects;
CREATE POLICY "product_images_storage_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

DROP POLICY IF EXISTS "product_images_storage_delete" ON storage.objects;
CREATE POLICY "product_images_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );