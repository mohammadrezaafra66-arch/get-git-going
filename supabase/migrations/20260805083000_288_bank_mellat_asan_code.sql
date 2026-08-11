-- 288: the real Asan account code for the Bank Mellat account.
--
-- Owner decision, docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md, section
-- "BANK MELLAT ASAN CODE — RESOLVED": the Asan code for the Mellat account
-- (id 32a4c282-85a3-485c-bbb4-dae3bb4febd6) is 8.
--
-- This replaces the placeholder literal 'TEMP-CHANGE-ME' that migration 283's research left
-- in place. Until now every export carrying a bank line was designed to fail loudly on that
-- literal; after this it resolves to 8.
--
-- The research in docs/asan/UNVERIFIED-LAYOUTS.md proposed 3064 as a "strong candidate"
-- (the اشخاص.xlsx row whose نام حساب is exactly 'ملت'). The owner's answer is 8, not 3064.
-- The candidate is NOT applied; the owner's answer wins. Recorded so nobody later "corrects"
-- 8 back to the guess.
--
-- Deliberately scoped by BOTH id and current value: if the code has already been changed by
-- hand to something else, this migration must not silently overwrite it.
--
-- Rollback: docs/verification/288-down.sql
SET client_encoding='UTF8';

UPDATE public.bank_accounts
   SET accounting_code = '8',
       updated_at = now()
 WHERE id = '32a4c282-85a3-485c-bbb4-dae3bb4febd6'
   AND accounting_code = 'TEMP-CHANGE-ME';

DO $chk$
DECLARE
  _code text;
  _placeholders integer;
BEGIN
  SELECT accounting_code INTO _code
    FROM public.bank_accounts
   WHERE id = '32a4c282-85a3-485c-bbb4-dae3bb4febd6';

  IF _code IS DISTINCT FROM '8' THEN
    RAISE EXCEPTION 'bank Mellat accounting_code is % , expected 8', coalesce(_code, '<null>');
  END IF;

  -- No other account may still carry the placeholder, otherwise an export would emit it.
  SELECT count(*) INTO _placeholders
    FROM public.bank_accounts
   WHERE accounting_code = 'TEMP-CHANGE-ME';

  IF _placeholders <> 0 THEN
    RAISE EXCEPTION '% bank account(s) still carry TEMP-CHANGE-ME', _placeholders;
  END IF;
END
$chk$;
