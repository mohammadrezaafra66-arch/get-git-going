-- 369 — the bank figure a user sees comes from journal_lines (D21).
--
-- THE DEFECT. vw_account_balances and get_account_ledger both computed the bank figure by summing
-- payment_receipts and payment_vouchers directly. Migration 359 recorded this in its own header
-- ("vw_account_balances DOES NOT READ journal_lines AT ALL") and worked around it. The consequence
-- measured on 2026-08-21: a payment_vouchers row with status='approved' and no journal entry moved
-- the displayed bank balance while being absent from the ledger and from every Asan export. The
-- ledger and the balance were two independent computations of the same money, and nothing compared
-- them.
--
-- WHAT THIS DOES. Both readers now aggregate journal_lines where account_kind='bank', keyed on
-- account_ref_id. Migration 368 closed the writer; this closes the reader. Either alone would leave
-- half the defect standing.
--
-- WHY THIS CANNOT REINTRODUCE THE CHEQUE DEFECT (OG-18 / migration 359). The old readers excluded
-- cheques with an explicit document_channel filter. The ledger needs none: a cheque never posts to
-- account_kind='bank' — create_receipt debits cheque_receivable and create_payment credits
-- cheque_payable. Measured before this migration was written:
--     journal lines with account_kind=bank belonging to a cheque-channel receipt = 0
--     journal lines with account_kind=bank belonging to a cheque-channel voucher = 0
-- Reading from the ledger is therefore stronger than the 359 filter: a cheque is excluded by where
-- it posts, not by a label a writer could get wrong.
--
-- REVERSALS. The two-line predicate is copied from the live asan_list_journal_export (367 / T15),
-- not invented here: the reversal leg carries reverses_entry_id, and a posted row pointing at an
-- entry is the authoritative "this has been reversed". Both legs leave the figure, which is exactly
-- what the old reversed_at IS NULL filter achieved.
--
-- PROVEN EQUAL BEFORE BEING WRITTEN (T-1.4). Old formula vs new, run side by side on live data:
--     total_in        OLD=10225000000.00  NEW=10225000000.00  diff=0.00
--     total_out       OLD=36000000        NEW=36000000        diff=0
--     current_balance OLD=10289000000.00  NEW=10289000000.00  diff=0.00
--     in_count        OLD=3  NEW=3        out_count OLD=1  NEW=1
-- The counts matching is the stricter half: it shows the 367 predicate excludes the OG14-CONC
-- reversed pair exactly as the old filter did.
--
-- ONE USER-VISIBLE CHANGE, CALLED OUT RATHER THAN DISCOVERED LATER. get_account_ledger returned
-- payment_receipts.tracking_number (inflow) or payment_vouchers.voucher_number (outflow) in its
-- document_number column. It now returns the real minted number from document_numbers
-- (RCP-… / PAY-…). That is a correction, and it is deliberate.
--
-- WHAT STILL COMES FROM THE SOURCE ROW, AND WHY THAT IS NOT A CONTRADICTION. document_channel is a
-- display label the journal does not carry. It is read with a LEFT JOIN back to the source row.
-- No money is read from the source row. Money comes from the ledger; the label comes from the
-- document. That separation is the design.
--
-- opening_balance stays in the formula. It is a bank_accounts column, not a ledger event; removing
-- it would change every displayed balance and is not this mission's decision to take.
--
-- ROLLBACK: docs/verification/369-down.sql — both original bodies captured verbatim from the live
-- catalogue with pg_get_viewdef / pg_get_functiondef, dry-run proved before this file was written.

SET client_encoding = 'UTF8';

CREATE OR REPLACE VIEW public.vw_account_balances AS
  SELECT src.account_id, src.title, src.bank_name, src.account_type, src.currency,
         src.is_active, src.opening_balance, src.total_in, src.total_out,
         src.current_balance, src.in_count, src.out_count
  FROM (
    WITH bank_moves AS (
      SELECT jl.account_ref_id                     AS account_id,
             COALESCE(SUM(jl.debit),  0::numeric)  AS total_in,
             COALESCE(SUM(jl.credit), 0::numeric)  AS total_out,
             count(*) FILTER (WHERE jl.debit  > 0) AS in_count,
             count(*) FILTER (WHERE jl.credit > 0) AS out_count
        FROM public.journal_lines   jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_kind = 'bank'
         AND je.status = 'posted'
         AND je.reverses_entry_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.journal_entries r
                          WHERE r.reverses_entry_id = je.id)
       GROUP BY jl.account_ref_id
    )
    SELECT ba.id AS account_id, ba.title, ba.bank_name, ba.account_type, ba.currency,
           ba.is_active, ba.opening_balance,
           COALESCE(m.total_in,  0::numeric) AS total_in,
           COALESCE(m.total_out, 0::numeric) AS total_out,
           ba.opening_balance + COALESCE(m.total_in, 0::numeric)
                              - COALESCE(m.total_out, 0::numeric) AS current_balance,
           COALESCE(m.in_count,  0::bigint)  AS in_count,
           COALESCE(m.out_count, 0::bigint)  AS out_count
      FROM public.bank_accounts ba
      LEFT JOIN bank_moves m ON m.account_id = ba.id
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());

CREATE OR REPLACE FUNCTION public.get_account_ledger(
  p_account_id uuid,
  p_from_date  date DEFAULT NULL::date,
  p_to_date    date DEFAULT NULL::date)
