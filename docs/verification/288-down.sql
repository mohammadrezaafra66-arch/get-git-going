-- Rollback for migration 288 — restore the Bank Mellat placeholder accounting code.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
SET client_encoding='UTF8';

UPDATE public.bank_accounts
   SET accounting_code = 'TEMP-CHANGE-ME',
       updated_at = now()
 WHERE id = '32a4c282-85a3-485c-bbb4-dae3bb4febd6'
   AND accounting_code = '8';
