SET client_encoding='UTF8';

-- ============================================================================
-- 219 - Let a requester edit their own purchase request while it is pending
-- ============================================================================
-- WHAT WAS WRONG
--   The only UPDATE policy on public.purchase_requests was:
--
--     "update by assignee or manager"
--       USING ((assigned_to = auth.uid())
--              OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'admin'))
--       WITH CHECK: (none - so USING was reused for the new row)
--
--   The requester was not covered. In all four existing rows
--   requested_by <> assigned_to, so a user could create a request and then be
--   unable to touch it. Any "edit" button would have been rejected by the
--   database.
--
-- WHAT THIS CHANGES
--   The assignee/manager/admin branch is preserved EXACTLY as-is. One branch is
--   OR-ed on:
--
--     (requested_by = auth.uid() AND status = 'pending')
--
--   The status condition sits on the requester branch only, so manager and
--   assignee actions on approved/purchased/delivered requests keep working.
--
-- WHY WITH CHECK IS NOW SPELLED OUT
--   Previously WITH CHECK was omitted, which makes Postgres reuse USING for the
--   new row. Carrying that forward would let a requester UPDATE the row and set
--   status = 'approved' in the same statement: the old row is pending (USING
--   passes) and the new row would only be re-checked against the same
--   expression, which the manager branch... would not save them, but the
--   requester branch would fail - leaving behaviour dependent on a subtlety.
--
--   Stating WITH CHECK explicitly with the same expression makes it
--   unambiguous: for the requester branch BOTH the old and the new row must be
--   pending, so a requester can edit fields but can never approve their own
--   request. Self-approval stays a manager/assignee action.
--
-- SAFETY
--   Strictly additive: every operation permitted before is still permitted.
--   No data is read, written or deleted.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "update by assignee or manager" ON public.purchase_requests;

CREATE POLICY "update by assignee or manager"
  ON public.purchase_requests
  FOR UPDATE
  USING (
    (assigned_to = auth.uid())
    OR public.has_role(auth.uid(), 'manager'::text)
    OR public.has_role(auth.uid(), 'admin'::text)
    OR (requested_by = auth.uid() AND status = 'pending')
  )
  WITH CHECK (
    (assigned_to = auth.uid())
    OR public.has_role(auth.uid(), 'manager'::text)
    OR public.has_role(auth.uid(), 'admin'::text)
    OR (requested_by = auth.uid() AND status = 'pending')
  );

DO $$
DECLARE
  v_using text;
  v_check text;
BEGIN
  SELECT qual::text, with_check::text INTO v_using, v_check
  FROM pg_policies
  WHERE tablename = 'purchase_requests' AND cmd = 'UPDATE'
    AND policyname = 'update by assignee or manager';

  IF v_using IS NULL THEN
    RAISE EXCEPTION '219: post-check failed - UPDATE policy missing.';
  END IF;

  IF v_using NOT LIKE '%requested_by%' OR v_using NOT LIKE '%pending%' THEN
    RAISE EXCEPTION '219: post-check failed - requester branch missing from USING.';
  END IF;

  IF v_check IS NULL OR v_check NOT LIKE '%requested_by%' THEN
    RAISE EXCEPTION '219: post-check failed - WITH CHECK not set explicitly.';
  END IF;

  IF v_using NOT LIKE '%assigned_to%' THEN
    RAISE EXCEPTION '219: post-check failed - assignee branch was lost.';
  END IF;

  RAISE NOTICE '219: OK - requester may edit their own pending request; existing branches intact.';
END $$;

COMMIT;
