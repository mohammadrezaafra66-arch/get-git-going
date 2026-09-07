SET client_encoding='UTF8';

-- ============================================================================
-- 494 - H-2: an implicit purchase payment pays the OUTSTANDING balance.
-- ============================================================================
--
-- Wave 5's migration 478 added partial purchase payments and claimed "every
-- existing caller keeps working". Wave 6's independent verification refuted that.
--
-- THE DEFECT, REPRODUCED ON THE LIVE PURCHASE ba1c75a0 BEFORE THIS MIGRATION
-- ---------------------------------------------------------------------------
-- That purchase has total_amount 12,000,000,000 and cash_price 10,000,000,000.
-- /accounting/purchase-payments has NO amount field at all
-- (_app.accounting.purchase-payments.tsx:172-185 -> queries.ts:236 sends
-- _amount: null), so the only call the UI can make is the implicit one. Measured:
--
--   click 1 (_amount NULL) -> voucher for 10,000,000,000 (cash_price)
--                             outstanding = 2,000,000,000, paid_at = NULL
--   click 2 (_amount NULL) -> REFUSED 22023
--        "مبلغ پرداخت از ماندهٔ بدهی این خرید بیشتر است؛ ماندهٔ بدهی 2000000000.00 است."
--
-- because _amt is always cash_price (10bn) while the remainder is 2bn. The
-- purchase could never be settled through its own page.
--
-- THE FIX -- owner decision, CONTRACTS.md section 2
-- ---------------------------------------------------------------------------
-- When _amount IS NULL the implicit amount pays the OUTSTANDING balance, never
-- cash_price. One clamp, applied only on the implicit path so an EXPLICIT
-- over-payment stays an error. _outstanding is already computed three lines
-- above (line 50), so no new query is needed.
--
-- THE SIGNATURE IS NOT CHANGED (11 args). A defaulted parameter would OVERLOAD
-- rather than replace, leaving both bodies live and every existing call
-- ambiguous -- CLAUDE.md rule 5.
--
-- The body below is the live pg_get_functiondef output read immediately before
-- this migration (rule 2), reproduced byte for byte with exactly one hunk added.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date DEFAULT NULL::date, _document_channel text DEFAULT 'cash'::text, _amount numeric DEFAULT NULL::numeric, _tracking_number text DEFAULT NULL::text, _cheque_number text DEFAULT NULL::text, _cheque_due_date date DEFAULT NULL::date, _description text DEFAULT NULL::text, _payee_party_id uuid DEFAULT NULL::uuid, _payee_accounting_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purchase        record;
  _amt             numeric;
  _voucher_id      uuid;
  _party           record;
  _payee_type      text;
  _payee_name      text;
  -- Plain text, not _party.full_name: PL/pgSQL resolves record fields when it
  -- plans the expression, so touching _party.full_name inside a CASE fails with
  -- "record is not assigned yet" even in a branch that never runs. The dry-run
  -- caught exactly that.
  _party_name      text;
  _pay_date        date;
  _payer_code      text;   -- our side: the bank account the money leaves from
  _receiver_code   text;   -- their side: supplier, or the third party we paid
  _supplier_name   text;
  _journal_id      uuid;
  _existing_journal uuid;
  _debit_desc      text;
  -- 478 — partial payment.
  _debt            numeric;  -- what the purchase owes in total
  _already         numeric;  -- confirmed, un-reversed payments already recorded
  _outstanding     numeric;  -- what is left before this call
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت سند پرداخت را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _purchase FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'خرید یافت نشد.' USING ERRCODE = '22023';
  END IF;

  -- 478. What is already paid. `status='approved'` mirrors the receipts side's status
  -- membership test; `reversed_at IS NULL` is the condition reverse_document makes necessary,
  -- since it stamps reversed_at and leaves status alone. The FOR UPDATE above serialises two
  -- concurrent payments of the same purchase, so this sum cannot be read stale.
  _debt := COALESCE(_purchase.total_amount, 0);
  SELECT COALESCE(SUM(pv.amount), 0) INTO _already
    FROM public.payment_vouchers pv
   WHERE pv.purchase_id = _purchase_id
     AND pv.status = 'approved'
     AND pv.reversed_at IS NULL;
  _outstanding := GREATEST(_debt - _already, 0);

  -- مبلغ پیش‌فرض: قیمت نقدی، وگرنه مبلغ کل خرید
  _amt := COALESCE(_amount, _purchase.cash_price, _purchase.total_amount);

  -- H-2 (wave 6). Owner decision, CONTRACTS.md section 2: when the caller supplies
  -- NO amount, the implicit amount pays the OUTSTANDING BALANCE, never cash_price.
  --
  -- The defect this fixes, reproduced on the live purchase ba1c75a0 (total
  -- 12,000,000,000, cash_price 10,000,000,000) before the change:
  --   click 1, _amount NULL -> pays cash_price 10bn, outstanding 2bn, paid_at NULL
  --   click 2, _amount NULL -> _amt is cash_price 10bn again, which is > the 2bn
  --                            remaining, so line 65 refuses it. Refused FOREVER.
  -- /accounting/purchase-payments has no amount field at all and always sends
  -- _amount: null, so click 2 was the only action the UI could perform and the
  -- purchase could never be settled through it.
  --
  -- The clamp is applied ONLY when _amount IS NULL, so an EXPLICIT over-payment is
  -- still an error rather than being silently reduced. _outstanding is already
  -- computed above, so this needs no new query.
  --
  -- The signature is unchanged (11 args): a defaulted parameter would OVERLOAD
  -- rather than replace, leaving both bodies live and every call ambiguous
  -- (CLAUDE.md rule 5).
  IF _amount IS NULL AND _debt > 0 THEN
    _amt := LEAST(_amt, _outstanding);
  END IF;

  IF _amt IS NULL OR _amt <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  -- 478. The cap replaces the pre-478 blanket refusal of a second voucher. For a purchase with
  -- no usable total (none exist today) the pre-478 one-voucher rule is kept unchanged rather
  -- than inventing a cap out of a NULL.
  IF _debt > 0 THEN
    IF _outstanding <= 0 THEN
      RAISE EXCEPTION 'این خرید به‌طور کامل پرداخت شده است.' USING ERRCODE = '23505';
    END IF;
    IF _amt > _outstanding THEN
      RAISE EXCEPTION 'مبلغ پرداخت از ماندهٔ بدهی این خرید بیشتر است؛ ماندهٔ بدهی % است.',
        _outstanding USING ERRCODE = '22023';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.payment_vouchers
                 WHERE purchase_id = _purchase_id
                   AND status = 'approved'
                   AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'برای این خرید از قبل سند پرداخت ثبت شده است.' USING ERRCODE = '23505';
  END IF;

  IF _source_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ پرداخت الزامی است.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _source_bank_account_id) THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ یافت نشد.' USING ERRCODE = '22023';
  END IF;

  _pay_date := COALESCE(_payment_date, CURRENT_DATE);

  -- ---------------------------------------------------------------------
  -- Payee identity. Exactly one branch runs; the shape it produces is the
  -- one payment_vouchers_payee_matches_type_chk already requires.
  -- ---------------------------------------------------------------------
  IF _payee_party_id IS NOT NULL THEN
    SELECT * INTO _party FROM public.external_parties WHERE id = _payee_party_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طرف حساب خارجی انتخاب‌شده یافت نشد.' USING ERRCODE = '22023';
    END IF;
    IF NOT _party.is_active THEN
      RAISE EXCEPTION 'طرف حساب خارجی «%» غیرفعال است و نمی‌توان به او پرداخت ثبت کرد.',
        _party.full_name USING ERRCODE = '22023';
    END IF;
    _payee_type    := 'external_party';
    _payee_name    := NULL;
    _party_name    := _party.full_name;
    _receiver_code := NULLIF(btrim(COALESCE(_party.accounting_code, '')), '');
  ELSIF _purchase.supplier_id IS NOT NULL THEN
    _payee_type := 'supplier';
    _payee_name := NULL;
    SELECT NULLIF(btrim(COALESCE(s.accounting_code, '')), ''), s.name
      INTO _receiver_code, _supplier_name
      FROM public.suppliers s WHERE s.id = _purchase.supplier_id;
  ELSE
    -- No supplier on the purchase and no third party chosen. Same fallback the
    -- pre-313 function used, kept so existing behaviour does not change.
    _payee_type    := 'other';
    _payee_name    := 'تأمین‌کننده نامشخص';
    _receiver_code := NULL;
  END IF;

  -- An explicitly supplied code always wins, mirroring the receipt side where
  -- beneficiary_accounting_code overrides the derived one.
  _receiver_code := COALESCE(NULLIF(btrim(COALESCE(_payee_accounting_code, '')), ''), _receiver_code);

  SELECT NULLIF(btrim(COALESCE(accounting_code, '')), '')
    INTO _payer_code
    FROM public.bank_accounts WHERE id = _source_bank_account_id;

  INSERT INTO public.payment_vouchers (
    amount, payment_date, payee_type, payee_supplier_id, payee_party_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, description, status, purchase_id, created_by
  ) VALUES (
    _amt,
    _pay_date,
    _payee_type,
    CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
    CASE WHEN _payee_type = 'external_party' THEN _payee_party_id       ELSE NULL END,
    _payee_name,
    _document_channel,
    _source_bank_account_id,
    NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
    _cheque_number,
    _cheque_due_date,
    COALESCE(_description, 'پرداخت خرید'),
    'approved',
    _purchase_id,
    auth.uid()
  )
  RETURNING id INTO _voucher_id;
  -- payee_person_id is filled by trg_payment_vouchers_derive_person.

  -- 478. paid_at marks SETTLEMENT, not "a payment happened". It is stamped only when this
  -- voucher brings the outstanding balance to zero. The `_debt <= 0` arm preserves the pre-478
  -- unconditional stamp for a purchase with no usable total; zero such rows exist today.
  IF _debt <= 0 OR (_already + _amt) >= _debt THEN
    UPDATE public.purchases
       SET paid_at = COALESCE(paid_at, now())
     WHERE id = _purchase_id;
  END IF;

  -- ---------------------------------------------------------------------
  -- Ledger. Idempotent on (source_type, source_id), which is also a UNIQUE
  -- constraint, so a retry cannot produce a second entry.
  -- ---------------------------------------------------------------------
  SELECT id INTO _existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_voucher' AND source_id = _voucher_id;

  IF _existing_journal IS NULL THEN
    _debit_desc := CASE
      WHEN _payee_type = 'external_party'
        THEN 'کاهش بدهی به تأمین‌کننده — پرداخت به شخص ثالث «' || COALESCE(_party_name, '؟') || '»'
      WHEN _payee_type = 'supplier'
        THEN 'کاهش بدهی به تأمین‌کننده «' || COALESCE(_supplier_name, '؟') || '»'
      ELSE 'کاهش بدهی به تأمین‌کننده (تأمین‌کننده نامشخص)'
    END;

    INSERT INTO public.journal_entries(
      doc_kind, source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'purchase_payment', 'payment_voucher', _voucher_id, _pay_date,
      'سند پرداخت خرید' ||
        COALESCE(' شماره ' || (SELECT voucher_number FROM public.payment_vouchers WHERE id = _voucher_id), ''),
      'posted', auth.uid(),
      _payer_code, _receiver_code
    )
    RETURNING id INTO _journal_id;

    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (_journal_id, 1, 'supplier_payable', _purchase.supplier_id, _amt, 0, _debit_desc),
      (_journal_id, 2, 'bank',             _source_bank_account_id, 0, _amt, 'خروج وجه از حساب بانکی');
  ELSE
    _journal_id := _existing_journal;
  END IF;

  -- Balance assertion. Cheap, and it turns a silent accounting bug into a
  -- refused transaction.
  IF (SELECT SUM(debit) FROM public.journal_lines WHERE journal_entry_id = _journal_id)
     IS DISTINCT FROM
     (SELECT SUM(credit) FROM public.journal_lines WHERE journal_entry_id = _journal_id) THEN
    RAISE EXCEPTION 'سند حسابداری پرداخت تراز نشد؛ ثبت لغو شد.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'payment_vouchers', _voucher_id::text, 'purchase_payment_posted',
    jsonb_build_object(
      'purchase_id',      _purchase_id,
      'amount',           _amt,
      'payment_date',     _pay_date,
      'payee_type',       _payee_type,
      'payee_party_id',   CASE WHEN _payee_type = 'external_party' THEN _payee_party_id ELSE NULL END,
      'payee_supplier_id',CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
      'document_channel', _document_channel,
      'tracking_number',  NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
      'journal_entry_id', _journal_id,
      -- 478 — the partial-payment trail. Additive; no existing key changed.
      'purchase_total_amount', _debt,
      'already_paid',          _already,
      'outstanding_after',     GREATEST(_debt - (_already + _amt), 0)
    ));

  RETURN _voucher_id;
END;
$function$
;
