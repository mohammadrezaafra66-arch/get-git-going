-- ROLLBACK for migration 392.
--
-- Written BEFORE the forward migration (A5.28) and from the LIVE captured state.
--
-- Captured with, verbatim:
--   SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
--    WHERE schemaname='public' AND tablename='document_status_history' ORDER BY policyname;
--
-- Before 392, public.document_status_history carried exactly TWO policies, both PERMISSIVE,
-- both to {public}, and NO viewer_restricted:
--
--   insert document history              INSERT  qual: (none)
--                                        with_check: ((changed_by = auth.uid()) OR (changed_by IS NULL))
--
--   see history of accessible documents  SELECT  with_check: (none)
--                                        qual: EXISTS (SELECT 1 FROM documents d
--                                               WHERE d.id = document_status_history.document_id
--                                                 AND (d.uploaded_by = auth.uid()
--                                                      OR has_role(auth.uid(),'admin')
--                                                      OR has_role(auth.uid(),'manager')))
--
-- 392 adds one policy and alters neither of these two, so undoing it is one DROP.
--
-- WHAT ROLLING BACK RESTORES, stated plainly so nobody runs this casually: it restores a
-- measured, live read AND write path for a viewer-only account. Measured on this database
-- before 392, with a probe document uploaded by the viewer-only user:
--     viewer-only SELECT on document_status_history .... 1 row   (via d.uploaded_by = auth.uid())
--     viewer-only INSERT into document_status_history .. SUCCEEDED
-- Rolling back reopens both.

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

DROP POLICY IF EXISTS viewer_restricted ON public.document_status_history;
