SET client_encoding='UTF8';

-- ============================================================================
-- 491 - the cancel paths: an accepted quote (L-5) and a purchase (L-6).
-- ============================================================================
--
-- Three existing functions are replaced and one new one is added. Every replaced
-- body below is the LIVE pg_get_functiondef output read immediately before this
-- migration (CLAUDE.md rule 2), reproduced byte for byte with only the named
-- hunks changed. Each hunk was applied by a script that asserts its anchor text
-- occurs exactly once, so a silent partial match was not possible.
--
-- WHAT CANCEL UNDOES -- OWNER DECISION, CONTRACTS.md section 2 Q-2b
-- ---------------------------------------------------------------------------
-- EXACTLY TWO THINGS:
--   (a) reverse the sale_accrual journal entry L-3 posted;
--   (b) release the credit hold hold_credit_for_quote placed at acceptance.
-- It does NOT touch the warehouse tasks row that acceptance also inserts on the
-- 'store' queue (hazard H·b) -- a human closes that. Leaving the hold in place
-- would strand the customer's ceiling forever, which is why (b) is in scope and
-- the tasks row is not.
--
-- 1. sales_quotes_validate_status
--    Gains ONE permitted move out of a final state: accepted ->
--    cancelled_after_accept, gated to admin/accountant, reason mandatory. The new
--    value joins the terminal list so a quote cannot be un-cancelled or cancelled
--    twice. 'canceled' remains unreachable from 'accepted'.
--
-- 2. reverse_document
--    Line 38 was `IF _kind NOT IN ('receipt','payment','dual') THEN RAISE`. The two
--    accrual kinds join that list. Its permission model (admin/accountant), its
--    locking, its double-reversal guard, its balance proof and its audit row are
--    NOT changed. Three things the new kinds genuinely require were added:
--      * source_type / entity_type mapping for the accrual kinds;
--      * amount + counterparty read from sales_quotes / purchases;
--      * document numbering SKIPPED -- document_numbers_doc_type_check admits only
--        receipt/payment/dual and assign_document_number refuses anything else, and
--        widening a numbering series 197 rows already depend on is far more than
--        these kinds require. Accrual reversals carry no document number.
--    One further change applies to ALL kinds: the reversal line copy now carries
--    account_id across (added in 487), because a reversal must sit on the same
--    chart accounts as the entry it reverses or the two would not net to zero.
--
-- 3. update_sales_quote_status
--    The role gate now tests cancelled_after_accept FIRST and separately, because
--    the owner decision is admin/accountant ONLY and the pre-existing admin/manager
--    arm would otherwise admit a manager. Then the cancel branch does (a) and (b).
--
-- 4. cancel_purchase -- NEW, L-6.
-- ============================================================================