RETURNS TABLE(entry_id uuid, entry_kind text, entry_date date, document_number text,
              counterparty text, document_channel text, amount numeric, signed_amount numeric,
              running_balance numeric, description text)
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

  SELECT ba.opening_balance INTO _opening
    FROM public.bank_accounts ba WHERE ba.id = p_account_id;
  IF _opening IS NULL THEN
    RAISE EXCEPTION 'حساب یافت نشد.' USING ERRCODE = '22023';
  END IF;

  -- ماندهٔ ابتدای بازه = opening_balance حساب + خالص حرکات دفتری پیش از p_from_date
  IF p_from_date IS NOT NULL THEN
    _opening := _opening + COALESCE((
      SELECT SUM(jl.debit - jl.credit)
        FROM public.journal_lines   jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_kind   = 'bank'
         AND jl.account_ref_id = p_account_id
         AND je.status = 'posted'
         AND je.reverses_entry_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.journal_entries r
                          WHERE r.reverses_entry_id = je.id)
         AND je.entry_date < p_from_date), 0);
  END IF;

  RETURN QUERY
  WITH bank_lines AS (
    SELECT je.id AS je_id, je.source_id, je.source_type, je.entry_date,
           je.description AS je_description, je.created_at,
           jl.debit, jl.credit
      FROM public.journal_lines   jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.account_kind   = 'bank'
       AND jl.account_ref_id = p_account_id
       AND je.status = 'posted'
       AND je.reverses_entry_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries r
                        WHERE r.reverses_entry_id = je.id)
       AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
       AND (p_to_date   IS NULL OR je.entry_date <= p_to_date)
  ),
  enriched AS (
    SELECT b.je_id, b.source_id, b.source_type, b.entry_date, b.je_description,
           b.created_at, b.debit, b.credit,
           dn.document_number,
           (SELECT CASE o.account_kind
                     WHEN 'customer_credit'  THEN (SELECT c.name       FROM public.customers c         WHERE c.id  = o.account_ref_id)
                     WHEN 'supplier_payable' THEN (SELECT s.name       FROM public.suppliers s         WHERE s.id  = o.account_ref_id)
                     WHEN 'external_party'   THEN (SELECT ep.full_name FROM public.external_parties ep WHERE ep.id = o.account_ref_id)
                     WHEN 'cheque_receivable' THEN COALESCE(
                            (SELECT c.name       FROM public.customers c         WHERE c.id  = o.account_ref_id),
                            (SELECT ep.full_name FROM public.external_parties ep WHERE ep.id = o.account_ref_id))
                     WHEN 'cheque_payable'    THEN COALESCE(
                            (SELECT s.name       FROM public.suppliers s         WHERE s.id  = o.account_ref_id),
                            (SELECT ep.full_name FROM public.external_parties ep WHERE ep.id = o.account_ref_id))
                   END
              FROM public.journal_lines o
             WHERE o.journal_entry_id = b.je_id
               AND o.account_kind <> 'bank'
             ORDER BY o.line_no
             LIMIT 1) AS counterparty,
           CASE b.source_type
             WHEN 'payment_receipt' THEN (SELECT pr.document_channel FROM public.payment_receipts pr WHERE pr.id = b.source_id)
             WHEN 'payment_voucher' THEN (SELECT pv.document_channel FROM public.payment_vouchers pv WHERE pv.id = b.source_id)
           END AS document_channel
      FROM bank_lines b
      LEFT JOIN public.document_numbers dn ON dn.source_id = b.source_id
  )
  SELECT e.source_id,
         (CASE WHEN e.debit > 0 THEN 'in' ELSE 'out' END)::text,
         e.entry_date,
         e.document_number,
         e.counterparty,
         e.document_channel,
         (e.debit + e.credit)::numeric,
         (e.debit - e.credit)::numeric,
         (_opening + SUM(e.debit - e.credit) OVER (
            ORDER BY e.entry_date, e.created_at, e.source_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric,
         e.je_description
    FROM enriched e
   ORDER BY e.entry_date, e.created_at, e.source_id;
END;
$function$;

DO $chk$
DECLARE
  _def text;
  _n   int;
BEGIN
  -- Both readers must now reach the ledger.
  IF pg_get_viewdef('public.vw_account_balances'::regclass, true) NOT LIKE '%journal_lines%' THEN
    RAISE EXCEPTION '369: vw_account_balances does not read journal_lines';
  END IF;

  SELECT p.prosrc INTO _def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'get_account_ledger';
  IF _def IS NULL THEN
    RAISE EXCEPTION '369: get_account_ledger is missing';
  END IF;
  IF _def NOT LIKE '%journal_lines%' THEN
    RAISE EXCEPTION '369: get_account_ledger does not read journal_lines';
  END IF;

  -- Rule 2.1 (migration 294). This body contains no ASCII question mark of its own — the Persian
  -- text uses U+061F — so a bare '?' can only mean a non-ASCII byte was mangled on the way in.
  IF _def LIKE '%' || chr(63) || '%' THEN
    RAISE EXCEPTION '369: persian text corrupted on the way in, or an ASCII question mark was introduced';
  END IF;

  -- Exactly one overload of each, so no call is ambiguous (rule 5).
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'get_account_ledger';
  IF _n <> 1 THEN
    RAISE EXCEPTION '369: expected exactly one get_account_ledger, found %', _n;
  END IF;

  -- The reversal predicate must be present in both, or a reversed pair would be counted twice.
  IF pg_get_viewdef('public.vw_account_balances'::regclass, true) NOT LIKE '%reverses_entry_id%'
     OR _def NOT LIKE '%reverses_entry_id%' THEN
    RAISE EXCEPTION '369: the 367 reversal predicate is missing from one of the two readers';
  END IF;

  RAISE NOTICE '369: both balance readers now derive from journal_lines, with the 367 reversal predicate.';
END
$chk$;
