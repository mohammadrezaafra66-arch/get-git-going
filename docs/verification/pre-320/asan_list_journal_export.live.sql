CREATE OR REPLACE FUNCTION public.asan_list_journal_export(_from date, _to date, _filter text)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, doc_kind text, party_name text, blocked_reason text, line_no integer, account_code text, product_code text, line_description text, quantity numeric, debit numeric, credit numeric, doc_debit numeric, doc_credit numeric)
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
  IF _filter IS NULL OR _filter NOT IN ('all', 'receipt', 'payment', 'third_party') THEN
    RAISE EXCEPTION 'نوع سند حسابداری برای خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT je.id, je.entry_date AS edate, je.description AS edesc, je.source_type
      FROM public.journal_entries je
     WHERE je.status = 'posted'
       AND je.entry_date BETWEEN _from AND _to
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
             ELSE COALESCE(
               (SELECT ca.label_fa FROM public.asan_control_accounts ca
                 WHERE ca.account_kind = jl.account_kind),
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
         COALESCE(NULLIF(btrim(l.ldesc), ''), NULLIF(btrim(e.edesc), ''), ''),
         NULL::numeric,
         l.debit, l.credit,
         a.tdebit, a.tcredit
    FROM e
    JOIN k ON k.eid = e.id
    LEFT JOIN l ON l.eid = e.id
    LEFT JOIN agg a ON a.eid = e.id
   WHERE _filter = 'all' OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
END;
$function$

