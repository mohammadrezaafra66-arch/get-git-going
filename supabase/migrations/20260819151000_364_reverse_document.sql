-- 364 — reverse_document RPC + readers that would otherwise ignore a reversal
--
-- OG-14. Depends on 363 (reversed_at, reverses_entry_id).
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS  (README-EXECUTION §H)
-- ==============================================================================================
--
-- create_payment live body is migration 356. Two edits: EXISTS grows `AND reversed_at IS NULL`;
-- the Persian sentence no longer claims reversal does not exist (that sentence becomes a lie
-- the moment this function is created).
--
-- vw_account_balances and get_account_ledger live bodies are migration 359. They sum source
-- tables, not journal_lines. Without excluding reversed_at they would keep showing a reversed
-- bank movement.
--
-- asan_list_bank_deposit_export live body is migration 350. Same. asan_list_journal_export is
-- not modified (phase 5 owns C-d / C-e).
--
-- Rollback: docs/verification/364-down.sql — statements only; restores 356/359/350 captures
-- and DROP FUNCTION reverse_document(text, uuid, text).

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
BEGIN
  IF _reason IS NULL THEN
    RAISE EXCEPTION 'ثبت دلیل برگشت سند الزامی است' USING ERRCODE = '22023';
  END IF;

  IF _kind NOT IN ('receipt', 'payment', 'dual') THEN
    RAISE EXCEPTION 'نوع سند برای برگشت معتبر نیست' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
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
    SELECT amount, customer_id
      INTO _amount, _customer_id
      FROM public.payment_receipts WHERE id = p_source_id;
    _counterparty_kind := 'customer';
    _counterparty_id := _customer_id;
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
  'OG-14. Posts a new opposite journal entry; never edits the original (343). Reason required.';

CREATE OR REPLACE VIEW public.vw_account_balances AS
 SELECT src.account_id,
    src.title,
    src.bank_name,
    src.account_type,
    src.currency,
    src.is_active,
    src.opening_balance,
    src.total_in,
    src.total_out,
    src.current_balance,
    src.in_count,
    src.out_count
   FROM ( WITH inflow AS (
                 SELECT pr.destination_bank_account_id AS account_id,
                    COALESCE(sum(pr.amount), 0::numeric) AS total_in,
                    count(*) AS in_count
                   FROM payment_receipts pr
                  WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text
                    AND pr.document_channel IS DISTINCT FROM 'cheque'::text
                    AND pr.reversed_at IS NULL
                  GROUP BY pr.destination_bank_account_id
                ), outflow AS (
                 SELECT pv.source_bank_account_id AS account_id,
                    COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                    count(*) AS out_count
                   FROM payment_vouchers pv
                  WHERE pv.status = 'approved'::text
                    AND pv.document_channel IS DISTINCT FROM 'cheque'::text
                    AND pv.reversed_at IS NULL
                  GROUP BY pv.source_bank_account_id
                )
         SELECT ba.id AS account_id,
            ba.title,
            ba.bank_name,
            ba.account_type,
            ba.currency,
            ba.is_active,
            ba.opening_balance,
            COALESCE(i.total_in, 0::numeric) AS total_in,
            COALESCE(o.total_out, 0::numeric) AS total_out,
            ba.opening_balance + COALESCE(i.total_in, 0::numeric) - COALESCE(o.total_out, 0::numeric) AS current_balance,
            COALESCE(i.in_count, 0::bigint) AS in_count,
            COALESCE(o.out_count, 0::bigint) AS out_count
           FROM bank_accounts ba
             LEFT JOIN inflow i ON i.account_id = ba.id
             LEFT JOIN outflow o ON o.account_id = ba.id) src
  WHERE NOT is_viewer_only(uid());
;

