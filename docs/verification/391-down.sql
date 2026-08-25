-- ROLLBACK for migration 391.
--
-- Written BEFORE the forward migration (A5.28) and built from the LIVE captured state, not
-- from any file in git. The function body below is a byte-for-byte copy of what
-- `pg_get_functiondef('public.trg_post_receipt_on_approve'::regproc)` returned on the
-- `afrakala` database on 2026-08-25, captured via `docker cp` rather than a pipe.
--
-- Captured state that this file restores:
--   owner : supabase_admin
--   proacl: {=X/supabase_admin,supabase_admin=X/supabase_admin,anon=X/supabase_admin,
--            authenticated=X/supabase_admin,service_role=X/supabase_admin,
--            postgres=X/supabase_admin}
--   comment: NULL
--
-- ORDER-OF-OPERATIONS WARNING, and it is not hypothetical:
--   `docs/verification/336-down.sql` recreates the trigger
--   `trg_payment_receipts_post_journal ... EXECUTE FUNCTION trg_post_receipt_on_approve()`.
--   After 391 that function does not exist, so 336-down would fail with 42883. If both are
--   ever rolled back, THIS FILE MUST RUN FIRST. Recorded because a rollback that fails
--   halfway is worse than one that was never attempted.
--
-- NOTE ON WHAT THIS DOES *NOT* RESTORE: the function's body calls
-- `public.post_receipt_journal(NEW.id)`, which migration 336 already dropped and which this
-- file does NOT recreate. Restoring the function therefore restores the exact dead code that
-- existed before 391 -- inert while unattached, and a runtime failure if ever re-attached.
-- That is the correct rollback target: the prior state, not a working feature.

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- ---------------------------------------------------------------- ITEM 1 (reverse of 391)
CREATE OR REPLACE FUNCTION public.trg_post_receipt_on_approve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.payer_accounting_code IS NOT NULL
     AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
  THEN
    PERFORM public.post_receipt_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.trg_post_receipt_on_approve() OWNER TO supabase_admin;

-- CREATE FUNCTION already grants EXECUTE to PUBLIC by default (the leading `=X` in the
-- captured acl). The three explicit grants below are the rest of the captured set.
GRANT EXECUTE ON FUNCTION public.trg_post_receipt_on_approve() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_post_receipt_on_approve() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_post_receipt_on_approve() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_post_receipt_on_approve() TO postgres;

-- ---------------------------------------------------------------- ITEM 2 (reverse of 391)
-- Before 391, public.document_attachments carried exactly three policies -- all PERMISSIVE:
-- document_attachments_select / _insert / _delete_admin. It carried NO viewer_restricted.
DROP POLICY IF EXISTS viewer_restricted ON public.document_attachments;
