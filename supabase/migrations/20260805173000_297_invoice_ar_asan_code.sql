-- 297: the receivables control account has an Asan code (owner supplement 2, phase O4).
--
-- The owner supplied it: `invoice_ar` — the debtors control, «جمع بدهکاران», where a credit sale
-- posts the customer's debt — is Asan `کد حساب` **989**.
--
-- That was the last blocker on the accounting-document export. The full resolution table is now:
--
--   customer_credit -> the customer's Asan person code
--   bank            -> bank_accounts.accounting_code (Mellat is 8, migration 288)
--   invoice_ar      -> 989                                    <-- this migration
--   external_party  -> the party's Asan code, still per-party and still blocking when absent
--   clearing        -> never emitted; the owner records a cash receipt + cash payment instead
--   other           -> still blocked, until the owner defines it
--
-- WHY THE CODE IS A ROW AND NOT A LITERAL IN THE FUNCTION
--
-- `989` is a configuration value the owner gave me, exactly like Mellat's `8`. Mellat's lives in
-- `bank_accounts.accounting_code` where the owner can see and change it. Burying `989` inside a
-- function body would make the one number he is most likely to correct the hardest one to find,
-- and would need a migration to change. It goes in `asan_control_accounts`, a two-column table
-- the remaining control accounts can join as they are defined — so `other` will be an INSERT
-- rather than another migration of logic.
--
-- The function still BLOCKS when a kind has no row, so an undefined control account cannot
-- silently emit a blank or a guess. Adding the table does not weaken that; it only moves where
-- the answer is written down.
--
-- Rollback: docs/verification/297-down.sql
SET client_encoding='UTF8';

CREATE TABLE IF NOT EXISTS public.asan_control_accounts (
  account_kind    text PRIMARY KEY
                  CHECK (account_kind IN ('invoice_ar', 'clearing', 'other')),
  accounting_code text NOT NULL CHECK (btrim(accounting_code) <> ''),
  label_fa        text NOT NULL,
  note            text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.asan_control_accounts IS
  'ASAN O4: the Asan کد حساب for account kinds that are not a person, a bank or an external party. A kind with no row here BLOCKS its document rather than emitting a blank.';

ALTER TABLE public.asan_control_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asan_control_accounts_select ON public.asan_control_accounts;
CREATE POLICY asan_control_accounts_select ON public.asan_control_accounts
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS asan_control_accounts_write ON public.asan_control_accounts;
CREATE POLICY asan_control_accounts_write ON public.asan_control_accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT or DELETE policy: the set of control-account kinds is the CHECK above, not something
-- a client invents. An admin may correct a code; nobody may add a kind through the API.

INSERT INTO public.asan_control_accounts (account_kind, accounting_code, label_fa, note)
VALUES ('invoice_ar', '989', 'حساب کنترلی دریافتنی (جمع بدهکاران)',
        'کد آسان از سوی مالک اعلام شد — OWNER_ANSWERS_SUPPLEMENT_2.md')
ON CONFLICT (account_kind) DO NOTHING;

-- `clearing` and `other` deliberately get NO row. `clearing` has no Asan counterpart at all and
-- must never be emitted; `other` is undefined. Both continue to block their document.

-- ------------------------------------------------------------- the row builder ----
-- Patched, not rewritten: only the account-code CASE and one block reason change. The rest of
-- the function is migration 294's, verbatim.
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
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_journal_export(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_journal_export(date, date, text) TO authenticated;

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE _n integer; _def text; _code text;
BEGIN
  SELECT accounting_code INTO _code FROM public.asan_control_accounts WHERE account_kind = 'invoice_ar';
  IF _code IS DISTINCT FROM '989' THEN
    RAISE EXCEPTION 'invoice_ar must be 989, found %', COALESCE(_code, '<null>');
  END IF;

  -- clearing and other must NOT have acquired a code by accident.
  SELECT count(*) INTO _n FROM public.asan_control_accounts
   WHERE account_kind IN ('clearing', 'other');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'clearing/other must have no code: clearing has no Asan counterpart and other is undefined';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_journal_export';
  IF _def LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in, or an ASCII question mark was introduced';
  END IF;
  IF _def NOT LIKE '%asan_control_accounts%' THEN
    RAISE EXCEPTION 'the row builder does not read the control-account table';
  END IF;
  IF _def NOT LIKE '%IS DISTINCT FROM a.tcredit%' THEN
    RAISE EXCEPTION 'the balance invariant was lost in the rewrite';
  END IF;
  -- The code itself must not be hard-coded into the function; it lives in the table.
  IF _def LIKE '%''989''%' THEN
    RAISE EXCEPTION 'the code is hard-coded in the function body; it belongs in asan_control_accounts';
  END IF;

  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF _n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', _n; END IF;
END
$chk$;
