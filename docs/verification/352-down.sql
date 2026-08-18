-- 352-down.sql — rollback for
--   supabase/migrations/20260819092000_352_og13_remaining_surfaces.sql
--
-- Restores the two OG-13 surfaces to their pre-352 state:
--   * document_numbers_select_finance back to admin + accountant (migration 338's definition,
--     confirmed against the live pg_policies output before 352 was written).
--   * role_permissions('ledger-documents','manager') back to all-false (migration 344's seed).
--
-- NO TRANSACTION CONTROL IN THIS FILE — deliberately. See Gate A M7 and
-- docs/verification/rollback-dryrun.sql.
--   real:     psql … -v ON_ERROR_STOP=1 --single-transaction -f 352-down.sql
--   dry-run:  psql … -v downfile=/tmp/352-down.sql -f /tmp/rollback-dryrun.sql
--
-- WHAT ROLLING THIS BACK RE-OPENS: Gate A M3. A manager would again be admitted by
-- create_receipt and by assign_document_number, but refused by the document_numbers SELECT policy
-- (so they cannot read back the number they were just issued) and reported as create=false by
-- has_dynamic_permission('ledger-documents','create'). That is the "passes one gate, dies at the
-- next" shape phase 1's Gate A raised as its own M3.
--
-- DATA LOSS: none. Both statements are state assignments over rows that already exist.
--
-- Ordering: independent of 350, 351 and 353.

SET client_encoding = 'UTF8';

DROP POLICY IF EXISTS document_numbers_select_finance ON public.document_numbers;
CREATE POLICY document_numbers_select_finance ON public.document_numbers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

UPDATE public.role_permissions
   SET can_view = false,
       can_create = false,
       updated_at = now()
 WHERE module = 'ledger-documents'
   AND role_name = 'manager';
