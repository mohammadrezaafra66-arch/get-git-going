-- G-4: cancel_invoice RPC for safe pre-invoice cancellation with role check + credit release
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_is_authorized boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Role check: admin or accountant only
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user AND role IN ('admin','accountant')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'forbidden: only admin or accountant can cancel invoices' USING ERRCODE = '42501';
  END IF;

  -- Lock and load invoice
  SELECT id, customer_id, total_amount, status, type, invoice_type, created_by
    INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'only draft invoices can be canceled (current: %)', v_inv.status USING ERRCODE = '22023';
  END IF;

  -- Update status
  UPDATE public.invoices
     SET status = 'canceled', updated_at = now()
   WHERE id = p_invoice_id;

  -- Release credit when applicable (pre_invoice with credit hold)
  IF v_inv.invoice_type = 'pre_invoice' AND v_inv.customer_id IS NOT NULL AND COALESCE(v_inv.total_amount,0) > 0 THEN
    BEGIN
      PERFORM public.release_credit(
        p_customer_id := v_inv.customer_id,
        p_amount := v_inv.total_amount,
        p_invoice_id := v_inv.id,
        p_user_id := v_user
      );
    EXCEPTION WHEN OTHERS THEN
      -- Roll back the cancellation by raising; transaction will undo the UPDATE above.
      RAISE EXCEPTION 'release_credit failed: %', SQLERRM;
    END;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_user,
    'invoice',
    p_invoice_id,
    'invoice_canceled',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'reason', 'manual_cancel',
      'canceled_by', v_user,
      'invoice_type', v_inv.invoice_type,
      'amount', v_inv.total_amount
    )
  );

  RETURN jsonb_build_object('ok', true, 'invoice_id', p_invoice_id, 'status', 'canceled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid) TO authenticated;