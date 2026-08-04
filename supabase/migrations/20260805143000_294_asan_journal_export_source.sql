-- 294: the shared accounting-document source (M4.5).
--
-- Exports 3 (دریافت · واریز), 4 (پرداخت · برداشت) and 5 (دوبل) are the SAME six-column layout
-- and differ only in which documents they select. So there is ONE source function and ONE row
-- builder, and each export is a filter over `doc_kind`. Three separate mappers for six identical
-- columns is the parallel implementation rule 14 forbids.
--
-- ACCOUNT CODE RESOLUTION — and the three kinds that deliberately cannot resolve
--
--   customer_credit -> customers.person_id -> person_identifiers(kind='asan_person_code')
--                      The canonical store since M3.1. `customers.accounting_code` still holds
--                      the same value and is deliberately NOT read as a second source: two
--                      sources of truth for an account code is how they drift.
--   bank            -> bank_accounts.accounting_code (Mellat is '8', migration 288)
--   external_party  -> external_parties.accounting_code
--   invoice_ar      -> BLOCKS. The owner confirmed it means the receivables/debtors control
--                      account but still owes the exact Asan code. Never guessed.
--   clearing        -> BLOCKS, and is never emitted under any code. The owner: "There is no
--                      clearing/suspense account in Asan." His real flow is a cash receipt and a
--                      cash payment in the same moment. Recorded under MODEL GAPS.
--   other           -> BLOCKS. The owner will define it later.
--
-- THE BALANCE INVARIANT IS A HARD BLOCK, NOT A WARNING
--
-- An unbalanced document entering Asan is silent corruption (mission control 5.2). If
-- sum(debit) <> sum(credit) the whole document is excluded and the imbalance amount is named.
--
-- Asan's dialog checks `بدون مبلغ حذف شود` by default, so a zero-amount line is dropped on their
-- side. That cannot break the balance here, and it is not a hope: `journal_lines_one_side`
-- already CHECKs that exactly one of debit/credit is > 0 on every line, so no zero-amount line
-- can exist. The gate below asserts that constraint is still in place.
--
-- ONE UNRESOLVABLE LINE BLOCKS THE WHOLE DOCUMENT, never just that line. A partial accounting
-- document is worse than none — it would enter Asan unbalanced.
--
-- Rollback: docs/verification/294-down.sql
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.asan_list_journal_export(_from date, _to date, _filter text)
RETURNS TABLE (
  doc_id           uuid,
  doc_label        text,
  doc_date         date,
  doc_kind         text,
  party_name       text,
  blocked_reason   text,
  line_no          integer,
  account_code     text,
  product_code     text,
  line_description text,
  quantity         numeric,
  debit            numeric,
  credit           numeric,
  doc_debit        numeric,
  doc_credit       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
    SELECT je.id,
           je.entry_date AS edate,
           je.description AS edesc,
           je.source_type
      FROM public.journal_entries je
     -- Only posted documents. A draft has not entered our own books, so it must not enter Asan's.
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
             ELSE NULL   -- invoice_ar / clearing / other resolve to nothing, on purpose
           END AS acode,
           CASE jl.account_kind
             WHEN 'customer_credit' THEN
               (SELECT c.name FROM public.customers c WHERE c.id = jl.account_ref_id)
             WHEN 'bank' THEN
               (SELECT ba.title FROM public.bank_accounts ba WHERE ba.id = jl.account_ref_id)
             WHEN 'external_party' THEN
               (SELECT ep.full_name FROM public.external_parties ep WHERE ep.id = jl.account_ref_id)
             ELSE jl.account_kind
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
           -- Money into our own bank is a receipt; out of it, a payment.
           SUM(CASE WHEN l.akind = 'bank' THEN l.debit - l.credit ELSE 0 END) AS bank_net,
           bool_or(l.debit <> trunc(l.debit) OR l.credit <> trunc(l.credit)) AS frac,
           -- The first line whose account cannot be resolved; one such line blocks the document.
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
           WHEN a.bad_kind = 'invoice_ar'
             THEN 'کد حساب آسان برای حساب کنترلی دریافتنی («invoice_ar») هنوز از سوی مالک اعلام نشده است'
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
         l.lno,
         l.acode,
         NULL::text,   -- B کد کالا — a financial line carries no product
         -- The LINE's own description, not the entry's. The one posted entry on this database is
         -- the bucket-C row migration 279 deliberately left corrupted, so using the entry text
         -- would write that corruption straight into Asan. The line descriptions are intact
         -- Persian, so they are preferred and the entry text is only a fallback.
         COALESCE(NULLIF(btrim(l.ldesc), ''), NULLIF(btrim(e.edesc), ''), ''),
         NULL::numeric,  -- D تعداد — empty for a financial line
         l.debit, l.credit,
         a.tdebit, a.tcredit
    FROM e
    JOIN k ON k.eid = e.id
    -- LEFT, not INNER: a posted entry with no lines must still appear, blocked and named.
    LEFT JOIN l ON l.eid = e.id
    LEFT JOIN agg a ON a.eid = e.id
   WHERE _filter = 'all' OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_journal_export(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_journal_export(date, date, text) TO authenticated;

COMMENT ON FUNCTION public.asan_list_journal_export(date, date, text) IS
  'ASAN M4.5: one row per line of every posted journal entry in range, in the six-column accounting-document shape. _filter is all|receipt|payment|third_party. Amounts in Toman.';

-- --------------------------------------------------------------------- gate ----
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
  -- Rule 2.1. This body deliberately contains NO ASCII question mark of its own — the Persian
  -- «؟» is U+061F — so a bare '?' can only mean a non-ASCII byte was mangled on the way in.
  -- That is what makes the check meaningful rather than a formality, and it earned its keep: the
  -- first draft had two real ASCII '?' in it, which would have been indistinguishable from the
  -- 2026-07-11 corruption signature to a later reader. (Contrast migration 287, where the same
  -- naive check was WRONG because `person_merge` legitimately uses the jsonb `?` operator.)
  IF _def LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in, or an ASCII question mark was introduced';
  END IF;

  -- The three account kinds that must never resolve to a code. If a later edit gives any of them
  -- one, a guessed account number reaches live accounting.
  IF _def NOT LIKE '%invoice_ar%' OR _def NOT LIKE '%clearing%' OR _def NOT LIKE '%other%' THEN
    RAISE EXCEPTION 'the unresolvable-account-kind blocks are missing';
  END IF;

  -- The balance invariant must be present as a block.
  IF _def NOT LIKE '%IS DISTINCT FROM a.tcredit%' THEN
    RAISE EXCEPTION 'the balance invariant is missing';
  END IF;

  -- Dropping zero-amount lines is only safe because this constraint exists. If it is ever
  -- removed, Asan's `بدون مبلغ حذف شود` could unbalance a document on their side only.
  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.journal_lines'::regclass AND conname = 'journal_lines_one_side';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'journal_lines_one_side is gone; a zero-amount line could now exist';
  END IF;
END
$chk$;
