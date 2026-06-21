-- SF-1.c3: SECURITY DEFINER RPC for sales quote status transitions
-- Mirrors RLS guarantees of sales_quotes_update_privileged and
-- sales_quotes_update_sales_own. Transition validity and audit are
-- handled by existing triggers (trg_sales_quotes_validate_status,
-- trg_audit_sales_quotes) and are intentionally NOT duplicated here.

CREATE OR REPLACE FUNCTION public.update_sales_quote_status(
  p_quote_id uuid,
  p_next     public.sales_quote_status,
  p_reason   text DEFAULT NULL
) RETURNS TABLE (
  id            uuid,
  status        public.sales_quote_status,
  cancel_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quotes%ROWTYPE;
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

  -- Authorization mirrors existing RLS policies on public.sales_quotes
  IF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
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

  IF p_next = 'canceled'::public.sales_quote_status
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
  END IF;

  -- Transition validity + audit are enforced by existing triggers.
  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = p_reason
     WHERE sq.id = p_quote_id;
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
$$;

REVOKE ALL ON FUNCTION public.update_sales_quote_status(uuid, public.sales_quote_status, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_sales_quote_status(uuid, public.sales_quote_status, text)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.update_sales_quote_status(uuid, public.sales_quote_status, text)
  TO authenticated, service_role;