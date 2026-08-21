-- 369-down.sql — reverse migration 369 (ledger-derived balance readers).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward).
--
-- WHAT 369 DID: re-pointed public.vw_account_balances and public.get_account_ledger at
-- journal_lines, so that every bank figure a user sees is derived from the ledger rather than
-- summed from payment_receipts / payment_vouchers (D21).
--
-- WHAT THIS FILE RESTORES: both objects exactly as they were on 2026-08-21 before 369 was written.
-- The two bodies below were NOT retyped. They were emitted by pg_get_viewdef() and
-- pg_get_functiondef() against the live catalogue and pasted verbatim, so this file cannot drift
-- from what was actually replaced (ground-truth.md §13.3 records the same capture).
--
-- CONSEQUENCE OF RUNNING THIS. The restored readers sum the source tables again, which means a
-- payment_vouchers row with no journal entry would once more move the displayed bank balance. That
-- is the defect 369 closed. Run this only as a deliberate rollback, and note that migration 368
-- (which closes the direct INSERT path) is independent — rolling back 369 alone leaves 368's
-- protection in place, so no new journal-less voucher can be created through PostgREST.
--
-- ORDER. 369-down is independent of 368-down; either may be run without the other.

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
                  WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text AND pr.document_channel IS DISTINCT FROM 'cheque'::text AND pr.reversed_at IS NULL
                  GROUP BY pr.destination_bank_account_id
                ), outflow AS (
                 SELECT pv.source_bank_account_id AS account_id,
                    COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                    count(*) AS out_count
                   FROM payment_vouchers pv
                  WHERE pv.status = 'approved'::text AND pv.document_channel IS DISTINCT FROM 'cheque'::text AND pv.reversed_at IS NULL
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
  WHERE NOT is_viewer_only(uid());;

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
$function$
;
