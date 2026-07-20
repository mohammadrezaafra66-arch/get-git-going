-- =====================================================================
-- Migration: fix_update_sales_quote_status_text_cast  (Phase B bug fix)
--
-- BUG: The «ارسال» (and پذیرش/رد/لغو) buttons on /sales/quotes failed with a
--   PostgREST-surfaced error resembling "type:public text". Root cause: the
--   LIVE `update_sales_quote_status` function body had drifted from its source
--   migration (20260616120931) — the authorization check cast the role array
--   to the NON-EXISTENT type `public.text[]`:
--       has_any_role(_uid, ARRAY['admin','manager']::public.text[])
--   `text` is a built-in (pg_catalog) type, so `public.text[]` does not exist
--   and the function raised `type "public.text[]" does not exist` for every
--   authenticated caller (service-role callers hit the auth.uid() NULL check
--   first, which masked the bug in API-key tests).
--
-- FIX: restore the correct definition (cast to `public.app_role[]`, matching
--   the source migration and the rest of the codebase). Signature is unchanged
--   → no types.ts change needed.
--
-- Idempotent: CREATE OR REPLACE. Connect as supabase_admin on DB `afrakala`.
-- After applying: docker restart afrakala-lan-rest
-- =====================================================================

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