-- ---------------- 1. sales_quotes_validate_status ----------------
CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    -- ===================== wave 6 / L-5 =====================
    -- The ONE permitted move out of a final state, and it is deliberately narrow:
    -- accepted -> cancelled_after_accept, nothing else, by admin or accountant only
    -- (owner decision, CONTRACTS.md section 2 Q-3). 'canceled' is NOT reachable from
    -- 'accepted' and never becomes so: those 9 rows are pre-acceptance cancellations
    -- and conflating the two histories is exactly what the new value exists to avoid.
    IF old.status = 'accepted' AND new.status = 'cancelled_after_accept' THEN
      IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
        RAISE EXCEPTION 'اجازهٔ ابطال پیش‌فاکتور پذیرفته‌شده را ندارید'
          USING ERRCODE = '42501';
      END IF;
      IF NULLIF(btrim(COALESCE(new.cancel_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'برای ابطال پیش‌فاکتور پذیرفته‌شده، ثبت دلیل الزامی است'
          USING ERRCODE = '22023';
      END IF;
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
      RETURN new;
    END IF;
    -- ========================================================
    -- Final states cannot be changed. cancelled_after_accept joins the list: it is
    -- terminal too, so a quote cannot be un-cancelled or cancelled twice.
    IF old.status IN ('accepted','rejected','canceled','cancelled_after_accept') THEN
      RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
        USING ERRCODE = '22023';
    END IF;
    -- Allowed transitions
    IF NOT (
      (old.status = 'draft' AND new.status IN ('sent','canceled'))
      OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
    ) THEN
      RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
        USING ERRCODE = '22023';
    END IF;

    IF new.status = 'canceled' THEN
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    END IF;

    IF new.status = 'accepted' THEN
      new.accepted_at := coalesce(new.accepted_at, now());
    END IF;
  END IF;

  -- A quote can also be born accepted: this trigger fires BEFORE INSERT as well, because a plain
  -- INSERT with status='accepted' does not pass through the transition logic above and would
  -- otherwise leave accepted_at NULL forever -- see the header for why "forever" is literal.
  IF tg_op = 'INSERT' AND new.status = 'accepted' THEN
    new.accepted_at := coalesce(new.accepted_at, now());
  END IF;

  RETURN new;
END;
$function$
;

-- ---------------- 2. reverse_document ----------------
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
  _is_accrual     boolean := false;
BEGIN
  IF _reason IS NULL THEN
    RAISE EXCEPTION 'ثبت دلیل برگشت سند الزامی است' USING ERRCODE = '22023';
  END IF;

  -- wave 6 / L-5 + L-6: the accrual kinds join the list. Nothing else in this
  -- function's permission model, locking, balance proof or audit row changes.
  IF _kind NOT IN ('receipt', 'payment', 'dual', 'sale_accrual', 'purchase_accrual') THEN
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
                    WHEN 'sale_accrual'     THEN 'sales_quote_accrual'
                    WHEN 'purchase_accrual' THEN 'purchase_accrual'
                  END;
  _doc_type := _kind;
  _entity_type := CASE _kind
                    WHEN 'sale_accrual'     THEN 'sales_quote'
                    WHEN 'purchase_accrual' THEN 'purchases'
                    ELSE _source_type
                  END;
  -- Accrual documents are NOT numbered. document_numbers_doc_type_check admits only
  -- receipt/payment/dual, and assign_document_number refuses anything else outright
  -- (its line 14). Widening a numbering series that three tables and 197 rows already
  -- depend on is far more than "what the new kinds genuinely require", so accrual
  -- reversals simply carry no document number -- _rev_number stays NULL and the
  -- description falls back to 'سند اصلی', which the existing coalesce already handles.
  _is_accrual := _kind IN ('sale_accrual', 'purchase_accrual');

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
  ELSIF _kind = 'sale_accrual' THEN
    PERFORM 1 FROM public.sales_quotes WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    SELECT final_amount, customer_id INTO _amount, _counterparty_id
      FROM public.sales_quotes WHERE id = p_source_id;
    _counterparty_kind := 'customer';
  ELSIF _kind = 'purchase_accrual' THEN
    PERFORM 1 FROM public.purchases WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'سندی برای برگشت یافت نشد' USING ERRCODE = 'P0001';
    END IF;
    SELECT total_amount, supplier_id INTO _amount, _counterparty_id
      FROM public.purchases WHERE id = p_source_id;
    _counterparty_kind := 'supplier';
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

  IF NOT _is_accrual THEN
    SELECT document_number INTO _orig_number
      FROM public.document_numbers
     WHERE doc_type = _doc_type AND source_id = p_source_id;
  END IF;

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

  IF NOT _is_accrual THEN
    _rev_number := public.assign_document_number(_doc_type, _rev_source_id);
  END IF;

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code,
    reverses_entry_id
  ) VALUES (
    _orig_doc_kind, _source_type, _rev_source_id, public.tehran_today(),
    CASE WHEN _rev_number IS NULL
         THEN 'سند برگشتی بابت ' || coalesce(_orig_number, 'سند اصلی')
         ELSE 'سند برگشتی شمارهٔ ' || _rev_number || ' بابت ' || coalesce(_orig_number, 'سند اصلی')
    END,
    'posted', _uid, _receiver_code, _payer_code,
    _orig_entry_id
  )
  RETURNING id INTO _rev_entry_id;

  -- account_id is carried across (487): a reversal must sit on the same chart
  -- accounts as the entry it reverses, or the two would not net to zero per account.
  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, account_id, debit, credit, description
  )
  SELECT _rev_entry_id, jl.line_no, jl.account_kind, jl.account_ref_id, jl.account_id,
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
  ELSIF _is_accrual THEN
    -- Nothing to stamp. Neither sales_quotes nor purchases carries reversal columns,
    -- and inventing them is not required: the authoritative "this has been reversed"
    -- is the posted journal_entries row whose reverses_entry_id points at the original,
    -- which is exactly the test the guard above and asan_list_journal_export both use.
    NULL;
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
$function$
;

-- ---------------- 3. update_sales_quote_status ----------------
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
  _missing text;
  _svc_lines text;
  _held_for_quote numeric;
  _rev_entry_id   uuid;
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

  -- wave 6 / L-5. Checked FIRST and separately, because the owner decision
  -- (CONTRACTS.md section 2 Q-3) is admin/accountant ONLY -- manager is excluded, and
  -- the generic admin/manager arm below would otherwise let a manager through. This
  -- also matches reverse_document's own gate, which this branch goes on to call and
  -- which admits admin and accountant only.
  IF p_next = 'cancelled_after_accept'::public.sales_quote_status THEN
    IF NOT public.has_any_role(_uid, ARRAY['admin','accountant']::text[]) THEN
      RAISE EXCEPTION 'اجازهٔ ابطال پیش‌فاکتور پذیرفته‌شده را ندارید.' USING ERRCODE = '42501';
    END IF;
  ELSIF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
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

  IF p_next = 'cancelled_after_accept'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای ابطال پیش‌فاکتور پذیرفته‌شده، ثبت دلیل الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'cancelled_after_accept'::public.sales_quote_status THEN
    -- ===================== wave 6 / L-5 =====================
    -- Owner decision (CONTRACTS.md section 2, Q-2b): cancelling an ACCEPTED quote does
    -- exactly TWO things. It does NOT touch the warehouse tasks row on the 'store'
    -- queue that acceptance also created (hazard H·b) -- a human closes that.
    IF _row.status <> 'accepted'::public.sales_quote_status THEN
      RAISE EXCEPTION 'فقط پیش‌فاکتور پذیرفته‌شده را می‌توان ابطال کرد.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = _reason
     WHERE sq.id = p_quote_id;

    -- (a) reverse the sale_accrual entry L-3 posted. Only if one exists: a quote
    -- accepted before migration 488's cutoff has none, and cancelling it must still
    -- work rather than raising on a document that was never written (D-28).
    IF EXISTS (SELECT 1 FROM public.journal_entries je
                WHERE je.source_type = 'sales_quote_accrual'
                  AND je.source_id = p_quote_id
                  AND je.status = 'posted'
                  AND je.reverses_entry_id IS NULL) THEN
      _rev_entry_id := public.reverse_document('sale_accrual', p_quote_id, _reason);
    END IF;

    -- (b) release the credit hold hold_credit_for_quote placed at acceptance.
    -- Leaving it would strand the customer's ceiling forever, which is why the owner
    -- put this in scope. The amount is read from the ledger row hold_credit itself
    -- wrote (transaction_type='hold', reference_type='sales_quote', reference_id=quote),
    -- so it is the amount actually reserved -- which is LEAST(final_amount, available)
    -- and therefore not always final_amount.
    --
    -- KNOWN WART, recorded rather than hidden: release_credit hard-codes
    -- reference_type='payment_receipt' on the ledger row it writes, so this release is
    -- filed under that label even though no receipt exists. Reusing release_credit is
    -- still right -- it is the single audited release path, it caps at held_credit so it
    -- cannot mint ceiling, and duplicating its body here would be the parallel
    -- implementation rule 14 forbids. Correcting the label needs a signature change
    -- with other callers, which is out of scope for this row.
    IF _row.customer_id IS NOT NULL THEN
      SELECT COALESCE(SUM(l.amount), 0) INTO _held_for_quote
        FROM public.customer_credit_ledger l
       WHERE l.reference_type = 'sales_quote'
         AND l.reference_id = p_quote_id
         AND l.transaction_type = 'hold';

      IF COALESCE(_held_for_quote, 0) > 0 THEN
        PERFORM public.release_credit(_row.customer_id, _held_for_quote, p_quote_id, _uid);
      END IF;
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (_uid, 'sales_quote', p_quote_id::text, 'quote_cancelled_after_accept',
      jsonb_build_object(
        'reason',                   _reason,
        'reversal_journal_entry_id', _rev_entry_id,
        'credit_released',           COALESCE(_held_for_quote, 0),
        'customer_id',               _row.customer_id));
    -- ========================================================
  ELSIF p_next = 'canceled'::public.sales_quote_status THEN
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
    -- ================= requirement 223 — layers 4 and 5 =================
    IF p_next = 'accepted'::public.sales_quote_status THEN
      -- Re-apply first. A line inserted before the rule existed, or one whose
      -- product was re-categorised after the line was created, would otherwise
      -- fail a check it never had the chance to satisfy.
      PERFORM public.apply_required_services_for_quote_item(i.id)
      FROM public.sales_quote_items i
      WHERE i.quote_id = p_quote_id;

      -- Then verify. If anything is still missing the obligation was defeated
      -- somehow, and finalising would ship an unpackaged television.
      SELECT string_agg(DISTINCT COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام'), '، ')
        INTO _missing
      FROM public.sales_quote_items i
      JOIN public.products p                     ON p.id  = i.product_id
      JOIN public.category_required_services crs ON crs.category_id = p.category_id
      JOIN public.product_service_types st       ON st.id = crs.service_type_id
      WHERE i.quote_id = p_quote_id
        AND crs.is_active AND crs.is_mandatory AND st.is_active
        AND NOT EXISTS (
          SELECT 1 FROM public.sales_quote_item_services s
          WHERE s.quote_item_id = i.id
            AND s.service_type_id = crs.service_type_id
        );

      IF _missing IS NOT NULL THEN
        RAISE EXCEPTION 'خدمت اجباری برای این کالاها ثبت نشده است: %', _missing
          USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE public.sales_quotes AS sq
       SET status = p_next
     WHERE sq.id = p_quote_id;

    -- OG-79 / M11. Finalising a quote CONSUMES ceiling. Option (ب): an over-ceiling quote is
    -- ACCEPTED, never refused — the counter keeps working — but the shortfall is reserved
    -- nowhere, recorded on the quote and written to audit_logs. `hold_credit_for_quote` caps the
    -- reservation at LEAST(amount, available), so a hold can take the ceiling to exactly zero
    -- and never past it.
    --
    -- Placed AFTER the status UPDATE deliberately: the reservation describes an accepted quote,
    -- so if any check above raises, the whole transaction rolls back and nothing is held.
    IF p_next = 'accepted'::public.sales_quote_status THEN
      PERFORM public.hold_credit_for_quote(p_quote_id, auth.uid());
    END IF;

    -- Warehouse preparation must SEE the obligation, not just the document.
    -- Queue 'store' is used because tasks_assigned_queue_check permits only
    -- sales/shipping/store/accounting — inventing a 'warehouse' queue would
    -- mean widening a CHECK that other code already relies on.
    IF p_next = 'accepted'::public.sales_quote_status THEN
      SELECT string_agg(
               COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام')
                 || ' — ' || COALESCE(s.display_text, st.name_fa),
               E'\n' ORDER BY i.created_at)
        INTO _svc_lines
      FROM public.sales_quote_items i
      JOIN public.sales_quote_item_services s ON s.quote_item_id = i.id
      JOIN public.product_service_types st    ON st.id = s.service_type_id
      WHERE i.quote_id = p_quote_id AND s.is_mandatory;

      IF _svc_lines IS NOT NULL THEN
        INSERT INTO public.tasks (
          title, description, status, priority,
          reference_type, reference_id, assigned_queue, created_by
        )
        SELECT
          'خدمات اجباری پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text),
          _svc_lines,
          'pending', 'high',
          'sales_quote', p_quote_id, 'store', _uid
        -- Idempotent: re-accepting an already-accepted proforma must not pile
        -- up duplicate work orders for the warehouse.
        WHERE NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.reference_type = 'sales_quote'
            AND t.reference_id = p_quote_id
            AND t.assigned_queue = 'store'
            AND t.status <> 'canceled'
        );
      END IF;
    END IF;
    -- =====================================================================
  END IF;

  RETURN QUERY
  SELECT sq.id, sq.status, sq.cancel_reason
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;
END;
$function$
;

-- ============================================================================
-- 4. L-6 -- the cancel path for a purchase. NEW function.
-- ============================================================================
--
-- Symmetric with L-5, and starting from even less: purchases.status has exactly
-- ONE value in use -- 'received', on all 317 rows -- there is no CHECK constraint
-- on the column, and there is no cancel path anywhere in the database or in src/
-- today. The research confirmed the only way to remove a purchase has ever been a
-- direct DELETE, which no function and no client code performs.
--
-- So this adds a value where none has existed. 'canceled' is used here rather than
-- a 'cancelled_after_accept' analogue: on quotes the new value existed to keep two
-- DIFFERENT cancellation histories apart, and on purchases there is no prior
-- cancellation history to be confused with.
--
-- Gated to admin/accountant, matching reverse_document's own gate, which it calls.
-- A reason is mandatory, as it is for every other reversal in this database.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_purchase(p_purchase_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid          uuid := auth.uid();
  _reason       text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _purchase     record;
  _rev_entry_id uuid;
BEGIN
  IF NOT public.has_any_role(_uid, ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'اجازهٔ ابطال خرید را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL THEN
    RAISE EXCEPTION 'برای ابطال خرید، ثبت دلیل الزامی است.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _purchase FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'خرید یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _purchase.status = 'canceled' THEN
    RAISE EXCEPTION 'این خرید قبلاً ابطال شده است.' USING ERRCODE = 'P0001';
  END IF;

  -- A purchase that has already been paid must not be cancelled behind the payment's
  -- back: the voucher and its own journal entry would be left describing a purchase
  -- that no longer exists. Reverse the payment first.
  IF EXISTS (SELECT 1 FROM public.payment_vouchers pv
              WHERE pv.purchase_id = p_purchase_id
                AND pv.status = 'approved'
                AND pv.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'برای این خرید سند پرداخت ثبت شده است؛ ابتدا سند پرداخت را برگشت بزنید.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchases SET status = 'canceled' WHERE id = p_purchase_id;

  -- Reverse the purchase_accrual entry L-4 posted, if there is one. A purchase
  -- created before migration 489's cutoff has none, and cancelling it must still
  -- work rather than raising on a document that was never written (D-28).
  IF EXISTS (SELECT 1 FROM public.journal_entries je
              WHERE je.source_type = 'purchase_accrual'
                AND je.source_id = p_purchase_id
                AND je.status = 'posted'
                AND je.reverses_entry_id IS NULL) THEN
    _rev_entry_id := public.reverse_document('purchase_accrual', p_purchase_id, _reason);
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'purchases', p_purchase_id::text, 'purchase_cancelled',
    jsonb_build_object(
      'reason',                    _reason,
      'reversal_journal_entry_id', _rev_entry_id,
      'supplier_id',               _purchase.supplier_id,
      'total_amount',              _purchase.total_amount));

  RETURN _rev_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_purchase(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_purchase(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase(uuid, text) TO authenticated;
