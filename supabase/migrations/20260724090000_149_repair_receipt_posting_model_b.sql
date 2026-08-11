-- =====================================================================
-- 149 - Repair receipt posting on the Model B ledger path
-- =====================================================================
-- Model B (post_receipt_accounting) is authoritative. Changes:
--  1) post_receipt_accounting: journal_lines kind/ref_id ->
--     account_kind/account_ref_id; line-2 'customer' -> 'customer_credit';
--     bank receiver no longer reads nonexistent bank_accounts.accounting_code.
--  2) post_receipt_journal: NEUTRALIZED to a no-op; function + trigger retained.
-- All affected tables are currently empty.
--
-- NOTE ON CORRUPTED TEXT: post_receipt_accounting's and post_receipt_journal's
-- Persian strings (RAISE EXCEPTION messages, journal-line descriptions) were
-- ALREADY corrupted to literal '?' in the live DB (part of the 2026-07-11
-- transcode event; verified: 0 non-ASCII chars, 623 literal '?'). This
-- migration preserves them verbatim - the original Persian is unrecoverable and
-- must NOT be fabricated. Re-entering those strings is a separate human task.
--
-- ROLLBACK: restore both function bodies from git history of this file.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. This former Path A wrote
  -- account_kind='accounting_code', which the journal_lines CHECK forbids, and
  -- it duplicated posting. Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------
