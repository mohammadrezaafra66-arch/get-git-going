CREATE OR REPLACE FUNCTION public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, status sales_quote_status, cancel_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quotes%ROWTYPE;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیش‌فاکتور یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
    NULL;
  ELSIF public.has_role(_uid, 'accountant'::public.app_role)
        AND p_next = 'rejected'::public.sales_quote_status THEN
    NULL;
  ELSIF public.has_role(_uid, 'sales'::public.app_role)
        AND _row.salesperson_id = _uid
        AND p_next IN ('draft'::public.sales_quote_status,
                       'sent'::public.sales_quote_status,
                       'rejected'::public.sales_quote_status,
                       'canceled'::public.sales_quote_status) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'دسترسی لازم برای این عملیات را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'rejected'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای رد پیش‌فاکتور، نوشتن دلیل رد الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = _reason
     WHERE sq.id = p_quote_id;
  ELSIF p_next = 'rejected'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           reject_reason = _reason
     WHERE sq.id = p_quote_id;

    IF _row.salesperson_id IS NOT NULL THEN
      INSERT INTO public.notification_queue(
        user_id,
        title,
        body,
        type,
        reference_type,
        reference_id
      )
      VALUES (
        _row.salesperson_id,
        'پیش‌فاکتور رد شد',
        concat_ws(E'\n',
          'پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text) || ' توسط واحد حسابداری/مدیریت رد شد.',
          'مشتری: ' || COALESCE(NULLIF(_row.customer_name, ''), '—'),
          'دلیل رد: ' || _reason
        ),
        'quote_rejected',
        'sales_quote',
        p_quote_id
      );
    END IF;
  ELSE
    UPDATE public.sales_quotes AS sq
       SET status = p_next
     WHERE sq.id = p_quote_id;
  END IF;

  RETURN QUERY
  SELECT sq.id, sq.status, sq.cancel_reason
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;
END;
$function$

