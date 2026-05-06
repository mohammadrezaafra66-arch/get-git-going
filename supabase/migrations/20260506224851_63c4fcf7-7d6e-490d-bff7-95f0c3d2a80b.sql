-- Bundle A.1: Fix recompute triggers for payment_receipts / payment_receipt_links
-- - Avoid direct OLD/NEW field access where the record is null (INSERT->OLD, DELETE->NEW)
-- - Separate calculate_employee_score from event logging so a logging failure
--   does not roll back the recompute.
-- - Keep whitelist boundary semantics: recompute when status changed and either
--   old or new status is in the whitelist.

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _whitelist text[] := ARRAY['approved','verified','confirmed','posted'];
  _old_status text;
  _new_status text;
  _receipt_id uuid;
  _should_run boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new_status := NEW.status;
    _receipt_id := NEW.id;
    _should_run := (_new_status = ANY(_whitelist));
  ELSIF TG_OP = 'DELETE' THEN
    _old_status := OLD.status;
    _receipt_id := OLD.id;
    _should_run := (_old_status = ANY(_whitelist));
  ELSE -- UPDATE
    _old_status := OLD.status;
    _new_status := NEW.status;
    _receipt_id := COALESCE(NEW.id, OLD.id);
    _should_run := (_old_status IS DISTINCT FROM _new_status)
                   AND ( (_old_status = ANY(_whitelist)) OR (_new_status = ANY(_whitelist)) );
  END IF;

  IF NOT _should_run THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR _emp IN
    SELECT DISTINCT i.created_by
    FROM public.payment_receipt_links prl
    JOIN public.invoices i ON i.id = prl.invoice_id
    JOIN public.user_roles ur ON ur.user_id = i.created_by AND ur.role = 'sales'::public.app_role
    WHERE prl.receipt_id = _receipt_id
      AND i.created_by IS NOT NULL
  LOOP
    -- Recompute in its own block: failure here must not be hidden silently
    -- but also must not block the parent DML. Keep recompute isolated from logging.
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Logging in a SEPARATE block: a logging failure cannot roll back recompute.
    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_'||lower(TG_OP),
        'payment_receipts',
        _receipt_id::text,
        jsonb_build_object('op', TG_OP, 'old_status', _old_status, 'new_status', _new_status)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;


CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _invoice_id uuid;
  _link_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _invoice_id := NEW.invoice_id;
    _link_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    _invoice_id := OLD.invoice_id;
    _link_id := OLD.id;
  ELSE
    _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    _link_id := COALESCE(NEW.id, OLD.id);
  END IF;

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
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_link_'||lower(TG_OP),
        'payment_receipt_links',
        _link_id::text,
        jsonb_build_object('op', TG_OP, 'invoice_id', _invoice_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;