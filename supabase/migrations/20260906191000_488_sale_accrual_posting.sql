SET client_encoding='UTF8';

-- ============================================================================
-- 488 - a sale becomes a receivable: post an accrual when a quote is accepted.
-- ============================================================================
--
-- D-26. Debit «طلب مشتریان» (1100, control) against the customer subledger,
-- credit «فروش» (4000). Amount = sales_quotes.final_amount.
--
-- HAZARD H·a -- A QUOTE CAN BE BORN 'accepted'. THIS IS WHY THE TRIGGER COVERS
-- INSERT AS WELL AS UPDATE.
-- ---------------------------------------------------------------------------
-- sales_quotes_validate_status fires BEFORE INSERT too, and its own body says so
-- verbatim (lines 33-38 of the live definition):
--
--   -- A quote can also be born accepted: this trigger fires BEFORE INSERT as well, because a plain
--   -- INSERT with status='accepted' does not pass through the transition logic above and would
--   -- otherwise leave accepted_at NULL forever -- see the header for why "forever" is literal.
--   IF tg_op = 'INSERT' AND new.status = 'accepted' THEN
--
-- An AFTER UPDATE OF status trigger alone would silently miss every such row --
-- no error, no entry, a receivable that simply never exists. The trigger below is
-- AFTER INSERT OR UPDATE OF status, and the "was it already accepted?" test lives
-- in the body rather than in a WHEN clause, because a WHEN clause cannot reference
-- OLD on the INSERT arm.
--
-- THE HOOK THE RESEARCH LOCATED
-- ---------------------------------------------------------------------------
-- update_sales_quote_status lines 127-129 already does exactly this shape of work
-- on acceptance, quoted from the live body:
--
--   IF p_next = 'accepted'::public.sales_quote_status THEN
--     PERFORM public.hold_credit_for_quote(p_quote_id, auth.uid());
--   END IF;
--
-- A trigger is used rather than a third PERFORM inside that RPC precisely because
-- the RPC is not the only way a quote reaches 'accepted' (see H·a above).
--
-- IDEMPOTENT
-- ---------------------------------------------------------------------------
-- Two layers. The explicit guard returns the existing entry, and underneath it
-- journal_entries_source_unique (source_type, source_id) is a UNIQUE constraint,
-- so even a concurrent double-accept cannot produce a second entry.
--
-- CUTOFF -- D-28, NO BACKFILL
-- ---------------------------------------------------------------------------
-- Only quotes accepted after this migration's own timestamp are posted. The 9
-- quotes already 'accepted' are in a final state and can never transition again,
-- so the trigger could not fire for them in any case; the cutoff is the explicit,
-- readable statement of D-28 rather than a reliance on that accident.
--
-- WHY account_kind = 'customer_credit' ON THE DEBIT LINE
-- ---------------------------------------------------------------------------
-- That is this database's existing person subledger: validate_journal_line_ref
-- maps 'customer_credit' -> customers and enforces it. There is no per-customer
-- receivable account and CONTRACTS Q-2 does not create one; the chart's 1100 is a
-- CONTROL account whose detail is the subledger, which is what is_control means.
-- The credit side uses 'other', which that validator treats as a control account
-- with nothing to check, and carries account_id -> chart_of_accounts instead.
--
-- KNOWN CONSEQUENCE, REPORTED NOT HIDDEN: person_settlement_position sums
-- (debit - credit) over customer_credit lines with no reversal filter. Accrual
-- debits are the first thing ever to debit that kind from a SALE, so the number
-- that page shows will move. That is D-31 work and is deliberately not touched
-- here; it is named in the delivery report as a remaining risk.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_sale_accrual(p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- D-28 cutoff: this migration's own moment. Nothing accepted before it is posted.
  _cutoff      constant timestamptz := '2026-09-06 19:10:00+03:30';
  _quote       record;
  _entry_id    uuid;
  _amount      numeric;
  _acct_ar     uuid;
  _acct_sales  uuid;
  _debit_total numeric;
  _credit_total numeric;
BEGIN
  SELECT q.id, q.customer_id, q.final_amount, q.quote_number, q.status, q.accepted_at
    INTO _quote
    FROM public.sales_quotes q
   WHERE q.id = p_quote_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _quote.status <> 'accepted'::public.sales_quote_status THEN
    RETURN NULL;
  END IF;

  -- D-28. No backfill, no opening balances.
  IF COALESCE(_quote.accepted_at, now()) < _cutoff THEN
    RETURN NULL;
  END IF;

  -- Idempotency, layer 1.
  SELECT je.id INTO _entry_id
    FROM public.journal_entries je
   WHERE je.source_type = 'sales_quote_accrual'
     AND je.source_id = p_quote_id;
  IF _entry_id IS NOT NULL THEN
    RETURN _entry_id;
  END IF;

  _amount := COALESCE(_quote.final_amount, 0);
  IF _amount <= 0 THEN
    RETURN NULL;   -- nothing to accrue; not an error
  END IF;

  SELECT id INTO _acct_ar    FROM public.chart_of_accounts WHERE code = '1100';
  SELECT id INTO _acct_sales FROM public.chart_of_accounts WHERE code = '4000';
  IF _acct_ar IS NULL OR _acct_sales IS NULL THEN
    RAISE EXCEPTION 'کدینگ حساب برای ثبت سند تعهدی فروش کامل نیست (۱۱۰۰ یا ۴۰۰۰ یافت نشد).'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description, status, posted_by
  ) VALUES (
    'sale_accrual', 'sales_quote_accrual', p_quote_id, public.tehran_today(),
    'سند تعهدی فروش بابت پیش‌فاکتور ' || COALESCE(_quote.quote_number, p_quote_id::text),
    'posted', auth.uid()
  )
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, account_id, debit, credit, description
  ) VALUES
    (_entry_id, 1, 'customer_credit', _quote.customer_id, _acct_ar,    _amount, 0,
     'طلب از مشتری بابت پیش‌فاکتور ' || COALESCE(_quote.quote_number, '')),
    (_entry_id, 2, 'other',           NULL,               _acct_sales, 0,       _amount,
     'فروش بابت پیش‌فاکتور ' || COALESCE(_quote.quote_number, ''));

  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO _debit_total, _credit_total
    FROM public.journal_lines WHERE journal_entry_id = _entry_id;

  IF _debit_total <> _credit_total OR _debit_total <> _amount THEN
    RAISE EXCEPTION 'سند تعهدی فروش تراز نیست: بدهکار % و بستانکار %', _debit_total, _credit_total
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'sales_quote', p_quote_id::text, 'sale_accrual_posted',
    jsonb_build_object(
      'journal_entry_id', _entry_id,
      'quote_number',     _quote.quote_number,
      'customer_id',      _quote.customer_id,
      'amount',           _amount));

  RETURN _entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_sale_accrual(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_sale_accrual(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.post_sale_accrual(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- The trigger. INSERT *and* UPDATE -- see H·a in this file's header.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_sales_quote_post_accrual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'accepted'::public.sales_quote_status THEN
    RETURN NULL;
  END IF;

  -- Only the transition INTO accepted posts. Re-saving an already-accepted quote
  -- must not post a second time (post_sale_accrual is idempotent regardless).
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted'::public.sales_quote_status THEN
    RETURN NULL;
  END IF;

  PERFORM public.post_sale_accrual(NEW.id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sales_quote_post_accrual ON public.sales_quotes;
CREATE TRIGGER trg_sales_quote_post_accrual
  AFTER INSERT OR UPDATE OF status ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_quote_post_accrual();

-- ============================================================================
-- HAZARD H·f -- keep accrual documents OUT of the Asan export, as part of
-- building them rather than as an afterthought discovered by L-9.
-- ============================================================================
-- asan_list_journal_export selects from journal_entries directly and its final
-- clause is `WHERE _filter = 'all' OR ...`, so under 'all' EVERY posted entry in
-- range is exported. Nothing filtered by an allow-list of doc_kind. The single
-- added clause below is in the source CTE, so it applies to all six filter
-- values, not merely the four the UI sends.
--
-- The body that follows is the LIVE definition read with pg_get_functiondef
-- immediately before this migration (CLAUDE.md rule 2), reproduced byte for byte
-- with exactly one clause inserted. Nothing else in it is changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asan_list_journal_export(_from date, _to date, _filter text)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, doc_kind text, party_name text, blocked_reason text, line_no integer, account_code text, product_code text, line_description text, description_quality text, quantity numeric, debit numeric, credit numeric, doc_debit numeric, doc_credit numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از اسناد حسابداری را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;
  IF _filter IS NULL OR _filter NOT IN (
       'all', 'receipt', 'payment', 'third_party', 'settlement', 'purchase_and_settlement'
     ) THEN
    RAISE EXCEPTION 'نوع سند حسابداری برای خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT je.id,
           je.entry_date AS edate,
           je.description AS edesc,
           je.source_type,
           je.source_id,
           je.doc_kind AS stored_kind
      FROM public.journal_entries je
     WHERE je.status = 'posted'
       AND je.entry_date BETWEEN _from AND _to
       -- H·f / D-30 (wave 6): accrual documents are OURS, not Asan's. Without this line
       -- the _filter = 'all' arm below exports every posted entry in range, which would
       -- put sale_accrual / purchase_accrual rows into the Asan journal file the moment
       -- the first one is posted. Excluded here, at the source CTE, so EVERY filter value
       -- drops them rather than only the four the UI sends.
       AND je.doc_kind NOT IN ('sale_accrual', 'purchase_accrual')
       -- T15 / owner 2026-08-19: both legs of a reversed pair leave the file.
       -- The reversal row has reverses_entry_id set (and a *new* source_id that is
       -- not the original receipt). The original keeps reverses_entry_id NULL;
       -- a posted row pointing at it is the authoritative "this has been reversed".
       AND je.reverses_entry_id IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM public.journal_entries r
              WHERE r.reverses_entry_id = je.id
                AND r.status = 'posted')
       -- Cheque: source document_channel, or a cheque_* line. Mixed bank+cheque
       -- cannot occur on create_receipt / create_payment (exclusive channel);
       -- if it did, the whole document is dropped, never a partial row.
       AND NOT EXISTS (
             SELECT 1 FROM public.journal_lines jl
              WHERE jl.journal_entry_id = je.id
                AND jl.account_kind IN ('cheque_receivable', 'cheque_payable'))
       AND NOT EXISTS (
             SELECT 1 FROM public.payment_receipts pr
              WHERE je.source_type = 'payment_receipt'
                AND pr.id = je.source_id
                AND pr.document_channel = 'cheque')
       AND NOT EXISTS (
             SELECT 1 FROM public.payment_vouchers pv
              WHERE je.source_type = 'payment_voucher'
                AND pv.id = je.source_id
                AND pv.document_channel = 'cheque')
  ),
  enr AS (
    SELECT e.id AS eid,
           CASE e.source_type
             WHEN 'payment_receipt' THEN (
               SELECT concat_ws(' — ',
                        'واریز از «' || COALESCE(NULLIF(btrim(pr.payer_name), ''), '؟') || '»',
                        NULLIF('پیگیری ' || btrim(COALESCE(pr.tracking_number, '')), 'پیگیری '),
                        NULLIF(btrim(COALESCE(pr.description, '')), ''))
                 FROM public.payment_receipts pr WHERE pr.id = e.source_id)
             WHEN 'payment_voucher' THEN (
               SELECT concat_ws(' — ',
                        'پرداخت به «' || COALESCE(
                          NULLIF(btrim(COALESCE(s.name, '')), ''),
                          NULLIF(btrim(COALESCE(ep.full_name, '')), ''),
                          NULLIF(btrim(COALESCE(cu.name, '')), ''),
                          NULLIF(btrim(COALESCE(pv.payee_name, '')), ''),
                          '؟') || '»',
                        NULLIF('پیگیری ' || btrim(COALESCE(pv.tracking_number, '')), 'پیگیری '),
                        NULLIF(btrim(COALESCE(pv.description, '')), ''))
                 FROM public.payment_vouchers pv
                 LEFT JOIN public.suppliers s         ON s.id  = pv.payee_supplier_id
                 LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
                 LEFT JOIN public.customers cu        ON cu.id = pv.payee_customer_id
                WHERE pv.id = e.source_id)
             WHEN 'mutual_settlement' THEN (
               SELECT concat_ws(' — ',
                        'تسویهٔ متقابل با «' || COALESCE(NULLIF(btrim(pp.display_name), ''), '؟') || '»',
                        CASE WHEN ms.offset_amount > 0
                             THEN 'تهاتر ' || to_char(ms.offset_amount, 'FM999999999999990') END,
                        CASE WHEN ms.cash_amount > 0
                             THEN 'نقدی ' || to_char(ms.cash_amount, 'FM999999999999990') END,
                        NULLIF(btrim(COALESCE(ms.note, '')), ''))
                 FROM public.mutual_settlements ms
                 JOIN public.persons pp ON pp.id = ms.person_id
                WHERE ms.id = e.source_id)
             WHEN 'dual_document' THEN (
               SELECT concat_ws(' — ',
                        'سند دوطرفه',
                        NULLIF('پیگیری ' || btrim(COALESCE(dd.tracking_number, '')), 'پیگیری '),
                        NULLIF(btrim(COALESCE(dd.description, '')), ''))
                 FROM public.dual_documents dd WHERE dd.id = e.source_id)
             ELSE NULL
           END AS rich
      FROM e
  ),
  l_all AS (
    SELECT jl.journal_entry_id AS eid,
           jl.line_no AS lno,
           jl.account_kind AS akind,
           jl.description AS ldesc,
           jl.debit, jl.credit,
           CASE jl.account_kind
             WHEN 'customer_credit' THEN
               (SELECT pi.value_normalized FROM public.person_identifiers pi
                  JOIN public.customers c ON c.person_id = pi.person_id
                 WHERE c.id = jl.account_ref_id AND pi.kind = 'asan_person_code' LIMIT 1)
             WHEN 'bank' THEN
               (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
                 WHERE ba.id = jl.account_ref_id)
             WHEN 'external_party' THEN
               (SELECT NULLIF(btrim(ep.accounting_code), '') FROM public.external_parties ep
                 WHERE ep.id = jl.account_ref_id)
             WHEN 'supplier_payable' THEN
               (SELECT COALESCE(
                         NULLIF(btrim(COALESCE(s.accounting_code, '')), ''),
                         (SELECT pi.value_normalized FROM public.person_identifiers pi
                           WHERE pi.person_id = s.person_id
                             AND pi.kind = 'asan_person_code' LIMIT 1))
                  FROM public.suppliers s WHERE s.id = jl.account_ref_id)
             ELSE
               (SELECT NULLIF(btrim(ca.accounting_code), '') FROM public.asan_control_accounts ca
                 WHERE ca.account_kind = jl.account_kind)
           END AS acode,
           CASE jl.account_kind
             WHEN 'customer_credit' THEN
               (SELECT c.name FROM public.customers c WHERE c.id = jl.account_ref_id)
             WHEN 'bank' THEN
               (SELECT ba.title FROM public.bank_accounts ba WHERE ba.id = jl.account_ref_id)
             WHEN 'external_party' THEN
               (SELECT ep.full_name FROM public.external_parties ep WHERE ep.id = jl.account_ref_id)
             WHEN 'supplier_payable' THEN
               (SELECT s.name FROM public.suppliers s WHERE s.id = jl.account_ref_id)
             ELSE COALESCE(
               (SELECT ca.label_fa FROM public.asan_control_accounts ca
                 WHERE ca.account_kind = jl.account_kind),
               CASE jl.account_kind
                 WHEN 'cheque_receivable' THEN 'چک‌های دریافتنی'
                 WHEN 'cheque_payable'    THEN 'چک‌های پرداختنی'
                 WHEN 'invoice_ar'        THEN 'حساب کنترلی دریافتنی'
                 WHEN 'clearing'          THEN 'حساب واسط (تسویه)'
                 WHEN 'other'             THEN 'سایر حساب‌های کنترلی'
               END,
               jl.account_kind)
           END AS aname
      FROM public.journal_lines jl
     WHERE jl.journal_entry_id IN (SELECT id FROM e)
  ),
  l AS (
    SELECT * FROM l_all
     WHERE akind NOT IN ('cheque_receivable', 'cheque_payable')
  ),
  agg AS (
    SELECT l.eid,
           COUNT(*) AS n,
           SUM(l.debit) AS tdebit,
           SUM(l.credit) AS tcredit,
           bool_or(l.debit <> trunc(l.debit) OR l.credit <> trunc(l.credit)) AS frac,
           (ARRAY_AGG(l.akind ORDER BY l.lno)
              FILTER (WHERE l.acode IS NULL))[1] AS bad_kind,
           (ARRAY_AGG(COALESCE(l.aname, '؟') ORDER BY l.lno)
              FILTER (WHERE l.acode IS NULL))[1] AS bad_name
      FROM l GROUP BY l.eid
  ),
  k AS (
    SELECT e.id AS eid,
           CASE e.stored_kind
             WHEN 'dual' THEN 'third_party'
             WHEN 'receipt' THEN 'receipt'
             WHEN 'payment' THEN 'payment'
             WHEN 'settlement' THEN 'settlement'
             WHEN 'purchase_payment' THEN 'purchase_payment'
             ELSE CASE
                    WHEN e.source_type = 'mutual_settlement' THEN 'settlement'
                    ELSE 'unclassified'
                  END
           END AS dkind
      FROM e
  )
  SELECT e.id,
         'سند ' || to_char(e.edate, 'YYYY-MM-DD') || ' — ' || left(e.id::text, 8),
         e.edate,
         k.dkind,
         COALESCE(
           (SELECT l2.aname FROM l_all l2
             WHERE l2.eid = e.id AND l2.akind NOT IN ('bank', 'cheque_receivable', 'cheque_payable')
             ORDER BY l2.lno LIMIT 1),
           e.source_type),
         CASE
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این سند حسابداری هیچ ردیفی ندارد'
           WHEN a.bad_kind = 'clearing'
             THEN 'حساب واسط در آسان وجود ندارد؛ این سند باید به‌صورت دریافت نقد و پرداخت نقد ثبت شود'
           WHEN a.bad_kind = 'other'
             THEN 'نوع حساب «سایر» هنوز تعریف نشده است و کد آسان ندارد'
           WHEN a.bad_kind = 'supplier_payable'
             THEN 'کد آسان تأمین‌کننده «' || COALESCE(NULLIF(a.bad_name, ''), '؟') ||
                  '» ثبت نشده است؛ در صفحهٔ تأمین‌کنندگان کد حسابداری او را وارد کنید'
           WHEN a.bad_kind IS NOT NULL
             THEN 'کد حساب آسان برای «' || COALESCE(NULLIF(a.bad_name, ''), '؟') || '» ثبت نشده است'
           WHEN COALESCE(a.frac, false)
             THEN 'مبالغ این سند عدد صحیح تومانی نیستند و قابل تبدیل دقیق به ریال نیستند'
           WHEN a.tdebit IS DISTINCT FROM a.tcredit
             THEN 'سند تراز نیست: بدهکار ' || to_char(a.tdebit, 'FM999999999999990') ||
                  ' و بستانکار ' || to_char(a.tcredit, 'FM999999999999990')
           ELSE NULL
         END,
         l.lno,
         l.acode,
         NULL::text,
         COALESCE(
           NULLIF(btrim(concat_ws(' — ',
             NULLIF(btrim(COALESCE(enr.rich, '')), ''),
             NULLIF(btrim(COALESCE(l.ldesc, '')), ''))), ''),
           NULLIF(btrim(COALESCE(l.ldesc, '')), ''),
           NULLIF(btrim(COALESCE(e.edesc, '')), ''),
           NULLIF(btrim(COALESCE(l.aname, '')), ''),
           'سند حسابداری'),
         CASE WHEN NULLIF(btrim(COALESCE(enr.rich, '')), '') IS NOT NULL
              THEN 'rich' ELSE 'simple' END,
         NULL::numeric,
         l.debit,
         l.credit,
         a.tdebit, a.tcredit
    FROM e
    JOIN k ON k.eid = e.id
    LEFT JOIN l ON l.eid = e.id
    LEFT JOIN agg a ON a.eid = e.id
    LEFT JOIN enr ON enr.eid = e.id
   WHERE _filter = 'all'
      OR (_filter = 'purchase_and_settlement' AND k.dkind IN ('purchase_payment', 'settlement'))
      OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
END;
$function$
;

-- Grants unchanged from the original: authenticated keeps EXECUTE, anon never had it.
REVOKE ALL ON FUNCTION public.asan_list_journal_export(date, date, text) FROM anon;
