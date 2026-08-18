-- 359 — a cheque does not move the bank balance until it clears (OG-18, owner answer (a))
--
-- ==============================================================================================
-- THE DEFECT — phase-3 Gate A M1, raised by phase 3 itself as OG-18
-- ==============================================================================================
--
-- The outflow CTE of vw_account_balances and get_account_ledger both sum payment_vouchers.amount
-- filtered on status='approved' with NO document_channel predicate, so a cheque payment reduces
-- the displayed bank balance on the day it is written although no money has left the account.
--
-- Reproduced by Gate A, inside BEGIN … ROLLBACK:
--
--   BEFORE        | out_count = 0 | total_out = 0
--   (create a 900,000 own-cheque payment)
--   AFTER cheque  | out_count = 1 | total_out = 900000
--   the entry's lines:  supplier_payable 900000 / 0
--                       cheque_payable        0 / 900000     <-- no bank line exists
--
-- THE LEDGER IS ALREADY CORRECT and is not touched here: create_payment credits cheque_payable or
-- cheque_receivable, never bank. This migration aligns the two views WITH the ledger; it changes no
-- posting, no classification and no account_kind.
--
-- Owner answer 2026-08-19: option (a) — exclude cheques from both readers, the direct mirror of
-- what migration 350 did on the receipt side of the Asan bank-deposit export.
--
-- ==============================================================================================
-- SCOPE NOTE THE OWNER SHOULD READ: THE FIX IS SYMMETRIC, AND THAT IS ONE STEP BEYOND THE LETTER
-- ==============================================================================================
--
-- OG-18 was raised about cheque PAYMENTS. The identical defect exists on the RECEIPT side of the
-- same two objects: the inflow CTE of vw_account_balances and the receipt branch of
-- get_account_ledger also filter on status alone, so a cheque RECEIPT raises the displayed bank
-- balance before it clears — while create_receipt debits cheque_receivable, never bank, exactly
-- mirroring the payment side.
--
-- Both directions are fixed here. The reasoning, stated so it can be overturned in one line:
--   * the decision recorded is "a cheque does not move the bank balance until it clears", and a
--     cheque that has not cleared has not moved it in either direction;
--   * the two predicates are the same predicate on the same two objects — leaving one would create
--     exactly the asymmetry Gate A objected to over OG-20 (receipts guarded, vouchers not);
--   * it avoids a second visit to two objects that phase 5 would otherwise have to revisit.
-- If the owner wants payments only, delete the two pr.document_channel predicates below and
-- nothing else changes.
--
-- CASH IS DELIBERATELY NOT EXCLUDED. Migration 350 excluded cash AND cheque from the Asan export
-- because a cash receipt is not a bank deposit. Here the question is different: a cash box IS a
-- bank_accounts row (D2), and a cash payment really does move that account's balance. Excluding
-- cash would understate the صندوق. Only cheque is excluded.
--
-- payment_receipts.document_channel is NULLABLE (a bank receipt stores NULL — phase-2 C6), so the
-- predicate is IS DISTINCT FROM rather than <>, which would silently drop every NULL-channel row.
-- payment_vouchers.document_channel is NOT NULL, but the same spelling is used on both for
-- uniformity and so a future nullable column cannot reintroduce the bug.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON WHAT I AM CHANGING  (README-EXECUTION §H, first half)
-- ==============================================================================================
--
-- Measured from the live catalogue, excluding comment-only matches (a plain prosrc match returns
-- create_receipt and create_payment, but only because their comments mention these objects):
--
--   vw_account_balances  — exactly ONE real SQL reader: get_account_balances, which does
--                          FROM public.vw_account_balances v. No view reads it. In src/ it is
--                          reached only through that RPC, at src/lib/treasury/queries.ts:66.
--   get_account_ledger   — NO SQL caller at all. One src/ caller,
--                          src/lib/treasury/queries.ts:93.
--   asan_list_journal_export — no SQL caller; read by src/lib/asan/export-journal.ts.
--
-- WOULD ANY OF THEM BE SURPRISED BY A BALANCE THAT NO LONGER MOVES ON CHEQUE DAY?
--   get_account_balances passes the view's columns straight through — it computes nothing of its
--   own and has no threshold or comparison that a smaller total_out would trip. The treasury screen
--   displays them. Nothing alerts, reconciles or gates on these numbers.
--
-- COULD THE VIEW AND THE LEDGER NOW DISAGREE IN THE OPPOSITE DIRECTION?
--   No, and the reason is structural: vw_account_balances DOES NOT READ journal_lines AT ALL —
--   verified, pg_get_viewdef(...) ~ 'journal_lines' is false. It is computed entirely from
--   payment_receipts and payment_vouchers. There is therefore no object that sums both the view and
--   the ledger and could now be pulled apart by this change; measured — no function references both
--   vw_account_balances (or get_account_ledger) and journal_lines outside comments. Before this
--   migration the view disagreed with the ledger on cheque documents; after it, the two agree on
--   cheques and continue to be computed independently for everything else. That independence is a
--   separate, larger matter recorded as OG-19 / T14 and is not touched here.
--
-- WHAT WILL READ THE ROWS THIS AFFECTS (§H, second half): these objects create no rows. Their
-- output is read by the treasury screen and the Asan export page, and after that by a human.
--
-- ==============================================================================================
-- THE SECOND FIX IN THIS MIGRATION — the customer-payee label
-- ==============================================================================================
--
-- asan_list_journal_export builds a payment's document label from suppliers, external_parties and
-- payee_name — but NOT payee_customer_id. Phase 3 made payee_type='customer' reachable, so such a
-- payment renders to the accountant as «؟». Found during the phase-3 Gate A remediation and
-- correctly not widened into then; fixed here because it is the same function and the same class of
-- defect, and the owner asked for it in the same visit.
--
-- Note that get_account_ledger already joins customers and already uses c2.name — only the export
-- was missing the branch. LABEL ONLY: acode, the blocking decision and the doc_kind classification
-- are untouched.
--
-- ==============================================================================================
-- All three bodies below were generated FROM THE LIVE DEFINITIONS with only the predicates and the
-- one COALESCE branch changed (CLAUDE.md rule 6), so what is deployed and what is reviewed are the
-- same text. No signature changes, so nothing overloads (rule 5) and no caller changes.
--
-- Rollback: docs/verification/359-down.sql — statements only; restores all three captured originals.
-- ==============================================================================================

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
                    AND pr.document_channel IS DISTINCT FROM 'cheque'::text
                  GROUP BY pr.destination_bank_account_id
                ), outflow AS (
                 SELECT pv.source_bank_account_id AS account_id,
                    COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                    count(*) AS out_count
                   FROM payment_vouchers pv
                  WHERE pv.status = 'approved'::text
                    AND pv.document_channel IS DISTINCT FROM 'cheque'::text
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
                     AND pr.document_channel IS DISTINCT FROM 'cheque'), 0)
      - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
                   WHERE pv.source_bank_account_id = p_account_id
                     AND pv.status = 'approved' AND pv.payment_date < p_from_date
                     AND pv.document_channel IS DISTINCT FROM 'cheque'), 0);
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
                          -- 359: payee_type 'customer' became reachable in phase 3, and this
                          -- COALESCE had no branch for it, so such a payment rendered as «؟».
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
