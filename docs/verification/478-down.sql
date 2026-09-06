SET client_encoding='UTF8';

-- 478-down. Restores the schema exactly as it stood before
-- supabase/migrations/20260906160000_478_partial_purchase_payment.sql was applied.
--
-- It writes NO data: no INSERT, no UPDATE, no DELETE. `purchases.paid_at` and any
-- `payment_vouchers` row created while 478 was live are LEFT ALONE, deliberately -- they are
-- real documents with real journal entries, and un-writing them is a data decision for a human,
-- not a schema rollback. What reverting means for them is stated at the bottom of this file.
--
-- The view is DROPped and recreated rather than CREATE OR REPLACEd, because 478 appended a
-- column (`confirmed_paid_amount`) and CREATE OR REPLACE VIEW cannot remove one. The DROP is
-- safe: `pg_depend` records zero non-rewrite dependents on this view, and its four readers
-- (get_payables_list, get_payable_detail, get_payables_summary, compute_daily_capital) are all
-- LANGUAGE plpgsql, so they hold no catalogue dependency on it. The grants and the COMMENT the
-- DROP takes with it are re-issued below.
--
-- Run it the same way as a migration:
--   cat docs/verification/478-down.sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/d.sql'
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/d.sql
--   docker restart afrakala-lan-rest
--
-- The two bodies below were taken with pg_get_viewdef / pg_get_functiondef from the LIVE
-- database on 2026-09-06 immediately before 478 was applied. The view body is migration 459's;
-- the function body is migration 345's and was verified identical to that file on disk.

-- ---------------------------------------------------------------------------
-- 1. The view, as 459 left it: 20 columns, no confirmed_paid_amount.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.vw_supplier_payables;

CREATE VIEW public.vw_supplier_payables AS
SELECT src.supplier_id,
   src.supplier_name,
   src.purchase_id,
   src.purchase_date,
   src.payment_term_days,
   src.due_date,
   src.purchase_total_amount,
   src.cash_price,
   src.currency,
   src.paid_at,
   src.is_paid,
   src.outstanding_amount,
   src.days_until_due,
   src.is_overdue,
   src.product_summary,
   src.created_at,
   src.aging_bucket,
   src.due_date_unknown,
   src.due_date_unknown_reason,
   src.payment_term_inactive_flag
  FROM ( SELECT p.supplier_id,
           s.name AS supplier_name,
           p.id AS purchase_id,
           p.purchase_date,
           pt.days AS payment_term_days,
               CASE
                   WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                   ELSE NULL::date
               END AS due_date,
           p.total_amount AS purchase_total_amount,
           p.cash_price,
           p.currency,
           p.paid_at,
           p.paid_at IS NOT NULL AS is_paid,
               CASE
                   WHEN p.paid_at IS NOT NULL THEN 0::numeric
                   ELSE COALESCE(p.total_amount, 0::numeric)
               END AS outstanding_amount,
               CASE
                   WHEN p.paid_at IS NOT NULL THEN NULL::integer
                   WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - tehran_today()
                   ELSE NULL::integer
               END AS days_until_due,
           p.paid_at IS NULL AND pt.days IS NOT NULL AND (p.purchase_date + ((pt.days || ' days'::text)::interval))::date < tehran_today() AS is_overdue,
           NULL::text AS product_summary,
           p.created_at,
               CASE
                   WHEN p.paid_at IS NOT NULL THEN 'current'::text
                   WHEN pt.days IS NULL THEN 'current'::text
                   WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 0 THEN 'current'::text
                   WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 30 THEN 'd1_30'::text
                   WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 60 THEN 'd31_60'::text
                   WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 90 THEN 'd61_90'::text
                   ELSE 'd90_plus'::text
               END AS aging_bucket,
           pt.days IS NULL AS due_date_unknown,
               CASE
                   WHEN pt.id IS NULL THEN 'no_payment_term'::text
                   WHEN pt.days IS NULL THEN 'no_term_days'::text
                   ELSE NULL::text
               END AS due_date_unknown_reason,
           pt.id IS NOT NULL AND pt.is_active = false AS payment_term_inactive_flag
          FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id) src
 WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

