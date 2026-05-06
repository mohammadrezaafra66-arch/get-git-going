-- Bundle A · Phase 21.6E: recompute employee score on payment receipt/link changes
-- mirrors recompute_employee_scores_on_invoice safety: SECURITY DEFINER, search_path=public,
-- per-employee guarded with EXCEPTION WHEN OTHERS, only sales role recomputed.

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp uuid;
  _whitelist text[] := ARRAY['approved','verified','confirmed','posted'];
  _changed boolean := true;
  _receipt_id uuid;
BEGIN
  -- Only act when status crossed the whitelist boundary (avoid storms on PUT of unrelated fields)
  IF TG_OP = 'UPDATE' THEN
    _changed := (OLD.status IS DISTINCT FROM NEW.status)
                AND ( (OLD.status = ANY(_whitelist)) <> (NEW.status = ANY(_whitelist)) );
  END IF;
  IF NOT _changed THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _receipt_id := COALESCE(NEW.id, OLD.id);

  FOR _emp IN
    SELECT DISTINCT i.created_by
    FROM public.payment_receipt_links prl
    JOIN public.invoices i ON i.id = prl.invoice_id
    JOIN public.user_roles ur ON ur.user_id = i.created_by AND ur.role = 'sales'::public.app_role
    WHERE prl.receipt_id = _receipt_id
      AND i.created_by IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'receipt_'||lower(TG_OP), 'payment_receipts',
              _receipt_id::text,
              jsonb_build_object('op', TG_OP, 'old_status', OLD.status, 'new_status', NEW.status));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp uuid;
  _invoice_id uuid;
BEGIN
  _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF _invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT i.created_by INTO _emp
  FROM public.invoices i
  JOIN public.user_roles ur ON ur.user_id = i.created_by AND ur.role = 'sales'::public.app_role
  WHERE i.id = _invoice_id;

  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'receipt_link_'||lower(TG_OP), 'payment_receipt_links',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP, 'invoice_id', _invoice_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_receipts_recompute_employee_score ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_recompute_employee_score
AFTER INSERT OR UPDATE OF status OR DELETE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.recompute_employee_scores_on_receipt();

DROP TRIGGER IF EXISTS trg_payment_receipt_links_recompute_employee_score ON public.payment_receipt_links;
CREATE TRIGGER trg_payment_receipt_links_recompute_employee_score
AFTER INSERT OR UPDATE OF amount, invoice_id, receipt_id OR DELETE ON public.payment_receipt_links
FOR EACH ROW EXECUTE FUNCTION public.recompute_employee_scores_on_receipt_link();

COMMENT ON FUNCTION public.recompute_employee_scores_on_receipt() IS
'Bundle A / Phase 21.6E: recompute salesperson score when receipt status crosses whitelist (approved/verified/confirmed/posted). Only sales role. Errors swallowed to avoid blocking parent op.';
COMMENT ON FUNCTION public.recompute_employee_scores_on_receipt_link() IS
'Bundle A / Phase 21.6E: recompute salesperson score when receipt-invoice link changes. Only sales role.';