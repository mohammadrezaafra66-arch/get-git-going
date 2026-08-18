-- 341-down.sql -- rollback for migration 341 (task 1.4)
--
-- WARNING (rollback-plan.md, phase 1 table): this is only safe BEFORE phase 5 rewires
-- asan_list_journal_export onto doc_kind. After that, roll phase 5 back first.
-- Dropping doc_kind while any row uses a cheque account_kind will also fail the narrowed CHECK.
SET client_encoding='UTF8';
BEGIN;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_doc_kind_chk;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS doc_kind;

-- restore the pre-341 validator (no cheque branches)
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
    WHEN 'customer_credit'  THEN 'customers'
    WHEN 'bank'             THEN 'bank_accounts'
    WHEN 'external_party'   THEN 'external_parties'
    WHEN 'supplier_payable' THEN 'suppliers'
    ELSE NULL
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

ALTER TABLE public.journal_lines DROP CONSTRAINT IF EXISTS journal_lines_account_kind_chk;
ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_account_kind_chk
  CHECK (account_kind = ANY (ARRAY['customer_credit'::text,'bank'::text,'external_party'::text,
    'invoice_ar'::text,'clearing'::text,'other'::text,'supplier_payable'::text]));

COMMIT;
