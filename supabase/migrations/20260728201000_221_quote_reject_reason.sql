-- 221 — Item 195: record why a pre-invoice was rejected.
--
-- Rejecting was already possible, but the reason was thrown away twice over:
-- the server function only forwarded p_reason for 'canceled', and there was no
-- column to put a rejection reason in even if it had arrived. `cancel_reason`
-- is deliberately NOT reused -- a cancellation and a rejection are different
-- events and collapsing them would make both unreadable afterwards.
--
-- The reason is written in the same statement as the status change: the
-- validate-status trigger treats 'rejected' as final, so a follow-up UPDATE
-- would be refused.
SET client_encoding='UTF8';

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS reject_reason text;

COMMENT ON COLUMN public.sales_quotes.reject_reason IS
  'دلیل رد پیش‌فاکتور (نیازمندی ۱۹۵). جدا از cancel_reason که برای لغو است.';

-- Body below is the live definition with two additions: the reason is now
-- mandatory for 'rejected' as well as 'canceled', and it is stored in the
-- matching column. Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.update_sales_quote_status(
  p_quote_id uuid,
  p_next sales_quote_status,
  p_reason text DEFAULT NULL::text
)
-- The return signature is deliberately unchanged. Adding a column would change
-- the function's return type, which PostgreSQL only allows via DROP + CREATE,
-- and no caller reads the result beyond awaiting it.
 RETURNS TABLE(id uuid, status sales_quote_status, cancel_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Item 195 — the same requirement for a rejection.
  IF p_next = 'rejected'::public.sales_quote_status
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'برای رد پیش‌فاکتور، نوشتن دلیل رد الزامی است.' USING ERRCODE = '22023';
  END IF;

  -- Transition validity + audit are enforced by existing triggers.
  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = p_reason
     WHERE sq.id = p_quote_id;
  ELSIF p_next = 'rejected'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           reject_reason = btrim(p_reason)
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
$function$;