-- Unblock the approve UPDATE: recompute_employee_scores_on_receipt (fired by
-- trg_payment_receipts_recompute_employee_score on status change) had the same
-- latent text=app_role JOIN bug as its sibling link trigger (fixed in 148).
-- user_roles.role is TEXT, so `ur.role = 'sales'::app_role` errored at runtime,
-- which aborted the approve UPDATE. Switch to public.has_role; invoice-only
-- resolution and all other behavior preserved verbatim.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _whitelist text[] := ARRAY['approved','verified','confirmed','posted'];
  _old_status text;
  _new_status text;
  _receipt_id uuid;
  _should_run boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new_status := NEW.status;
    _receipt_id := NEW.id;
    _should_run := (_new_status = ANY(_whitelist));
  ELSIF TG_OP = 'DELETE' THEN
    _old_status := OLD.status;
    _receipt_id := OLD.id;
    _should_run := (_old_status = ANY(_whitelist));
  ELSE -- UPDATE
    _old_status := OLD.status;
    _new_status := NEW.status;
    _receipt_id := COALESCE(NEW.id, OLD.id);
    _should_run := (_old_status IS DISTINCT FROM _new_status)
                   AND ( (_old_status = ANY(_whitelist)) OR (_new_status = ANY(_whitelist)) );
  END IF;

  IF NOT _should_run THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR _emp IN
    SELECT DISTINCT i.created_by
    FROM public.payment_receipt_links prl
    JOIN public.invoices i ON i.id = prl.invoice_id
    WHERE prl.receipt_id = _receipt_id
      AND i.created_by IS NOT NULL
      AND public.has_role(i.created_by, 'sales'::public.app_role)
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_'||lower(TG_OP),
        'payment_receipts',
        _receipt_id::text,
        jsonb_build_object('op', TG_OP, 'old_status', _old_status, 'new_status', _new_status)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_link record;
  v_paid numeric;
  v_total numeric;
  v_new_status text;
  v_invoice_updates jsonb := '[]'::jsonb;
  v_journal_id uuid;
  v_existing_journal uuid;
  v_debit_kind text;
  v_debit_ref uuid;
  v_debit_desc text;
  v_balance record;
  v_journal_summary jsonb;
  v_receiver_code text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION '???????????? ?????????????? ???????? ?????? ?????? ???????????????? ??????';
  END IF;

  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '?????? ???????? ??????';
  END IF;

  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION '?????? ?????? ???????????????? ???????? ?????? ???? ???????????????? ??????';
  END IF;

  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION '???????? ?????? ???????? ???????? ???????????? ?????? ???? ?????????? ?????? ???? ???????? ???????????? ????????????????? ???????????? ???????????? ?????? ????????';
  END IF;

  -- Resolve receiver accounting code from chosen receiver entity
  IF v_receipt.receiver_accounting_code IS NOT NULL AND length(trim(v_receipt.receiver_accounting_code)) > 0 THEN
    v_receiver_code := v_receipt.receiver_accounting_code;
  ELSIF v_receipt.receiver_party_id IS NOT NULL THEN
    SELECT accounting_code INTO v_receiver_code FROM public.external_parties WHERE id = v_receipt.receiver_party_id;
  ELSIF v_receipt.destination_bank_account_id IS NOT NULL THEN
    -- bank_accounts has NO accounting_code column. The ledger LINES use
    -- account_kind='bank' + account_ref_id, so posting is unaffected; the
    -- journal_entries.receiver_accounting_code HEADER is left blank for
    -- bank receivers. Do NOT read a nonexistent column (migration 149).
    v_receiver_code := NULL;
  END IF;

  -- Enforce blocking rules from validation_rules for journal_entry scope
  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='payer_accounting_code' AND rule_type='required'
  ) AND (v_receipt.payer_accounting_code IS NULL OR length(trim(v_receipt.payer_accounting_code)) = 0) THEN
    RAISE EXCEPTION '???? ???????? ???????????????????? ???????? ?????? ?????? ???????????????? ???????????? ??????.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='receiver_accounting_code' AND rule_type='required'
  ) AND (v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0) THEN
    RAISE EXCEPTION '???? ???????? ???????????? ???????? ?????? ?????? ???????????????? ???????????? ??????.';
  END IF;

  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  PERFORM public.increase_credit(
    v_receipt.customer_id,
    v_receipt.amount,
    v_receipt.id,
    p_user_id
  );

  -- Allocate to invoices
  FOR v_link IN
    SELECT prl.invoice_id, prl.amount AS link_amount, i.total_amount, i.status
      FROM public.payment_receipt_links prl
      JOIN public.invoices i ON i.id = prl.invoice_id
     WHERE prl.receipt_id = p_receipt_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM public.payment_receipt_links
     WHERE invoice_id = v_link.invoice_id;

    v_total := v_link.total_amount;
    IF v_paid >= v_total THEN
      v_new_status := 'paid';
    ELSIF v_paid > 0 THEN
      v_new_status := 'partially_paid';
    ELSE
      v_new_status := 'unpaid';
    END IF;

    UPDATE public.invoices SET status = v_new_status WHERE id = v_link.invoice_id;

    v_invoice_updates := v_invoice_updates || jsonb_build_object(
      'invoice_id', v_link.invoice_id,
      'paid_total', v_paid,
      'new_status', v_new_status
    );
  END LOOP;

  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := '?????????? ???? ???????? ?????????? ????????';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := '???????????? ???? ?????? ??????????';
    END IF;

    INSERT INTO public.journal_entries(
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_receipt', v_receipt.id, v_receipt.payment_date,
      '?????? ?????? ???????????? ?????????? ' || v_receipt.tracking_number, 'posted', p_user_id,
      NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
      NULLIF(trim(COALESCE(v_receiver_code,'')), '')
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, '???????????? ????????????/???????? ???????? ??????????');
  ELSE
    v_journal_id := v_existing_journal;
    UPDATE public.journal_entries
       SET payer_accounting_code = COALESCE(payer_accounting_code, NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), '')),
           receiver_accounting_code = COALESCE(receiver_accounting_code, NULLIF(trim(COALESCE(v_receiver_code,'')), ''))
     WHERE id = v_journal_id;
  END IF;

  SELECT public.get_customer_credit(v_receipt.customer_id) INTO v_balance;

  v_journal_summary := jsonb_build_object(
    'journal_id', v_journal_id,
    'debit_kind', v_debit_kind,
    'debit_ref', v_debit_ref
  );

  RETURN jsonb_build_object(
    'posted', true,
    'invoice_updates', v_invoice_updates,
    'customer_credit', row_to_json(v_balance),
    'journal', v_journal_summary
  );
END;
$function$
;

COMMIT;
