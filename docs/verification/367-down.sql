-- 367-down.sql — restore asan_list_journal_export to the body live immediately before 367
-- (migration 366). Captured from 20260819170000_366_asan_journal_export_doc_kind.sql.
-- Identity arguments: date, date, text. STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK.
-- Signature unchanged, so 294-down DROP FUNCTION IF EXISTS
-- public.asan_list_journal_export(date, date, text) remains valid.
-- 366-down.sql is still the reverse of 366 only: it restores the pre-366 heuristic body.
-- After 367, roll 367-down first, then 366-down if going further back.

SET client_encoding = 'UTF8';

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
    SELECT je.id,
           je.entry_date AS edate,
           je.description AS edesc,
           je.source_type,
           je.source_id,
           je.doc_kind AS stored_kind
      FROM public.journal_entries je
     WHERE je.status = 'posted'
       AND je.entry_date BETWEEN _from AND _to
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
  had_chq AS (
    SELECT eid FROM l_all
     WHERE akind IN ('cheque_receivable', 'cheque_payable')
     GROUP BY eid
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
             ELSE CASE
                    WHEN e.source_type = 'mutual_settlement' THEN 'settlement'
                    ELSE 'unclassified'
                  END
           END AS dkind
      FROM e
  ),
  skip_chq AS (
    SELECT e.id AS eid
      FROM e
      JOIN had_chq h ON h.eid = e.id
      LEFT JOIN agg a ON a.eid = e.id
     WHERE COALESCE(a.n, 0) = 0
        OR a.tdebit IS DISTINCT FROM a.tcredit
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
           WHEN EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id)
             THEN 'ردیف چک در فایل آسان نیست چون کد حساب ندارد؛ بقیهٔ ردیف‌ها هم صادر نمی‌شوند تا سند در آسان ناتراز نشود'
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این سند حسابداری هیچ ردیفی ندارد'
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
         CASE WHEN EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id) THEN NULL ELSE l.lno END,
         CASE WHEN EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id) THEN NULL ELSE l.acode END,
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
         CASE WHEN EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id) THEN NULL ELSE l.debit END,
         CASE WHEN EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id) THEN NULL ELSE l.credit END,
         a.tdebit, a.tcredit
    FROM e
    JOIN k ON k.eid = e.id
    LEFT JOIN l ON l.eid = e.id
      AND NOT EXISTS (SELECT 1 FROM skip_chq s WHERE s.eid = e.id)
    LEFT JOIN agg a ON a.eid = e.id
    LEFT JOIN enr ON enr.eid = e.id
   WHERE _filter = 'all' OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
END;
$function$;

REVOKE ALL ON FUNCTION public.asan_list_journal_export(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asan_list_journal_export(date, date, text) TO authenticated;

COMMENT ON FUNCTION public.asan_list_journal_export(date, date, text) IS
  'Phase 5. Filters on stored journal_entries.doc_kind (third_party = dual). '
  'Cheque lines are omitted (D8). Reversal pairs keep the original kind and are both emitted.';