CREATE OR REPLACE FUNCTION public.get_account_ledger(p_account_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(entry_id uuid, entry_kind text, entry_date date, document_number text, counterparty text, document_channel text, amount numeric, signed_amount numeric, running_balance numeric, description text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _opening numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ماندهٔ ابتدای بازه = opening_balance حساب + همهٔ حرکات تأییدشدهٔ قبل از p_from_date
  SELECT ba.opening_balance INTO _opening
    FROM public.bank_accounts ba WHERE ba.id = p_account_id;
  IF _opening IS NULL THEN
    RAISE EXCEPTION 'حساب یافت نشد.' USING ERRCODE = '22023';
  END IF;

  IF p_from_date IS NOT NULL THEN
    _opening := _opening
      + COALESCE((SELECT SUM(pr.amount) FROM public.payment_receipts pr
                   WHERE pr.destination_bank_account_id = p_account_id
                     AND pr.status = 'approved' AND pr.payment_date < p_from_date
                     AND pr.document_channel IS DISTINCT FROM 'cheque' AND pr.reversed_at IS NULL), 0)
      - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
                   WHERE pv.source_bank_account_id = p_account_id
                     AND pv.status = 'approved' AND pv.payment_date < p_from_date
                     AND pv.document_channel IS DISTINCT FROM 'cheque' AND pv.reversed_at IS NULL), 0);
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT pr.id AS entry_id,
           'in'::text AS entry_kind,
           pr.payment_date AS entry_date,
           pr.tracking_number AS document_number,
           COALESCE(c.name, pr.payer_name) AS counterparty,
           pr.document_channel,
           pr.amount,
           pr.amount AS signed_amount,
           pr.description,
           pr.created_at
      FROM public.payment_receipts pr
      LEFT JOIN public.customers c ON c.id = pr.customer_id
     WHERE pr.destination_bank_account_id = p_account_id
       AND pr.status = 'approved'
       AND pr.document_channel IS DISTINCT FROM 'cheque'
       AND pr.reversed_at IS NULL
       AND (p_from_date IS NULL OR pr.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pr.payment_date <= p_to_date)
    UNION ALL
    SELECT pv.id AS entry_id,
           'out'::text AS entry_kind,
           pv.payment_date AS entry_date,
           pv.voucher_number AS document_number,
           -- external_parties names its column full_name, not name.
           COALESCE(s.name, ep.full_name, c2.name, pv.payee_name) AS counterparty,
           pv.document_channel,
           pv.amount,
           -pv.amount AS signed_amount,
           pv.description,
           pv.created_at
      FROM public.payment_vouchers pv
      LEFT JOIN public.suppliers s        ON s.id  = pv.payee_supplier_id
      LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
      LEFT JOIN public.customers c2       ON c2.id = pv.payee_customer_id
     WHERE pv.source_bank_account_id = p_account_id
       AND pv.status = 'approved'
       AND pv.document_channel IS DISTINCT FROM 'cheque'
       AND pv.reversed_at IS NULL
       AND (p_from_date IS NULL OR pv.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pv.payment_date <= p_to_date)
  )
  SELECT e.entry_id, e.entry_kind, e.entry_date, e.document_number, e.counterparty,
         e.document_channel, e.amount, e.signed_amount,
         (_opening + SUM(e.signed_amount) OVER (
            ORDER BY e.entry_date, e.created_at, e.entry_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric AS running_balance,
         e.description
    FROM entries e
   ORDER BY e.entry_date, e.created_at, e.entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text,
               tracking_number text, amount numeric, bank_code text, bank_title text,
               blocked_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT pr.id,
           pr.payment_date AS pdate,
           COALESCE(NULLIF(btrim(pr.payer_name), ''), '') AS pname,
           NULLIF(btrim(pr.tracking_number), '') AS tracking,
           pr.amount AS amt,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(
                     pr.customer_person_id,
                     (SELECT c.person_id FROM public.customers c WHERE c.id = pr.customer_id))
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS bcode,
           (SELECT ba.title FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS btitle
      FROM public.payment_receipts pr
     WHERE pr.status = 'approved'
       AND pr.destination_bank_account_id IS NOT NULL
       -- 350 / Gate A B1, owner answer (c): cash and cheque go to Asan by hand, so they must not
       -- appear in the automatic bank-deposit file. NULL is kept deliberately — it is what the
       -- bank branch stores until the phase-6 wizard collects the real sub-channel (C6).
       AND (pr.document_channel IS NULL
            OR pr.document_channel NOT IN ('cash', 'cheque'))
       AND pr.reversed_at IS NULL
       AND pr.payment_date BETWEEN _from AND _to
  )
  SELECT r.id,
         'واریز ' || to_char(r.pdate, 'YYYY-MM-DD') || ' — ' ||
           COALESCE(NULLIF(r.pname, ''), left(r.id::text, 8)),
         r.pdate,
         r.pname,
         r.pcode,
         r.tracking,
         r.amt,
         r.bcode,
         r.btitle,
         CASE
           WHEN r.pcode IS NULL OR btrim(r.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(r.pname, ''), '؟') || '» ثبت نشده است'
           WHEN r.bcode IS NULL
             THEN 'کد آسان حساب بانکی مقصد ثبت نشده است'
           WHEN r.amt IS NULL OR r.amt <= 0
             THEN 'مبلغ این واریز معتبر نیست'
           WHEN r.amt <> trunc(r.amt)
             THEN 'مبلغ این واریز عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           ELSE NULL
         END
    FROM r
   ORDER BY r.pdate, r.id;
END;
$function$;

COMMENT ON FUNCTION public.asan_list_bank_deposit_export(date, date) IS
  'Asan bank-deposit export. Approved receipts that landed in one of our bank accounts. '
  'Cash and cheque receipts are excluded (migration 350). Reversed receipts are excluded (364 / OG-14).';


CREATE OR REPLACE FUNCTION public.create_payment(p_channel text, p_payee_type text, p_payee_id uuid, p_amount numeric, p_payment_date date, p_source_account_id uuid, p_tracking_number text DEFAULT NULL::text, p_cheque_kind text DEFAULT NULL::text, p_cheque_number text DEFAULT NULL::text, p_cheque_due_date date DEFAULT NULL::date, p_endorsed_cheque_id uuid DEFAULT NULL::uuid, p_purchase_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_attachment_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(voucher_id uuid, document_number text, journal_entry_id uuid, new_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _channel        text := lower(btrim(coalesce(p_channel, '')));
  _payee_type     text := lower(btrim(coalesce(p_payee_type, '')));
  _cheque_kind    text := lower(btrim(coalesce(p_cheque_kind, '')));
  _voucher_id     uuid := gen_random_uuid();
  _doc_number     text;
  _entry_id       uuid;
  _person_id      uuid;
  _payee_name     text;
  _receiver_code  text;   -- their side: the party we paid
  _payer_code     text;   -- our side: the account the money leaves
  _account_type   text;
  _account_title  text;
  _is_active      boolean;
  _asan_code      text;
  _debit_kind     text;
  _credit_kind    text;
  _credit_ref     uuid;
  _doc_channel    text;
  _tracking       text;
  _cheque_number  text;
  _cheque_due     date;
  _endorsed       record;
  _debit_total    numeric;
  _credit_total   numeric;
  _balance        numeric;
  _debit_desc     text;
  _credit_desc    text;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Role gate (task 3.9).
  --
  -- OG-13 answer (a): create = admin, accountant, manager. The same boundary
  -- assign_document_number has enforced since 346, so a caller admitted here is
  -- never refused mid-transaction at the numbering step (phase-1 Gate A M3).
  -- The ARRAY is cast to app_role[] explicitly: has_any_role has a text[] and an
  -- app_role[] overload and an uncast array matches both (PGRST203 / 42725).
  ----------------------------------------------------------------------------
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند پرداخت را ندارید'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Argument validation (22023) — everything checkable without a table read.
  ----------------------------------------------------------------------------
  IF _channel NOT IN ('bank', 'cash', 'cheque') THEN
    RAISE EXCEPTION 'روش پرداخت نامعتبر است؛ یکی از bank / cash / cheque باید باشد'
      USING ERRCODE = '22023';
  END IF;

  IF _payee_type NOT IN ('supplier', 'external_party', 'customer') THEN
    IF _payee_type = 'other' THEN
      -- Contradiction C2. See the header: T3 needs a person, 'other' has none.
      RAISE EXCEPTION 'پرداخت به «سایر» از این مسیر ثبت نمی‌شود؛ ابتدا طرف حساب را به عنوان تأمین‌کننده، مشتری یا طرف حساب خارجی ثبت کنید تا کد آسان داشته باشد'
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'نوع دریافت‌کننده نامعتبر است؛ یکی از supplier / external_party / customer باید باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_payee_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ دریافت‌کننده الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد'
      USING ERRCODE = '22023';
  END IF;

  -- No fractional Toman (ledger-decisions Part 3, rule 3). The ×10 to Rial must
  -- be exact and the Asan export blocks on fractions anyway.
  IF p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ پرداخت باید عدد صحیح (تومان) باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ پرداخت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  -- Date bounds, mirroring migration 351 (Gate A M6) exactly. The rationale is
  -- identical on this side: a backdated entry lands in an Asan export window
  -- that may already have been submitted, and 343 immutability plus the absence
  -- of reverse_document (OG-14) mean it can never be moved or withdrawn. The
  -- two rules are refused separately so the message names the one that was hit.
  IF p_payment_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ پرداخت نمی‌تواند در آینده باشد'
      USING ERRCODE = '22023';
  END IF;

  IF public.jalali_year(p_payment_date) < public.jalali_year(public.tehran_today()) - 1 THEN
    RAISE EXCEPTION 'تاریخ پرداخت از سال % است و از سال گذشته قدیمی‌تر است؛ سال جاری %',
      public.jalali_year(p_payment_date), public.jalali_year(public.tehran_today())
      USING ERRCODE = '22023';
  END IF;

  -- The source account is required on every channel because
  -- payment_vouchers.source_bank_account_id is NOT NULL. For a cheque that is a
  -- record of which account the cheque is drawn on, not a movement — the ledger
  -- entry below credits a cheque account, never bank. Contradiction C3.
  IF p_source_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب مبدأ پرداخت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'bank'
     AND NULLIF(btrim(coalesce(p_tracking_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شمارهٔ پیگیری برای پرداخت بانکی الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'cheque' THEN
    IF _cheque_kind NOT IN ('own', 'endorsed') THEN
      RAISE EXCEPTION 'نوع چک نامعتبر است؛ own یا endorsed باید باشد'
        USING ERRCODE = '22023';
    END IF;
    IF _cheque_kind = 'own' AND NULLIF(btrim(coalesce(p_cheque_number, '')), '') IS NULL THEN
      RAISE EXCEPTION 'شمارهٔ چک برای چک خودمان الزامی است'
        USING ERRCODE = '22023';
    END IF;
    IF _cheque_kind = 'endorsed' AND p_endorsed_cheque_id IS NULL THEN
      RAISE EXCEPTION 'برای ظهرنویسی باید چک دریافتی را انتخاب کنید'
        USING ERRCODE = '22023';
    END IF;
  ELSIF _cheque_kind <> '' OR p_cheque_number IS NOT NULL
        OR p_cheque_due_date IS NOT NULL OR p_endorsed_cheque_id IS NOT NULL THEN
    -- Refuse loudly rather than silently discarding a value the caller sent.
    RAISE EXCEPTION 'اطلاعات چک فقط برای پرداخت چکی معتبر است'
      USING ERRCODE = '22023';
  END IF;

  -- p_attachment_ids is not wired, exactly as in create_receipt (Gate A m4):
  -- document_attachments.document_id is NOT NULL and validate_document_attachment_ref is a
  -- BEFORE INSERT existence trigger, so an attachment row cannot precede its document. Refuse
  -- loudly rather than accept a silent no-op. NULL and an empty array both mean "no attachments".
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ سند را ثبت کنید و پیوست را بعداً اضافه کنید'
      USING ERRCODE = '0A000';
  END IF;

  IF p_purchase_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.purchases WHERE id = p_purchase_id) THEN
    RAISE EXCEPTION 'خرید انتخاب‌شده یافت نشد'
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Resolve the payee, and the Asan-code precondition (task 3.5, T3).
  --
  -- The debit kind is chosen here, from payee_type, using only mappings
  -- validate_journal_line_ref already has (T13 constraint 1). See the header for
  -- why this is not keyed to a supplier unconditionally (T13 constraint 3).
  --
  -- require_asan_code has no SECURITY clause, so it is SECURITY INVOKER — verified
  -- from the live catalogue rather than assumed (task 3.5). Inside this SECURITY
  -- DEFINER function it therefore runs as this function's owner and sees every
  -- person_identifiers row, while a direct caller of require_asan_code gets only
  -- what that table's RLS grants them.
  ----------------------------------------------------------------------------
  IF _payee_type = 'supplier' THEN
    SELECT s.person_id, s.name, NULLIF(btrim(coalesce(s.accounting_code, '')), '')
      INTO _person_id, _payee_name, _receiver_code
      FROM public.suppliers s WHERE s.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'تأمین‌کننده یافت نشد' USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'supplier_payable';

  ELSIF _payee_type = 'external_party' THEN
    SELECT ep.person_id, ep.full_name, NULLIF(btrim(coalesce(ep.accounting_code, '')), ''), ep.is_active
      INTO _person_id, _payee_name, _receiver_code, _is_active
      FROM public.external_parties ep WHERE ep.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طرف حساب خارجی یافت نشد' USING ERRCODE = '22023';
    END IF;
    -- Matches pay_purchase_with_voucher's existing refusal, so the two writers
    -- agree on what an inactive party means.
    IF NOT coalesce(_is_active, false) THEN
      RAISE EXCEPTION 'طرف حساب خارجی «%» غیرفعال است و نمی‌توان به او پرداخت ثبت کرد', _payee_name
        USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'external_party';

  ELSE  -- customer
    SELECT c.person_id, c.name, NULLIF(btrim(coalesce(c.accounting_code, '')), '')
      INTO _person_id, _payee_name, _receiver_code
      FROM public.customers c WHERE c.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'مشتری یافت نشد' USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'customer_credit';
  END IF;

  -- T3. Called unconditionally and exactly once: it is the precondition, not a
  -- lookup, so it must run even when the role row already carries an
  -- accounting_code mirror. It raises P0001 naming the party. person_id is
  -- NOT NULL on all three role tables (measured: 29 of 29 persons-referencing
  -- FKs registered ok), so this is always reachable.
  --
  -- ground-truth §12 records a customer whose customers.accounting_code is set
  -- while person_identifiers has no row — the mirror can disagree with the
  -- identifier, and the export reads the identifier. The Asan code therefore
  -- wins over the mirror here, rather than the other way round.
  _asan_code := public.require_asan_code(_person_id);
  _receiver_code := coalesce(_asan_code, _receiver_code);

  ----------------------------------------------------------------------------
  -- 4. Resolve the credit side — where the money comes from.
  ----------------------------------------------------------------------------
  SELECT ba.title, NULLIF(btrim(coalesce(ba.accounting_code, '')), ''), ba.account_type
    INTO _account_title, _payer_code, _account_type
    FROM public.bank_accounts ba WHERE ba.id = p_source_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'حساب مبدأ یافت نشد' USING ERRCODE = '22023';
  END IF;

  IF _channel IN ('bank', 'cash') THEN
    -- Task 3.6, and the mirror of migration 351's B1 fix on the receipt side.
    -- D2 makes a cash box a bank_accounts row with account_type='cash'. Without
    -- this check a cash payment would credit a real bank account and understate
    -- it in vw_account_balances and get_account_ledger — the same wrong ledger
    -- entry 351 stopped on the receipt side, in the opposite direction.
    --
    -- CONSEQUENCE, recorded not hidden: this database has one bank_accounts row
    -- and it is account_type='bank', so every CASH payment is refused until the
    -- owner creates the صندوق. That is the intended outcome of the guard, the
    -- same as for cash receipts since 351 — not a defect.
    IF _channel = 'cash' AND _account_type IS DISTINCT FROM 'cash' THEN
      RAISE EXCEPTION 'پرداخت نقدی باید از صندوق انجام شود؛ حساب «%» از نوع صندوق نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;
    IF _channel = 'bank' AND _account_type IS DISTINCT FROM 'bank' THEN
      RAISE EXCEPTION 'پرداخت بانکی باید از حساب بانکی انجام شود؛ حساب «%» از نوع بانکی نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;

    IF _payer_code IS NULL THEN
      RAISE EXCEPTION 'کد حسابداری برای حساب «%» ثبت نشده است؛ بدون آن سند قابل ارسال به آسان نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;

    _credit_kind := 'bank';
    _credit_ref  := p_source_account_id;
    _credit_desc := 'خروج وجه از ' || coalesce(_account_title, 'حساب');

  ELSIF _cheque_kind = 'own' THEN
    -- Task 3.7. cheque_payable's targets are ARRAY['suppliers','external_parties']
    -- since migration 347 (OG-10: a cheque we issue may go to someone who is not a
    -- supplier). customers is NOT among them, and T13 constraint 1 forbids adding
    -- it, so an own cheque to a customer payee is refused rather than mis-keyed.
    IF _payee_type = 'customer' THEN
      RAISE EXCEPTION 'صدور چک در وجه مشتری از این مسیر پشتیبانی نمی‌شود؛ برای پرداخت به مشتری از روش بانکی استفاده کنید'
        USING ERRCODE = 'P0001';
    END IF;
    _credit_kind := 'cheque_payable';
    _credit_ref  := p_payee_id;
    _credit_desc := 'صدور چک شمارهٔ ' || btrim(p_cheque_number);

  ELSE  -- cheque, endorsed (task 3.8)
    -- The endorsed cheque is a received cheque: a payment_receipts row with
    -- document_channel='cheque'. There is no cheque register (A2 defers the
    -- lifecycle) — migration 354's header records how "the same cheque" was
    -- established. The credit keys to cheque_receivable -> customers, which
    -- validate_journal_line_ref already accepts (347 also allows external_parties).
    SELECT pr.id, pr.customer_id, pr.amount, pr.cheque_number, pr.document_channel
      INTO _endorsed
      FROM public.payment_receipts pr
     WHERE pr.id = p_endorsed_cheque_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'چک دریافتی انتخاب‌شده یافت نشد' USING ERRCODE = '22023';
    END IF;
    IF _endorsed.document_channel IS DISTINCT FROM 'cheque' THEN
      RAISE EXCEPTION 'سند انتخاب‌شده چک نیست و قابل ظهرنویسی نیست' USING ERRCODE = 'P0001';
    END IF;
    IF _endorsed.customer_id IS NULL THEN
      RAISE EXCEPTION 'چک دریافتی صادرکننده ندارد و قابل ظهرنویسی نیست' USING ERRCODE = 'P0001';
    END IF;
    IF _endorsed.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'مبلغ ظهرنویسی باید برابر مبلغ چک باشد؛ مبلغ چک % است', _endorsed.amount
        USING ERRCODE = 'P0001';
    END IF;

    -- Task 3.8's Accept: a second endorsement must raise. The UNIQUE index is the
    -- real guarantee — it holds against a concurrent second endorsement that this
    -- SELECT would not see. This check exists so the user gets a sentence instead
    -- of a constraint name.
    --
    -- 356 / Gate A B1: the predicate is UNCONDITIONAL. It used to exclude
    -- status='rejected', so rejecting a voucher freed its cheque — while the entry
    -- that voucher posted stayed posted and immutable (343). Re-endorsing then
    -- credited the SAME cheque twice, permanently. Owner decision 2026-08-19,
    -- option (a): one cheque is consumed once. The accepted cost is that a mistaken
    -- endorsement cannot be corrected until reverse_document exists (OG-14), and
    -- the message below says so to the user rather than leaving them guessing.
    IF EXISTS (SELECT 1 FROM public.payment_vouchers pv
                WHERE pv.endorsed_receipt_id = p_endorsed_cheque_id
                  AND pv.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'این چک قبلاً ظهرنویسی شده است و سند ظهرنویسی هنوز برگشت نخورده است'
        USING ERRCODE = 'P0001';
    END IF;

    _credit_kind   := 'cheque_receivable';
    _credit_ref    := _endorsed.customer_id;
    _cheque_number := _endorsed.cheque_number;
    _credit_desc   := 'ظهرنویسی چک دریافتی شمارهٔ ' || coalesce(_endorsed.cheque_number, '؟');
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Document number (T6), then the fields derived from it.
  --
  -- The id is minted here rather than by the INSERT's DEFAULT so the number can
  -- be assigned before the row exists, exactly as create_receipt does.
  --
  -- voucher_number is set to the SAME value. payment_vouchers already carries
  -- trg_payment_voucher_set_number, which mints 'PV-YYYY-NNNNN' from a sequence
  -- when voucher_number IS NULL — a second, parallel identity for one document.
  -- Supplying the PAY number suppresses it (the trigger only fills a NULL), so a
  -- payment has ONE number, and tg_burn_payment_document_number — which already
  -- burns document_numbers keyed by the voucher id — stays correct. Recorded as
  -- contradiction C6. The front end reads voucher_number as an opaque string
  -- (src/lib/treasury/queries.ts, _app.accounting.payment-vouchers.tsx:294) and
  -- does not parse the PV- prefix, so the change of format is safe.
  ----------------------------------------------------------------------------
  _doc_number := public.assign_document_number('payment', _voucher_id);

  -- document_channel is NOT NULL and its CHECK admits card_to_card | paya | pol |
  -- satna | cash | cheque | other — there is no 'bank' value. The real sub-channel
  -- is not known until the phase-6 wizard collects it, so a bank payment is stored
  -- as 'other' rather than guessing. Contradiction C7, the mirror of phase 2's C6.
  _doc_channel := CASE _channel
                    WHEN 'cash'   THEN 'cash'
                    WHEN 'cheque' THEN 'cheque'
                    ELSE 'other'
                  END;

  -- tracking_number is nullable here (unlike payment_receipts), so a non-bank
  -- payment does not need a minted value. A caller-supplied one is honoured on
  -- every channel — discarding a value the caller sent is a swallowed input
  -- (Gate A m5, the receipt side's lesson).
  _tracking := NULLIF(btrim(coalesce(p_tracking_number, '')), '');
  IF _tracking IS NULL AND _channel <> 'bank' THEN
    _tracking := 'INT-' || _doc_number;
  END IF;

  _cheque_number := coalesce(_cheque_number, NULLIF(btrim(coalesce(p_cheque_number, '')), ''));
  _cheque_due    := p_cheque_due_date;

  ----------------------------------------------------------------------------
  -- 6. The voucher row (task 3.3).
  --
  -- The payee columns are filled in the exact shape
  -- payment_vouchers_payee_matches_type_chk already requires — reused, not
  -- replaced (ground-truth §5). payee_person_id is left to
  -- trg_payment_vouchers_derive_person, which already resolves it from whichever
  -- payee column is set; T13 constraint 2 is satisfied by an existing trigger at
  -- zero cost, and it is asserted below rather than trusted.
  ----------------------------------------------------------------------------
  INSERT INTO public.payment_vouchers (
    id, voucher_number, amount, payment_date, payee_type,
    payee_supplier_id, payee_party_id, payee_customer_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, endorsed_receipt_id,
    description, status, purchase_id, created_by
  ) VALUES (
    _voucher_id, _doc_number, p_amount, p_payment_date, _payee_type,
    CASE WHEN _payee_type = 'supplier'       THEN p_payee_id END,
    CASE WHEN _payee_type = 'external_party' THEN p_payee_id END,
    CASE WHEN _payee_type = 'customer'       THEN p_payee_id END,
    NULL,
    _doc_channel, p_source_account_id, _tracking,
    _cheque_number, _cheque_due,
    CASE WHEN _channel = 'cheque' AND _cheque_kind = 'endorsed' THEN p_endorsed_cheque_id END,
    coalesce(p_description, 'سند پرداخت ' || _doc_number),
    'approved', p_purchase_id, _uid
  );

  -- T13 constraint 2, asserted rather than assumed.
  IF (SELECT pv.payee_person_id FROM public.payment_vouchers pv WHERE pv.id = _voucher_id)
     IS DISTINCT FROM _person_id THEN
    RAISE EXCEPTION 'شناسهٔ شخص دریافت‌کننده ثبت نشد؛ ثبت سند لغو شد'
      USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 7. The journal entry (task 3.4).
  --
  -- doc_kind is passed explicitly: 341 dropped its DEFAULT on purpose so an
  -- omission fails loudly instead of becoming 'other'.
  ----------------------------------------------------------------------------
  _debit_desc := 'کاهش بدهی به «' || coalesce(_payee_name, '؟') || '»';

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code
  ) VALUES (
    'payment', 'payment_voucher', _voucher_id, p_payment_date,
    'سند پرداخت شمارهٔ ' || _doc_number,
    'posted', _uid, _payer_code, _receiver_code
  )
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES
    (_entry_id, 1, _debit_kind,  p_payee_id,  p_amount, 0, _debit_desc),
    (_entry_id, 2, _credit_kind, _credit_ref, 0, p_amount, _credit_desc);

  -- Balance or nothing (ledger-decisions Part 3, rule 1). An unbalanced document
  -- is dropped from the Asan export entirely, so it must be refused at creation
  -- rather than created and silently withheld.
  SELECT coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    INTO _debit_total, _credit_total
    FROM public.journal_lines jl
   WHERE jl.journal_entry_id = _entry_id;

  IF _debit_total <> _credit_total THEN
    RAISE EXCEPTION
      'سند حسابداری متوازن نیست: جمع بدهکار % و جمع بستانکار % است',
      _debit_total, _credit_total
      USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 8. The payee's balance after this payment, in the convention recorded in
  --    the header. Positive means "still owed to them" for the liability-side
  --    kinds and "still owed to us" for customer_credit. It is computed from the
  --    ledger rather than from a cached column because no cached balance exists
  --    on the payment side — there is no supplier equivalent of
  --    customer_credit_balance, and inventing one is T9's business, not phase 3's.
  ----------------------------------------------------------------------------
  SELECT CASE WHEN _debit_kind = 'customer_credit'
              THEN coalesce(sum(jl.debit - jl.credit), 0)
              ELSE coalesce(sum(jl.credit - jl.debit), 0)
         END
    INTO _balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'posted'
     AND jl.account_kind = _debit_kind
     AND jl.account_ref_id = p_payee_id;

  ----------------------------------------------------------------------------
  -- 9. Audit (audit-trigger-spec.md §2), in the same transaction.
  --
  -- audit_logs has no dedicated journal_entry_id / document_number / amount /
  -- counterparty columns, so those fields go into diff jsonb — the same shape
  -- create_receipt uses.
  ----------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid, 'payment_voucher', _voucher_id::text, 'payment_created',
    jsonb_build_object(
      'document_number',   _doc_number,
      'journal_entry_id',  _entry_id,
      'amount',            p_amount,
      'payment_date',      p_payment_date,
      'channel',           _channel,
      'document_channel',  _doc_channel,
      'payee_type',        _payee_type,
      'payee_id',          p_payee_id,
      'payee_person_id',   _person_id,
      'debit_account_kind',  _debit_kind,
      'credit_account_kind', _credit_kind,
      'source_account_id', p_source_account_id,
      'cheque_kind',       NULLIF(_cheque_kind, ''),
      'endorsed_receipt_id', CASE WHEN _cheque_kind = 'endorsed' THEN p_endorsed_cheque_id END,
      'purchase_id',       p_purchase_id,
      'tracking_number',   _tracking
    ));

  RETURN QUERY SELECT _voucher_id, _doc_number, _entry_id, _balance;
END;
$function$

;
