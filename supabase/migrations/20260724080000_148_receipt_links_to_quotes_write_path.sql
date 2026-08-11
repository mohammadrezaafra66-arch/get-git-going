-- =====================================================================
-- 148 - Allow payment_receipt_links to target sales_quotes (write path)
-- =====================================================================
--
-- Atomic: schema + the score-recompute trigger land together. A schema that
-- permits quote links while the recompute trigger ignores them would let a
-- salesperson's collected score silently never update.
--
-- payment_receipt_links currently targets invoices only (invoice_id NOT NULL).
-- This business issues no invoices, so quote links are the only links it will
-- ever have. Both tables are currently EMPTY (0 receipts, 0 links).
--
-- post_receipt_accounting is intentionally NOT changed here: its journal entry
-- and increase_credit() are RECEIPT-based (customer_id + amount), not
-- invoice-based, so they already post correctly for a quote-linked receipt. Its
-- only invoice-specific code is the invoice-status reconciliation loop, which
-- correctly no-ops for a NULL invoice_id. Adding quote logic there would
-- DOUBLE-POST the journal entry. Verified empirically in Phase 2A.4.
--
-- ROLLBACK:
--   ALTER TABLE public.payment_receipt_links DROP CONSTRAINT payment_receipt_links_receipt_quote_unique;
--   ALTER TABLE public.payment_receipt_links DROP CONSTRAINT payment_receipt_links_one_target;
--   ALTER TABLE public.payment_receipt_links DROP COLUMN quote_id;  -- drops its index + FK
--   ALTER TABLE public.payment_receipt_links ALTER COLUMN invoice_id SET NOT NULL;
--   (restore recompute_employee_scores_on_receipt_link from git history)
-- =====================================================================

BEGIN;

-- ---- 2A.1 Schema ----
ALTER TABLE public.payment_receipt_links
  ADD COLUMN IF NOT EXISTS quote_id uuid NULL
    REFERENCES public.sales_quotes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payment_receipt_links_quote_id
  ON public.payment_receipt_links(quote_id);

ALTER TABLE public.payment_receipt_links
  ALTER COLUMN invoice_id DROP NOT NULL;

-- Exactly one target. XOR: true only when precisely one of the two is set.
-- This is the guard against a row being counted on both sides.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_receipt_links_one_target') THEN
    ALTER TABLE public.payment_receipt_links
      ADD CONSTRAINT payment_receipt_links_one_target
      CHECK ((invoice_id IS NOT NULL) <> (quote_id IS NOT NULL));
  END IF;
END $do$;

-- Mirror the invoice-side UNIQUE(receipt_id, invoice_id) for quotes. NULLs are
-- distinct, so this only constrains quote-linked rows and never collides with
-- the invoice unique on invoice-linked rows.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_receipt_links_receipt_quote_unique') THEN
    ALTER TABLE public.payment_receipt_links
      ADD CONSTRAINT payment_receipt_links_receipt_quote_unique
      UNIQUE (receipt_id, quote_id);
  END IF;
END $do$;

-- ---- 2A.3 Recompute trigger: resolve salesperson via quote when quote-linked ----
-- Invoice branch preserved byte-for-byte; a quote branch is added; the event
-- payload now records both ids.
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
$function$;

COMMIT;
