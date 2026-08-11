DROP POLICY IF EXISTS "assignee can upload receipt" ON public.purchase_receipts;

CREATE POLICY "assignee or manager can upload receipt"
ON public.purchase_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id AND pr.assigned_to = auth.uid()
    )
  )
);