-- 365 — reverse_document Gate A remediation (M2 credit unwind, M3 role gate)
--
-- OG-14 follow-up. Replaces reverse_document in place. Signature unchanged:
--   reverse_document(text, uuid, text) RETURNS uuid
-- so 364-down.sql's DROP FUNCTION IF EXISTS public.reverse_document(text, uuid, text)
-- remains valid.
--
-- ==============================================================================================
-- M3 / OG-22 — INTERIM ROLE GATE
-- ==============================================================================================
--
-- Owner answered 2026-08-19: reversal is limited to accountant and admin. Manager is excluded.
--
-- THIS IS A DELIBERATE INTERIM POSITION, not the final architecture. The owner stated that
-- access control will be built properly in a separate, dedicated phase, where permissions for
-- every module are set by role. The future access-control phase must treat this array as a
-- decision to revisit, not as a fixed constant. Recorded also in ledger-decisions.md.
--
-- ==============================================================================================
-- M2 — CREDIT UNWIND
-- ==============================================================================================
--
-- Gate A: PRE A=50000 B=50000 → UPDATE receipt.customer_id A→B → reverse → POST A=50000 B=0.
-- Journal copied immutable journal_lines (still A). Credit subtracted from the source row's
-- current customer_id (B).
--
-- Fix: after the original entry is locked, take the customer from the posted customer_credit
-- line's account_ref_id — the same source the journal unwind already uses.
--
-- Party/amount freeze on the source row is NOT in this migration. See OG-23 in
-- docs/execution/og14-remediation-PROGRESS.md: accountants still UPDATE posted receipts
-- (OCR apply of amount; approve/reject status; reverse_document metadata). Freezing is a
-- business question, not a technical one.
--
-- No session_replication_role. No DISABLE TRIGGER. 343 is not weakened.
--
-- Rollback: docs/verification/365-down.sql — restores the 364 body. Statements only.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.reverse_document(p_doc_kind text, p_source_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _kind           text := lower(btrim(coalesce(p_doc_kind, '')));
  _reason         text := NULLIF(btrim(coalesce(p_reason, '')), '');
  _source_type    text;
  _doc_type       text;
  _orig_entry_id  uuid;
  _orig_doc_kind  text;
  _orig_desc      text;
  _payer_code     text;
  _receiver_code  text;
  _orig_number    text;
  _rev_source_id  uuid := gen_random_uuid();
  _rev_number     text;
  _rev_entry_id   uuid;
  _amount         numeric;
  _customer_id    uuid;
  _person_id      uuid;
  _available      numeric;
  _new_available  numeric;
  _debit_total    numeric;
  _credit_total   numeric;
  _entity_type    text;
  _counterparty_kind text;
  _counterparty_id   uuid;
  _credit_line_n  integer;
BEGIN
  IF _reason IS NULL THEN
    RAISE EXCEPTION 'ثبت دلیل برگشت سند الزامی است' USING ERRCODE = '22023';
  END IF;

  IF _kind NOT IN ('receipt', 'payment', 'dual') THEN
    RAISE EXCEPTION 'نوع سند برای برگشت معتبر نیست' USING ERRCODE = '22023';
  END IF;

  -- OG-22 interim: accountant and admin only. Manager excluded. Revisit in the
  -- dedicated access-control phase — this is not the final permission model.
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ برگشت زدن سند را ندارید' USING ERRCODE = '42501';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
  END IF;

  _source_type := CASE _kind
                    WHEN 'receipt' THEN 'payment_receipt'
                    WHEN 'payment' THEN 'payment_voucher'
                    WHEN 'dual'    THEN 'dual_document'
                  END;
  _doc_type := _kind;
  _entity_type := _source_type;

  IF _kind = 'receipt' THEN
    PERFORM 1 FROM public.payment_receipts WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE id = p_source_id AND reversed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'این سند قبلاً برگشت خورده است' USING ERRCODE = 'P0001';
    END IF;
    SELECT amount
      INTO _amount
      FROM public.payment_receipts WHERE id = p_source_id;
    _counterparty_kind := 'customer';
  ELSIF _kind = 'payment' THEN
    PERFORM 1 FROM public.payment_vouchers WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_vouchers WHERE id = p_source_id AND reversed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'این سند قبلاً برگشت خورده است' USING ERRCODE = 'P0001';
    END IF;
    SELECT amount, COALESCE(payee_supplier_id, payee_customer_id, payee_party_id)
      INTO _amount, _counterparty_id
      FROM public.payment_vouchers WHERE id = p_source_id;
    _counterparty_kind := 'payee';
  ELSE
    PERFORM 1 FROM public.dual_documents WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.dual_documents WHERE id = p_source_id AND reversed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'این سند قبلاً برگشت خورده است' USING ERRCODE = 'P0001';
    END IF;
    SELECT amount INTO _amount FROM public.dual_documents WHERE id = p_source_id;
    _counterparty_kind := 'dual';
    _counterparty_id := p_source_id;
  END IF;

  SELECT document_number INTO _orig_number
    FROM public.document_numbers
   WHERE doc_type = _doc_type AND source_id = p_source_id;

  SELECT je.id, je.doc_kind, je.description, je.payer_accounting_code, je.receiver_accounting_code
    INTO _orig_entry_id, _orig_doc_kind, _orig_desc, _payer_code, _receiver_code
    FROM public.journal_entries je
   WHERE je.source_type = _source_type
     AND je.source_id = p_source_id
     AND je.status = 'posted'
   FOR UPDATE;

  IF _orig_entry_id IS NULL THEN
    RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.reverses_entry_id = _orig_entry_id
  ) THEN
    RAISE EXCEPTION 'این سند قبلاً برگشت خورده است' USING ERRCODE = 'P0001';
  END IF;

  IF _kind = 'receipt' THEN
    SELECT count(*) INTO _credit_line_n
      FROM public.journal_lines jl
     WHERE jl.journal_entry_id = _orig_entry_id
       AND jl.account_kind = 'customer_credit'
       AND jl.credit > 0;
    IF _credit_line_n <> 1 THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    SELECT jl.account_ref_id
      INTO _customer_id
      FROM public.journal_lines jl
     WHERE jl.journal_entry_id = _orig_entry_id
       AND jl.account_kind = 'customer_credit'
       AND jl.credit > 0;
    _counterparty_id := _customer_id;
  END IF;

  _rev_number := public.assign_document_number(_doc_type, _rev_source_id);

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code,
    reverses_entry_id
  ) VALUES (
    _orig_doc_kind, _source_type, _rev_source_id, public.tehran_today(),
    'سند برگشتی شمارهٔ ' || _rev_number || ' بابت ' || coalesce(_orig_number, 'سند اصلی'),
    'posted', _uid, _receiver_code, _payer_code,
    _orig_entry_id
  )
  RETURNING id INTO _rev_entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  )
  SELECT _rev_entry_id, jl.line_no, jl.account_kind, jl.account_ref_id,
         jl.credit, jl.debit, jl.description
    FROM public.journal_lines jl
   WHERE jl.journal_entry_id = _orig_entry_id
   ORDER BY jl.line_no;

  SELECT coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    INTO _debit_total, _credit_total
    FROM public.journal_lines jl
   WHERE jl.journal_entry_id = _rev_entry_id;

  IF _debit_total <> _credit_total OR _debit_total <> coalesce(_amount, 0) THEN
    RAISE EXCEPTION
      'سند حسابداری متوازن نیست: جمع بدهکار % و جمع بستانکار % است',
      _debit_total, _credit_total
      USING ERRCODE = 'P0001';
  END IF;

  IF _kind = 'receipt' THEN
    SELECT person_id INTO _person_id FROM public.customers WHERE id = _customer_id;
    IF _person_id IS NULL THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public._ensure_credit_balance(_customer_id);
    SELECT available_credit INTO _available
      FROM public.customer_credit_balance
     WHERE customer_person_id = _person_id
     FOR UPDATE;
    IF _available IS NULL OR _available < _amount THEN
      RAISE EXCEPTION 'اعتبار مشتری برای برگشت این فیش کافی نیست' USING ERRCODE = 'P0001';
    END IF;
    _new_available := _available - _amount;
    UPDATE public.customer_credit_balance
       SET available_credit = _new_available,
           last_transaction_at = now(),
           updated_at = now()
     WHERE customer_person_id = _person_id;
    INSERT INTO public.customer_credit_ledger
      (customer_id, customer_person_id, transaction_type, amount, balance_before, balance_after,
       reference_type, reference_id, description, created_by)
    VALUES
      (_customer_id, _person_id, 'adjustment', _amount, _available, _new_available,
       'receipt_reversal', p_source_id, 'برگشت فیش دریافت', _uid);
    DELETE FROM public.payment_receipt_links WHERE receipt_id = p_source_id;
    UPDATE public.payment_receipts
       SET reversed_at = now(),
           reversed_by = _uid,
           reversal_reason = _reason,
           reversal_journal_entry_id = _rev_entry_id,
           reversal_document_number = _rev_number
     WHERE id = p_source_id;
  ELSIF _kind = 'payment' THEN
    UPDATE public.payment_vouchers
       SET reversed_at = now(),
           reversed_by = _uid,
           reversal_reason = _reason,
           reversal_journal_entry_id = _rev_entry_id,
           reversal_document_number = _rev_number
     WHERE id = p_source_id;
  ELSE
    UPDATE public.dual_documents
       SET reversed_at = now(),
           reversed_by = _uid,
           reversal_reason = _reason,
           reversal_journal_entry_id = _rev_entry_id,
           reversal_document_number = _rev_number
     WHERE id = p_source_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid, _entity_type, p_source_id::text, 'document_reversed',
    jsonb_build_object(
      'journal_entry_id', _rev_entry_id,
      'original_journal_entry_id', _orig_entry_id,
      'document_number', _rev_number,
      'original_document_number', _orig_number,
      'amount', _amount,
      'reason', _reason,
      'counterparty_id', _counterparty_id,
      'counterparty_kind', _counterparty_kind
    )
  );

  RETURN _rev_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_document(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_document(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reverse_document(text, uuid, text) IS
  'OG-14 remediations M2/M3. Opposite posted entry; credit from the posted customer_credit line. '
  'Role gate admin+accountant only — INTERIM until the dedicated access-control phase (OG-22). '
  'Reason required. Original never edited (343).';
