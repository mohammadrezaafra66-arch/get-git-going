SET client_encoding='UTF8';

-- ============================================================================
-- 489 - a purchase becomes a payable: post an accrual when a purchase is inserted.
-- ============================================================================
--
-- D-27. Debit «خرید» (5000), credit «بدهی تأمین‌کنندگان» (2100, control) against
-- the supplier subledger. Amount = purchases.total_amount.
--
-- THE HOOK
-- ---------------------------------------------------------------------------
-- The research located exactly one insertion point: create_purchase line 326 is
-- the ONLY `INSERT INTO public.purchases` in the database, and its sole client
-- caller is src/hooks/purchase/useCreatePurchase.ts:134, whose own header claims
-- exclusivity ("This hook is deliberately the ONLY place that calls it, so a
-- second implementation cannot appear by accident").
--
-- A row trigger is used rather than an edit inside create_purchase anyway, for
-- the same reason as L-3: a trigger cannot be bypassed by a future second writer,
-- and create_purchase is a 476-line function that rule 15 says not to restructure.
-- purchases already carries purchases_audit_insert AFTER INSERT FOR EACH ROW, so
-- this is the established shape on this table, not a new mechanism.
--
-- THE SUPPLIER SUBLEDGER IS OFTEN ABSENT -- MEASURED, NOT ASSUMED
-- ---------------------------------------------------------------------------
-- The groundwork research left this open as [?] #1 ("this must be counted before
-- any design"). Counted on the live database today:
--
--   SELECT count(*), count(supplier_id), count(supplier_person_id) FROM purchases;
--   --> 317 total | 16 with supplier_id | 16 with supplier_person_id
--
-- So 301 of 317 purchases -- 95% -- have no supplier at all, and create_purchase's
-- p_supplier_id is DEFAULT NULL, so future ones may not either. The payable line
-- therefore carries account_ref_id = supplier_id WHEN THERE IS ONE and NULL
-- otherwise. That is safe rather than a fudge: validate_journal_line_ref returns
-- NEW immediately when account_ref_id IS NULL (lines 11-13 of its live body), so
-- a payable with no subledger posts against the 2100 control account alone and is
-- still balanced, still auditable, and still excluded from the Asan export.
--
-- IDEMPOTENT via the explicit guard plus journal_entries_source_unique.
-- CUTOFF: D-28, this migration's own timestamp, no backfill of the 317 rows.
-- ASAN: sale_accrual and purchase_accrual were BOTH excluded from
-- asan_list_journal_export in migration 488, so nothing further is needed here.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_purchase_accrual(p_purchase_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cutoff       constant timestamptz := '2026-09-06 19:15:00+03:30';
  _purchase     record;
  _entry_id     uuid;
  _amount       numeric;
  _acct_buy     uuid;
  _acct_payable uuid;
  _supplier_name text;
  _debit_total  numeric;
  _credit_total numeric;
BEGIN
  SELECT p.id, p.supplier_id, p.total_amount, p.purchase_date, p.created_at
    INTO _purchase
    FROM public.purchases p
   WHERE p.id = p_purchase_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- D-28. No backfill: the 317 purchases that predate this migration stay out.
  IF COALESCE(_purchase.created_at, now()) < _cutoff THEN
    RETURN NULL;
  END IF;

  -- Idempotency, layer 1. Layer 2 is journal_entries_source_unique.
  SELECT je.id INTO _entry_id
    FROM public.journal_entries je
   WHERE je.source_type = 'purchase_accrual'
     AND je.source_id = p_purchase_id;
  IF _entry_id IS NOT NULL THEN
    RETURN _entry_id;
  END IF;

  _amount := COALESCE(_purchase.total_amount, 0);
  IF _amount <= 0 THEN
    RETURN NULL;   -- nothing to accrue; not an error
  END IF;

  SELECT id INTO _acct_buy     FROM public.chart_of_accounts WHERE code = '5000';
  SELECT id INTO _acct_payable FROM public.chart_of_accounts WHERE code = '2100';
  IF _acct_buy IS NULL OR _acct_payable IS NULL THEN
    RAISE EXCEPTION 'کدینگ حساب برای ثبت سند تعهدی خرید کامل نیست (۵۰۰۰ یا ۲۱۰۰ یافت نشد).'
      USING ERRCODE = 'P0001';
  END IF;

  IF _purchase.supplier_id IS NOT NULL THEN
    SELECT s.name INTO _supplier_name FROM public.suppliers s WHERE s.id = _purchase.supplier_id;
  END IF;

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description, status, posted_by
  ) VALUES (
    'purchase_accrual', 'purchase_accrual', p_purchase_id,
    COALESCE(_purchase.purchase_date, public.tehran_today()),
    'سند تعهدی خرید' ||
      COALESCE(' از تأمین‌کننده «' || _supplier_name || '»', ' (تأمین‌کننده نامشخص)'),
    'posted', auth.uid()
  )
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, account_id, debit, credit, description
  ) VALUES
    (_entry_id, 1, 'other',            NULL,                  _acct_buy,     _amount, 0,
     'خرید کالا'),
    (_entry_id, 2, 'supplier_payable', _purchase.supplier_id, _acct_payable, 0,       _amount,
     'بدهی به تأمین‌کننده' || COALESCE(' «' || _supplier_name || '»', ' (نامشخص)'));

  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO _debit_total, _credit_total
    FROM public.journal_lines WHERE journal_entry_id = _entry_id;

  IF _debit_total <> _credit_total OR _debit_total <> _amount THEN
    RAISE EXCEPTION 'سند تعهدی خرید تراز نیست: بدهکار % و بستانکار %', _debit_total, _credit_total
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'purchases', p_purchase_id::text, 'purchase_accrual_posted',
    jsonb_build_object(
      'journal_entry_id', _entry_id,
      'supplier_id',      _purchase.supplier_id,
      'amount',           _amount));

  RETURN _entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_purchase_accrual(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_purchase_accrual(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.post_purchase_accrual(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.tg_purchase_post_accrual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.post_purchase_accrual(NEW.id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_post_accrual ON public.purchases;
CREATE TRIGGER trg_purchase_post_accrual
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_post_accrual();
