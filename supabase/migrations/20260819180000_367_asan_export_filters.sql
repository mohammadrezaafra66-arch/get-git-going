-- 367 — Asan journal export: exclude reversals and cheques; fourth menu
--        (phase 5 Gate A M1 M2 M3; owner 2026-08-19)
--
-- WHAT WRITES OR DEPENDS ON THIS FUNCTION
--   No SQL writer. Read-only. Callers: src/lib/asan/export-journal.ts
--   (RECEIPTS / PAYMENTS / THIRD_PARTY / PURCHASE_SETTLEMENT via export-registry.ts,
--   page /admin/asan-export). Accountant imports the file into Asan.
--
-- WHAT THE ACCOUNTANT CONCLUDES
--   The file is bank documents that still stand. Cash, cheque, and reversals are entered
--   in Asan by hand (T15). Both legs of a reversed pair are absent — excluding only the
--   reversal would leave an original that no longer stands. A cheque document is absent
--   entirely; it is never listed at zero with no lines (Gate A M3).
--   purchase_payment and settlement appear under _filter='purchase_and_settlement' and
--   under 'all'. other stays unclassified, blocked, and is not a menu.
--
-- T14: this function never labels a total as a party's balance or debt.
--
-- Rollback: docs/verification/367-down.sql (366 body). Signature unchanged.
-- 366-down remains valid (same (date,date,text) CREATE OR REPLACE) but restores the
-- pre-366 heuristic; apply 367-down first.

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
$function$;

REVOKE ALL ON FUNCTION public.asan_list_journal_export(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asan_list_journal_export(date, date, text) TO authenticated;

COMMENT ON FUNCTION public.asan_list_journal_export(date, date, text) IS
  'Phase 5 / 367. Stored doc_kind; third_party = dual; purchase_and_settlement = '
  'purchase_payment + settlement. Cheques and both legs of a reversed pair are absent '
  '(owner 2026-08-19 / T15).';

DO $chk$
DECLARE _n integer; _def text;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_journal_export';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one asan_list_journal_export, found % (rule 5: an overload makes every call ambiguous)', _n;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_journal_export';
  IF _def LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in, or an ASCII question mark was introduced';
  END IF;

  IF _def NOT LIKE '%invoice_ar%' OR _def NOT LIKE '%clearing%' OR _def NOT LIKE '%other%' THEN
    RAISE EXCEPTION 'the unresolvable-account-kind blocks are missing';
  END IF;

  IF _def NOT LIKE '%IS DISTINCT FROM a.tcredit%' THEN
    RAISE EXCEPTION 'the balance invariant is missing';
  END IF;

  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.journal_lines'::regclass AND conname = 'journal_lines_one_side';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'journal_lines_one_side is gone; a zero-amount line could now exist';
  END IF;
END
$chk$;
