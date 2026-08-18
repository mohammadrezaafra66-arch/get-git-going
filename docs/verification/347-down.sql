-- 347-down.sql -- rollback for migration 347 (OG-10)
--
-- Restores validate_journal_line_ref to its pre-347 body, captured live with
-- pg_get_functiondef immediately before the change:
--     cheque_receivable -> customers   only
--     cheque_payable    -> suppliers   only
--
-- *** WARNING ***
-- After this rollback, any journal_lines row whose cheque reference points at an
-- external_parties id becomes UNVERIFIABLE by the validator. The trigger only fires on INSERT
-- and on UPDATE of account_kind/account_ref_id, so existing rows are not re-checked and will
-- survive silently -- but any attempt to re-insert or re-point such a line will then fail 23503.
--
-- PRE-FLIGHT, run this first and stop if it is not 0:
--     SELECT count(*) FROM public.journal_lines jl
--      WHERE jl.account_kind IN ('cheque_receivable','cheque_payable')
--        AND EXISTS (SELECT 1 FROM public.external_parties e WHERE e.id = jl.account_ref_id);
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.validate_journal_line_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _target text;
  _ok     boolean;
BEGIN
  IF NEW.account_kind IS NULL OR NEW.account_ref_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.account_kind   IS NOT DISTINCT FROM OLD.account_kind
     AND NEW.account_ref_id IS NOT DISTINCT FROM OLD.account_ref_id THEN
    RETURN NEW;
  END IF;

  _target := CASE NEW.account_kind
    WHEN 'customer_credit'   THEN 'customers'
    WHEN 'bank'              THEN 'bank_accounts'
    WHEN 'external_party'    THEN 'external_parties'
    WHEN 'supplier_payable'  THEN 'suppliers'
    WHEN 'cheque_receivable' THEN 'customers'   -- 341: a cheque we hold, from a customer
    WHEN 'cheque_payable'    THEN 'suppliers'   -- 341: a cheque we issued, to a supplier
    ELSE NULL          -- invoice_ar / clearing / other: control accounts
  END;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
    INTO _ok USING NEW.account_ref_id;

  IF NOT _ok THEN
    RAISE EXCEPTION
      'ارجاع سطر سند نامعتبر است: ردیفی با شناسهٔ % در «%» یافت نشد (نوع حساب: %).',
      NEW.account_ref_id, _target, NEW.account_kind
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;
