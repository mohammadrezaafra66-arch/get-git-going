SET client_encoding = 'UTF8';

-- 424. A bank account or cash box carries its Asan code.
--
-- The Asan bank-deposit template has a Bank_cod column naming which of the
-- company's accounts received the money. Nothing in this schema held that
-- value, so the export wrote it empty and Asan could not identify the
-- destination. The owner has twenty bank accounts plus a cash box (code 986);
-- the bank account already created carries code 8. Both are per-account codes
-- of the same kind, so one column serves both account types.
--
-- Nullable on purpose: twenty accounts cannot be filled by a migration, and an
-- account without a code must not break anything -- its export row simply
-- carries an empty Bank_cod, as it does today.
--
-- The CHECK rejects the empty string. In PostgreSQL '' and NULL are different
-- values that would both mean "no code here", and two spellings of one absence
-- is how silent bugs start. NULL is the one spelling.

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS asan_code text;

DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bank_accounts'::regclass
       AND conname  = 'bank_accounts_asan_code_not_empty'
  ) THEN
    ALTER TABLE public.bank_accounts
      ADD CONSTRAINT bank_accounts_asan_code_not_empty
      CHECK (asan_code IS NULL OR btrim(asan_code) <> '');
  END IF;
END
$ck$;

COMMENT ON COLUMN public.bank_accounts.asan_code IS
  'Asan accounting code for this account. Feeds Bank_cod in the Asan bank export. NULL when not yet entered.';

DO $verify$
DECLARE v_col int; v_chk int;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='bank_accounts' AND column_name='asan_code';
  IF v_col <> 1 THEN RAISE EXCEPTION '424: asan_code column missing'; END IF;

  SELECT count(*) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.bank_accounts'::regclass
     AND conname='bank_accounts_asan_code_not_empty';
  IF v_chk <> 1 THEN RAISE EXCEPTION '424: empty-string CHECK missing'; END IF;

  RAISE NOTICE '424: asan_code present, empty string rejected, NULL allowed';
END
$verify$;
