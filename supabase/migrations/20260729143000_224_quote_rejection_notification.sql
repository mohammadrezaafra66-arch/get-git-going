SET client_encoding='UTF8';

-- ============================================================================
-- 224 — Item 211: notify the salesperson when accounting rejects a quote.
-- ============================================================================
-- Scope:
--   * Keep using the existing notification_queue table; no parallel notification
--     system is introduced.
--   * Accountant users may reject a sent quote, but this migration does NOT
--     grant them acceptance/finalization rights.
--   * The rejection reason is mandatory and is written to sales_quotes.reject_reason.
--   * A quote_rejected notification is inserted for the quote salesperson.
--
-- Live DB note:
--   Before this migration was authored, the LAN DB was checked with
--   pg_proc/pg_get_functiondef. No live update_sales_quote_status signature was
--   visible in afrakala-lan-db, which means this migration must be applied after
--   the existing quote-status migrations in this repository. It is written from
--   the latest repository definition in 20260728201000_221_quote_reject_reason.sql
--   with only the accounting rejection + notification additions below.
--
-- Rollback:
--   Re-apply 20260728201000_221_quote_reject_reason.sql's function body and
--   replace notification_queue_type_check without quote_rejected if desired.
--   Existing notification rows are ordinary audit-like user notifications; keep
--   them unless the business explicitly asks to purge them.
-- ============================================================================

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS reject_reason text;

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'stock_alert'::text,
    'system'::text,
    'task'::text,
    'payment'::text,
    'sale_price_change'::text,
    'birthday'::text,
    'quote_rejected'::text
  ]));

CREATE OR REPLACE FUNCTION public.update_sales_quote_status(
  p_quote_id uuid,
  p_next sales_quote_status,
  p_reason text DEFAULT NULL::text
)
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
        p_quote_id::text
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
$function$;

GRANT EXECUTE ON FUNCTION public.update_sales_quote_status(uuid, public.sales_quote_status, text)
  TO authenticated;
