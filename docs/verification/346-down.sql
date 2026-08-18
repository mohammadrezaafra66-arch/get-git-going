-- 346-down.sql -- rollback for migration 346 (Gate A MAJOR fixes)
--
-- WARNING: rolling this back REOPENS four defects the phase 1 Gate A review found:
--   M1  require_asan_code becomes SECURITY DEFINER again -> RLS bypass, any authenticated
--       caller can read any person's Asan code
--   M2  restores INSERT/UPDATE policies on journal_entries/journal_lines -> an accountant can
--       fabricate a posted entry through PostgREST, bypassing numbering, Asan code, balance
--       and audit
--   M3  assign_document_number refuses manager again -> phase 2 create_receipt dies
--       mid-transaction for managers
--   M4  document_attachments orphans on parent delete again
-- Only run this if migration 346 itself is the problem.
SET client_encoding='UTF8';
BEGIN;

-- M4
DROP TRIGGER IF EXISTS trg_cleanup_payment_attachments ON public.payment_vouchers;
DROP TRIGGER IF EXISTS trg_cleanup_receipt_attachments ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.tg_cleanup_payment_attachments();
DROP FUNCTION IF EXISTS public.tg_cleanup_receipt_attachments();

-- M2
CREATE POLICY journal_entries_insert_admin_accountant ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role));
CREATE POLICY journal_entries_update_admin_accountant ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role));
CREATE POLICY journal_lines_insert_admin_accountant ON public.journal_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role));
CREATE POLICY journal_lines_update_admin_accountant ON public.journal_lines
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role));

-- M1 and M3 are restored by re-applying migrations 340 and 338 respectively.
COMMIT;
