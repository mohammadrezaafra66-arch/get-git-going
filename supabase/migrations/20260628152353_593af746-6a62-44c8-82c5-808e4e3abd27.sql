
-- FIX 2: notification_events — prevent cross-user spam
DROP POLICY IF EXISTS "ne_insert_auth" ON public.notification_events;
DROP POLICY IF EXISTS "ne_insert_own_only" ON public.notification_events;

CREATE POLICY "ne_insert_own_only"
ON public.notification_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND event_type IN (
    'invoice_approved',
    'inquiry_closed',
    'task_assigned',
    'message_received',
    'system_alert',
    'price_alert',
    'purchase_request_new'
  )
);

-- FIX 5: product-images storage — restrict reads to staff roles (bucket stays private)
DROP POLICY IF EXISTS "product_images_storage_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images read by staff" ON storage.objects;

CREATE POLICY "product_images read by staff"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'purchasing')
    OR public.has_role(auth.uid(), 'accountant')
  )
);
