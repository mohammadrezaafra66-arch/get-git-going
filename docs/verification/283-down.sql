-- Down script for migration 283. No BEGIN/COMMIT: the caller owns the transaction.
-- Removes the Asan code fields and their backfill. external_parties is untouched because 283
-- never changed it -- its accounting_code and unique constraint predate this program.
SET client_encoding='UTF8';

DELETE FROM public.person_identifiers WHERE kind = 'asan_person_code';

DROP INDEX IF EXISTS public.uq_person_identifiers_asan_code_active;

ALTER TABLE public.person_identifiers DROP CONSTRAINT IF EXISTS person_identifiers_kind_check;
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_kind_check
  CHECK (kind = ANY (ARRAY[
    'mobile_e164'::text,
    'landline'::text,
    'national_id_ir'::text,
    'tax_id_ir'::text,
    'company_reg_id_ir'::text,
    'email'::text,
    'iban'::text,
    'custom'::text
  ]));

DROP INDEX IF EXISTS public.bank_accounts_accounting_code_unique_idx;
DROP INDEX IF EXISTS public.products_accounting_code_unique_idx;
ALTER TABLE public.products DROP COLUMN IF EXISTS accounting_code;
