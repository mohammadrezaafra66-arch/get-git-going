-- 482-down.sql — reverse migration 482 (the four allocation workbench RPCs and the
--                 delete-audit trigger).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction.
--
-- RUN THIS BEFORE 481-down.sql. 481-down drops the table; these functions and this
-- trigger sit on top of it.
--
-- WHAT 482 ADDED, and therefore what this removes:
--   1. trigger  trg_allocation_rows_audit_delete   on public.allocation_rows
--   2. function tg_allocation_rows_audit_delete()
--   3. function create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid)
--   4. function update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[])
--   5. function set_allocation_row_status(uuid, text, date, text)
--   6. function list_allocation_rows(date, integer, integer)
--
-- NO DATA IS TOUCHED. Removing the writers leaves every allocation row and every
-- audit_logs row exactly where it is; the table simply loses its RPC surface and falls
-- back to the RLS policies from 481, which continue to gate direct access. That is why
-- this file has no pre-flight refusal and 481-down has one.
--
-- THE SIGNATURES ARE SPELLED OUT IN FULL, deliberately. DROP FUNCTION by bare name would
-- refuse if an overload ever appeared, and CLAUDE.md rule 5 exists because a defaulted
-- parameter added later creates exactly that overload rather than replacing anything.
--
-- The audit_logs rows written with entity_type = 'allocation' are NOT deleted. An audit
-- trail that can be erased by a rollback is not an audit trail.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  IF to_regclass('public.allocation_rows') IS NULL THEN
    RAISE NOTICE '482-down: allocation_rows is already gone; dropping the functions anyway.';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_allocation_rows_audit_delete ON public.allocation_rows;

DROP FUNCTION IF EXISTS public.list_allocation_rows(date, integer, integer);
DROP FUNCTION IF EXISTS public.set_allocation_row_status(uuid, text, date, text);
DROP FUNCTION IF EXISTS public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.tg_allocation_rows_audit_delete();

DO $$
DECLARE _left int;
BEGIN
  SELECT count(*) INTO _left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_allocation_row', 'update_allocation_row',
                       'set_allocation_row_status', 'list_allocation_rows',
                       'tg_allocation_rows_audit_delete');
  IF _left > 0 THEN
    RAISE EXCEPTION '482-down: % allocation function(s) survived — check for an overload', _left;
  END IF;
  RAISE NOTICE '482-down OK: the four RPCs and the delete-audit trigger are gone; no data touched.';
END
$$;
