CREATE OR REPLACE FUNCTION public.enforce_payment_receipt_link_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_amount   numeric;
  v_allocated_other  numeric;
  v_doc_total        numeric;
  v_doc_paid_other   numeric;
  v_doc_number       text;
BEGIN
  -- Lock the receipt FIRST (always this order) so concurrent inserts for the
  -- same receipt serialise here instead of both reading a stale total.
  SELECT amount
    INTO v_receipt_amount
    FROM public.payment_receipts
   WHERE id = NEW.receipt_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش پرداخت مورد نظر یافت نشد.'
      USING ERRCODE = '23503';
  END IF;

  -- Rule 1: sum of this receipt's allocations may not exceed the receipt amount.
  -- NEW.id is already populated here (column defaults are applied before BEFORE
  -- triggers run), so the same predicate works for INSERT and UPDATE.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_allocated_other
    FROM public.payment_receipt_links
   WHERE receipt_id = NEW.receipt_id
     AND id <> NEW.id;

  IF v_allocated_other + NEW.amount > v_receipt_amount THEN
    RAISE EXCEPTION
      'مجموع تخصیص‌های این فیش برابر % تومان می‌شود که از مبلغ خود فیش (% تومان) بیشتر است.',
      to_char(v_allocated_other + NEW.amount, 'FM999,999,999,999'),
      to_char(v_receipt_amount, 'FM999,999,999,999')
      USING ERRCODE = '23514';
  END IF;

  -- Rule 2: the allocation may not exceed the target document's remaining
  -- balance. Remaining counts APPROVED receipts only -- the same rule the form
  -- shows the accountant.
  IF NEW.quote_id IS NOT NULL THEN
    SELECT final_amount, quote_number
      INTO v_doc_total, v_doc_number
      FROM public.sales_quotes
     WHERE id = NEW.quote_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'پیش‌فاکتور مورد نظر یافت نشد.'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0)
      INTO v_doc_paid_other
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.quote_id = NEW.quote_id
       AND l.id <> NEW.id
       AND r.status = 'approved';

    IF v_doc_paid_other + NEW.amount > v_doc_total THEN
      RAISE EXCEPTION
        'مبلغ تخصیص‌یافته (% تومان) از مانده پیش‌فاکتور % بیشتر است. مانده قابل تخصیص: % تومان.',
        to_char(NEW.amount, 'FM999,999,999,999'),
        v_doc_number,
        to_char(GREATEST(v_doc_total - v_doc_paid_other, 0), 'FM999,999,999,999')
        USING ERRCODE = '23514';
    END IF;

  ELSIF NEW.invoice_id IS NOT NULL THEN
    -- Invoices are a dead parallel design (0 rows) but the column still exists
    -- and the XOR CHECK still permits it, so the guard covers it symmetrically.
    -- Remaining mirrors vw_customer_receivables: total - deposit - approved.
    SELECT total_amount - COALESCE(deposit_amount, 0), number
      INTO v_doc_total, v_doc_number
      FROM public.invoices
     WHERE id = NEW.invoice_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'فاکتور مورد نظر یافت نشد.'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0)
      INTO v_doc_paid_other
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.invoice_id = NEW.invoice_id
       AND l.id <> NEW.id
       AND r.status = 'approved';

    IF v_doc_paid_other + NEW.amount > v_doc_total THEN
      RAISE EXCEPTION
        'مبلغ تخصیص‌یافته (% تومان) از مانده فاکتور % بیشتر است. مانده قابل تخصیص: % تومان.',
        to_char(NEW.amount, 'FM999,999,999,999'),
        v_doc_number,
        to_char(GREATEST(v_doc_total - v_doc_paid_other, 0), 'FM999,999,999,999')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.enforce_receipt_approval_allocation_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r                RECORD;
  v_doc_total      numeric;
  v_doc_number     text;
  v_paid_other     numeric;