COMMENT ON VIEW public.vw_supplier_payables IS
  'Supplier payables aging. outstanding_amount is the purchase total_amount (457): cash_price is the gamification benchmark price, not the debt. A missing payment term yields due_date NULL and due_date_unknown, never the purchase date (459). Partial purchase payments are still not modeled.';

REVOKE ALL ON TABLE public.vw_supplier_payables FROM PUBLIC;
REVOKE ALL ON TABLE public.vw_supplier_payables FROM anon;
GRANT ALL ON TABLE public.vw_supplier_payables TO postgres;
GRANT ALL ON TABLE public.vw_supplier_payables TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The RPC, as 345 left it. Same 11-argument signature, so CREATE OR REPLACE
--    is enough and no DROP FUNCTION is needed in either direction.
-- ---------------------------------------------------------------------------

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
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت سند پرداخت را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _purchase FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'خرید یافت نشد.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payment_vouchers WHERE purchase_id = _purchase_id
              AND status = 'approved') THEN
    RAISE EXCEPTION 'برای این خرید از قبل سند پرداخت ثبت شده است.' USING ERRCODE = '23505';
  END IF;

  -- مبلغ پیش‌فرض: قیمت نقدی، وگرنه مبلغ کل خرید
  _amt := COALESCE(_amount, _purchase.cash_price, _purchase.total_amount);
  IF _amt IS NULL OR _amt <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت نامعتبر است.' USING ERRCODE = '22023';
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

  UPDATE public.purchases
     SET paid_at = COALESCE(paid_at, now())
   WHERE id = _purchase_id;

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
      'journal_entry_id', _journal_id
    ));

  RETURN _voucher_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO postgres;

-- ---------------------------------------------------------------------------
-- 3. The ledger row 478 wrote. Removing it is what makes the revert complete for
--    e2e/security/og81-migration-ledger-matches-disk.spec.ts -- BUT only delete it if the
--    478 FILE has also been removed from supabase/migrations. That spec fails on a mismatch
--    in EITHER direction: file-without-row is as red as row-without-file.
-- ---------------------------------------------------------------------------

-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260906160000';

-- ---------------------------------------------------------------------------
-- 4. Assertions, and what reverting costs.
-- ---------------------------------------------------------------------------

DO $do$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vw_supplier_payables';
  IF _n <> 20 THEN
    RAISE EXCEPTION '478-down: vw_supplier_payables has % columns, expected 20', _n;
  END IF;

  IF pg_get_viewdef('public.vw_supplier_payables'::regclass, true) ~* 'payment_vouchers' THEN
    RAISE EXCEPTION '478-down: the view still reads payment_vouchers';
  END IF;

  IF pg_get_functiondef(
       'public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)'::regprocedure)
     !~ 'برای این خرید از قبل سند پرداخت ثبت شده است' THEN
    RAISE EXCEPTION '478-down: the RPC did not go back to its one-voucher-per-purchase refusal';
  END IF;

  IF has_function_privilege('anon',
       'public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '478-down: anon can EXECUTE pay_purchase_with_voucher';
  END IF;

  -- WHAT REVERTING COSTS, said out loud rather than discovered later. Any purchase that was
  -- PARTIALLY paid while 478 was live goes back to being reported at its FULL total_amount:
  -- the pre-478 view has no way to see the voucher. Nothing is lost -- the vouchers, their
  -- journal entries and their audit rows all survive untouched -- but the payables screen
  -- overstates the debt by whatever was already paid until 478 is applied again.
  SELECT count(*) INTO _n
    FROM public.purchases p
   WHERE p.paid_at IS NULL
     AND EXISTS (SELECT 1 FROM public.payment_vouchers pv
                  WHERE pv.purchase_id = p.id AND pv.status = 'approved' AND pv.reversed_at IS NULL);
  IF _n > 0 THEN
    RAISE WARNING '478-down: % partially paid purchase(s) are now reported at their full total again', _n;
  END IF;
END
$do$;
