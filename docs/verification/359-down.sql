-- 359-down.sql — reverse migration 359 (cheque documents excluded from the bank balance, OG-18;
--                and the customer-payee label in the journal export).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 359 CHANGED, and what this puts back — the definitions captured with pg_get_viewdef /
-- pg_get_functiondef immediately before it was applied (CLAUDE.md rule 6), so the revert is the
-- previous text rather than a re-authoring:
--
--   1. vw_account_balances        — inflow and outflow CTEs lose their cheque predicate
--   2. get_account_ledger         — all four cheque predicates removed
--   3. asan_list_journal_export   — loses the customers join and the cu.name branch
--
-- READ THIS BEFORE RUNNING IT.
--
-- Reverting reopens phase-3 Gate A defect M1 / OG-18: a cheque reduces (or raises) the displayed
-- bank balance on the day the document is written, although no money moves until it clears. Gate A
-- reproduced it — total_out went 0 -> 900,000 while the journal entry carried no bank line at all.
-- The ledger is unaffected either way: create_payment credits cheque_payable or cheque_receivable
-- and create_receipt debits cheque_receivable, never bank. Reverting puts the two views back OUT of
-- agreement with the ledger.
--
-- It also reopens the smaller defect: a payment whose payee is a customer renders in the Asan
-- journal export as «؟».
--
-- Order does not matter — the three objects are independent and none is dropped, so each is simply
-- replaced. Signatures are unchanged by both 359 and this file, so no overload is created (rule 5).

SET client_encoding = 'UTF8';

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
                  GROUP BY pr.destination_bank_account_id
                ), outflow AS (
                 SELECT pv.source_bank_account_id AS account_id,
                    COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                    count(*) AS out_count
                   FROM payment_vouchers pv
                  WHERE pv.status = 'approved'::text
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
                     AND pr.status = 'approved' AND pr.payment_date < p_from_date), 0)
      - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
                   WHERE pv.source_bank_account_id = p_account_id
                     AND pv.status = 'approved' AND pv.payment_date < p_from_date), 0);
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
$function$