BEGIN
  -- Iterate in a canonical id order so concurrent approvals take the document
  -- locks in the same sequence.
  FOR r IN
    SELECT l.quote_id, l.invoice_id, l.amount
      FROM public.payment_receipt_links l
     WHERE l.receipt_id = NEW.id
     ORDER BY l.quote_id NULLS LAST, l.invoice_id NULLS LAST
  LOOP
    IF r.quote_id IS NOT NULL THEN
      SELECT final_amount, quote_number
        INTO v_doc_total, v_doc_number
        FROM public.sales_quotes
       WHERE id = r.quote_id
         FOR UPDATE;

      SELECT COALESCE(SUM(l.amount), 0)
        INTO v_paid_other
        FROM public.payment_receipt_links l
        JOIN public.payment_receipts pr ON pr.id = l.receipt_id
       WHERE l.quote_id = r.quote_id
         AND l.receipt_id <> NEW.id
         AND pr.status = 'approved';

      IF v_paid_other + r.amount > v_doc_total THEN
        RAISE EXCEPTION
          'با تأیید این فیش، مجموع پرداخت‌های تأییدشده پیش‌فاکتور % برابر % تومان می‌شود که از مبلغ کل آن (% تومان) بیشتر است.',
          v_doc_number,
          to_char(v_paid_other + r.amount, 'FM999,999,999,999'),
          to_char(v_doc_total, 'FM999,999,999,999')
          USING ERRCODE = '23514';
      END IF;

    ELSIF r.invoice_id IS NOT NULL THEN
      SELECT total_amount - COALESCE(deposit_amount, 0), number
        INTO v_doc_total, v_doc_number
        FROM public.invoices
       WHERE id = r.invoice_id
         FOR UPDATE;

      SELECT COALESCE(SUM(l.amount), 0)
        INTO v_paid_other
        FROM public.payment_receipt_links l
        JOIN public.payment_receipts pr ON pr.id = l.receipt_id
       WHERE l.invoice_id = r.invoice_id
         AND l.receipt_id <> NEW.id
         AND pr.status = 'approved';

      IF v_paid_other + r.amount > v_doc_total THEN
        RAISE EXCEPTION
          'با تأیید این فیش، مجموع پرداخت‌های تأییدشده فاکتور % برابر % تومان می‌شود که از مانده آن (% تومان) بیشتر است.',
          v_doc_number,
          to_char(v_paid_other + r.amount, 'FM999,999,999,999'),
          to_char(v_doc_total, 'FM999,999,999,999')
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$

;

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
    WHERE prl.receipt_id = _receipt_id
      AND i.created_by IS NOT NULL
      AND public.has_role(i.created_by, 'sales'::public.app_role)
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

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
$function$

;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _invoice_id uuid;
  _quote_id uuid;
  _link_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _invoice_id := NEW.invoice_id;
    _quote_id := NEW.quote_id;
    _link_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    _invoice_id := OLD.invoice_id;
    _quote_id := OLD.quote_id;
    _link_id := OLD.id;
  ELSE
    _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    _quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
    _link_id := COALESCE(NEW.id, OLD.id);
  END IF;

  -- NOTE: resolution uses public.has_role(uuid, app_role) rather than a direct
  -- JOIN on user_roles.role. user_roles.role is TEXT, so the original invoice
  -- branch's `ur.role = 'sales'::app_role` raised `text = app_role` at runtime —
  -- a latent bug that never fired only because no receipt link ever existed.
  -- has_role is the codebase's proven role check and handles NULL gracefully.
  IF _invoice_id IS NOT NULL THEN
    -- Invoice-linked: salesperson is the invoice creator (intent preserved).
    SELECT i.created_by INTO _emp
    FROM public.invoices i
    WHERE i.id = _invoice_id
      AND public.has_role(i.created_by, 'sales'::public.app_role);
  ELSIF _quote_id IS NOT NULL THEN
    -- Quote-linked: salesperson is the quote's salesperson.
    SELECT q.salesperson_id INTO _emp
    FROM public.sales_quotes q
    WHERE q.id = _quote_id
      AND public.has_role(q.salesperson_id, 'sales'::public.app_role);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

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
        jsonb_build_object('op', TG_OP, 'invoice_id', _invoice_id, 'quote_id', _quote_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$

;

