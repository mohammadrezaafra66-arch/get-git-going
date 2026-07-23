-- =====================================================================
-- 147 - Accounting markers for live sales quotes
-- =====================================================================
--
-- sales_quotes is the active pre-invoice workflow. The older invoices table
-- is kept intact for compatibility, but the accounting markers must also
-- exist on sales_quotes so accountants can mark the records users actually
-- work with.
--
-- FK pattern note:
-- sales_quotes.salesperson_id and sales_quotes.canceled_by are nullable uuid
-- columns without auth.users/profile foreign keys, so the new marker *_by
-- columns follow that existing table pattern and do not invent new FKs.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_quote_accounting_marker(uuid, text, boolean);
--   DROP INDEX IF EXISTS public.idx_sales_quotes_accounting_sent_at;
--   DROP INDEX IF EXISTS public.idx_sales_quotes_accounting_registered_at;
--   ALTER TABLE public.sales_quotes
--     DROP COLUMN IF EXISTS accounting_sent_by,
--     DROP COLUMN IF EXISTS accounting_sent_at,
--     DROP COLUMN IF EXISTS accounting_registered_by,
--     DROP COLUMN IF EXISTS accounting_registered_at;
-- =====================================================================

BEGIN;

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS accounting_registered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS accounting_registered_by uuid NULL,
  ADD COLUMN IF NOT EXISTS accounting_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS accounting_sent_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_accounting_registered_at
  ON public.sales_quotes (accounting_registered_at);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_accounting_sent_at
  ON public.sales_quotes (accounting_sent_at);

CREATE OR REPLACE FUNCTION public.set_quote_accounting_marker(
  p_quote_id uuid,
  p_marker text,
  p_checked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.sales_quotes%ROWTYPE;
  v_uid uuid := auth.uid();
  v_action text;
BEGIN
  IF p_marker IS NULL OR p_marker NOT IN ('registered', 'sent') THEN
    RAISE EXCEPTION 'INVALID_MARKER';
  END IF;

  SELECT * INTO v_quote
    FROM public.sales_quotes
   WHERE id = p_quote_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTE_NOT_FOUND';
  END IF;

  IF p_checked THEN
    IF NOT public.has_any_role(
      v_uid, ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN_MARKER_CHECK';
    END IF;

    IF COALESCE(v_quote.status::text, '') IN ('canceled', 'cancelled') THEN
      RAISE EXCEPTION 'CANCELED_QUOTE_MARKER_BLOCKED';
    END IF;
  ELSE
    IF NOT public.has_any_role(
      v_uid, ARRAY['admin'::app_role, 'accountant'::app_role]
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN_MARKER_UNCHECK';
    END IF;
  END IF;

  IF p_marker = 'registered' THEN
    UPDATE public.sales_quotes
       SET accounting_registered_at = CASE WHEN p_checked THEN now() ELSE NULL END,
           accounting_registered_by = CASE WHEN p_checked THEN v_uid ELSE NULL END,
           updated_at = now()
     WHERE id = p_quote_id;

    v_action := CASE WHEN p_checked
                     THEN 'quote_accounting_registered_checked'
                     ELSE 'quote_accounting_registered_unchecked' END;
  ELSE
    UPDATE public.sales_quotes
       SET accounting_sent_at = CASE WHEN p_checked THEN now() ELSE NULL END,
           accounting_sent_by = CASE WHEN p_checked THEN v_uid ELSE NULL END,
           updated_at = now()
     WHERE id = p_quote_id;

    v_action := CASE WHEN p_checked
                     THEN 'quote_accounting_sent_checked'
                     ELSE 'quote_accounting_sent_unchecked' END;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_uid,
    'sales_quote',
    p_quote_id::text,
    v_action,
    jsonb_build_object('marker', p_marker, 'checked', p_checked)
  );

  RETURN jsonb_build_object('ok', true, 'marker', p_marker, 'checked', p_checked);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_quote_accounting_marker(uuid, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_quote_accounting_marker(uuid, text, boolean)
  TO authenticated;

COMMIT;