;

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
  IF _filter IS NULL OR _filter NOT IN ('all', 'receipt', 'payment', 'third_party', 'settlement') THEN
    RAISE EXCEPTION 'نوع سند حسابداری برای خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT je.id, je.entry_date AS edate, je.description AS edesc, je.source_type, je.source_id
      FROM public.journal_entries je
     WHERE je.status = 'posted'
       AND je.entry_date BETWEEN _from AND _to
  ),
  -- One sentence per DOCUMENT, assembled from whichever source table backs it.
  -- Every fragment is guarded, so a source row missing a tracking number or a
  -- note simply contributes nothing instead of producing "پیگیری " with a hole
  -- after it.
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
                          NULLIF(btrim(COALESCE(pv.payee_name, '')), ''),
                          '؟') || '»',
                        NULLIF('پیگیری ' || btrim(COALESCE(pv.tracking_number, '')), 'پیگیری '),
                        NULLIF(btrim(COALESCE(pv.description, '')), ''))
                 FROM public.payment_vouchers pv
                 LEFT JOIN public.suppliers s         ON s.id  = pv.payee_supplier_id
                 LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
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
             ELSE NULL
           END AS rich
      FROM e
  ),
  l AS (
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
               -- Migration 308/309 mirror the Asan person code onto
               -- suppliers.accounting_code, so prefer the mirror and fall back
               -- to the identifier it is mirrored from. Same two-step the
               -- customer side does, just with the mirror available.
               (SELECT COALESCE(
                         NULLIF(btrim(COALESCE(s.accounting_code, '')), ''),
                         (SELECT pi.value_normalized FROM public.person_identifiers pi
                           WHERE pi.person_id = s.person_id
                             AND pi.kind = 'asan_person_code' LIMIT 1))
                  FROM public.suppliers s WHERE s.id = jl.account_ref_id)
             ELSE
               -- invoice_ar resolves from the owner's configuration; clearing and other have no
               -- row, so they still resolve to NULL and still block.
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
               -- Configured label first: an operator's own wording always wins.
               (SELECT ca.label_fa FROM public.asan_control_accounts ca
                 WHERE ca.account_kind = jl.account_kind),
               -- 358 / Gate A M2 (phase 3), and phase-2 Gate A m3 before it. asan_control_accounts
               -- cannot hold a row for the cheque kinds at all — its account_kind CHECK admits only
               -- invoice_ar | clearing | other, and accounting_code is NOT NULL — so the fallback
               -- below is where a Persian name has to come from. D16 makes Persian messages part of
               -- the contract, and this expression is what leaked «cheque_payable» into one.
               -- NAME ONLY: acode is untouched, so what the export blocks and how it classifies are
               -- exactly as before.
               CASE jl.account_kind
                 WHEN 'cheque_receivable' THEN 'چک‌های دریافتنی'
                 WHEN 'cheque_payable'    THEN 'چک‌های پرداختنی'
                 WHEN 'invoice_ar'        THEN 'حساب کنترلی دریافتنی'
                 WHEN 'clearing'          THEN 'حساب واسط (تسویه)'
                 WHEN 'other'             THEN 'سایر حساب‌های کنترلی'
               END,
               -- Last resort. If a new account_kind is added to the CHECK and nobody names it here,
               -- the identifier still surfaces — deliberately, because a silent «؟» would hide the
               -- omission from whoever added the kind.
               jl.account_kind)
           END AS aname
      FROM public.journal_lines jl
     WHERE jl.journal_entry_id IN (SELECT id FROM e)
  ),
  agg AS (
    SELECT l.eid,
           COUNT(*) AS n,
           SUM(l.debit) AS tdebit,
           SUM(l.credit) AS tcredit,
           bool_or(l.akind = 'external_party') AS has_external,
           SUM(CASE WHEN l.akind = 'bank' THEN l.debit - l.credit ELSE 0 END) AS bank_net,
           bool_or(l.debit <> trunc(l.debit) OR l.credit <> trunc(l.credit)) AS frac,
           (ARRAY_AGG(l.akind ORDER BY l.lno)
              FILTER (WHERE l.acode IS NULL))[1] AS bad_kind,
           (ARRAY_AGG(COALESCE(l.aname, '؟') ORDER BY l.lno)
              FILTER (WHERE l.acode IS NULL))[1] AS bad_name
      FROM l GROUP BY l.eid
  ),
  k AS (
    SELECT e.id AS eid,
           CASE
             -- source_type wins over the bank-sign heuristic: a pure offset
             -- settlement moves no cash at all, so the heuristic would call it
             -- 'unclassified' and drop it out of every filtered export.
             WHEN e.source_type = 'mutual_settlement' THEN 'settlement'
             WHEN COALESCE(a.has_external, false) THEN 'third_party'
             WHEN COALESCE(a.bank_net, 0) > 0 THEN 'receipt'
             WHEN COALESCE(a.bank_net, 0) < 0 THEN 'payment'
             ELSE 'unclassified'
           END AS dkind
      FROM e LEFT JOIN agg a ON a.eid = e.id
  )
  SELECT e.id,
         'سند ' || to_char(e.edate, 'YYYY-MM-DD') || ' — ' || left(e.id::text, 8),
         e.edate,
         k.dkind,
         COALESCE(
           (SELECT l2.aname FROM l l2
             WHERE l2.eid = e.id AND l2.akind <> 'bank'
             ORDER BY l2.lno LIMIT 1),
           e.source_type),
         CASE
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این سند حسابداری هیچ ردیفی ندارد'
           -- `invoice_ar` is no longer named here: it resolves. If its row were ever deleted it
           -- would fall through to the generic message below, naming the control account.
           WHEN a.bad_kind = 'clearing'
             THEN 'حساب واسط در آسان وجود ندارد؛ این سند باید به‌صورت دریافت نقد و پرداخت نقد ثبت شود'
           WHEN a.bad_kind = 'other'
             THEN 'نوع حساب «other» هنوز تعریف نشده است و کد آسان ندارد'
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
         l.lno, l.acode,
         NULL::text,
         -- Staged, and the last stage is a literal so this is never empty.
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
         l.debit, l.credit,
         a.tdebit, a.tcredit
    FROM e
    JOIN k ON k.eid = e.id
    LEFT JOIN l ON l.eid = e.id
    LEFT JOIN agg a ON a.eid = e.id
    LEFT JOIN enr ON enr.eid = e.id
   WHERE _filter = 'all' OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
END;
$function$

;
