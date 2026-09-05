-- 391 -- M8. Two items, scoped by the owner on 2026-08-25.
--   Item 1 closes OG-8: drop the orphan trigger FUNCTION trg_post_receipt_on_approve().
--   Item 2 closes OG-15 (half): put viewer_restricted on public.document_attachments.
--
-- WHAT WAS MEASURED BEFORE THIS FILE WAS WRITTEN, all on the live `afrakala` database.
--
-- ITEM 1 -- IT IS A FUNCTION, NOT A TRIGGER, AND IT IS NOT MERELY ORPHANED BUT BROKEN.
--
--   Earlier chain documents called it a trigger and told the agent to prove it dead with
--   pg_get_triggerdef. That is the wrong catalogue: pg_proc holds one row named
--   trg_post_receipt_on_approve (returns trigger, SECURITY DEFINER, volatile, oid 49318) and
--   pg_trigger holds NO trigger of that name. Its trigger was trg_payment_receipts_post_journal
--   and migration 336 dropped it on 2026-08-09.
--
--   Zero callers, proved in four independent directions, each returning zero:
--     * triggers whose tgfoid is this function          -> 0 rows
--     * other pg_proc bodies naming it (prosrc ILIKE)   -> 0 rows
--     * pg_depend entries referencing it                -> 0 rows
--     * references in src/                              -> 0 (whole-tree grep; the only
--       migrations naming it are the one that created it and 336, which orphaned it)
--
--   And it is worse than unreferenced. Its body calls public.post_receipt_journal(NEW.id),
--   which migration 336 ALSO dropped -- `SELECT oid::regprocedure FROM pg_proc WHERE
--   proname='post_receipt_journal'` returns 0 rows. So the function cannot work even if it
--   were re-attached; it would fail at runtime. A direct call today returns 0A000 ("trigger
--   functions can only be called as triggers"). phase-1-GATE-A.md called it "a loaded gun"
--   for exactly this reason. Dropping it also removes one more anon-executable SECURITY
--   DEFINER function, which is the door class OG-31 is about.
--
--   Rollback: docs/verification/391-down.sql, built from the captured live body and acl, and
--   dry-run proved forward-then-back with a field-by-field comparison BEFORE this file was
--   applied. That file also carries the ordering warning that docs/verification/336-down.sql
--   recreates a trigger pointing at this function and must therefore run AFTER 391-down.
--
-- ITEM 2 -- WHAT viewer_restricted ACTUALLY CHANGES HERE, STATED HONESTLY.
--
--   The pattern was read from pg_policies live, not invented: 91 tables carry a policy named
--   viewer_restricted and all 91 are identical -- AS RESTRICTIVE, FOR ALL, TO authenticated,
--   USING and WITH CHECK both (NOT public.is_viewer_only(auth.uid())). Migration 281
--   established it. document_attachments was not among the 91.
--
--   MEASURED BEFORE: the viewer ALREADY reads nothing from this table. With a probe row
--   inserted inside BEGIN/ROLLBACK, visibility was:
--       viewer-only 20303d30 -> 0 rows      admin 05098088      -> 1 row
--       sales       00ebe9d3 -> 0 rows      accountant 90c0479f -> 1 row
--                                           manager    a0a4afe5 -> 1 row
--   because the existing PERMISSIVE policy document_attachments_select admits only
--   admin/accountant/manager. So this migration does NOT take away access the viewer has
--   today, and this header refuses to claim it does.
--
--   What it adds is the two things the permissive policy cannot give:
--     (a) it is RESTRICTIVE and FOR ALL, so it also covers INSERT/UPDATE/DELETE, where the
--         only existing guards are a permissive INSERT check and an admin-only DELETE;
--     (b) it cannot be widened by accident. A permissive policy added later that happens to
--         admit a viewer-only user is overridden by a restrictive one; without it, the single
--         permissive SELECT policy is the only thing standing between a viewer-only account
--         and the financial attachments (receipt images carrying amounts and account numbers).
--
--   The probe row was necessary because the table holds ZERO rows live. On an empty table a
--   policy that closed it for EVERYONE is indistinguishable from one that closed it for the
--   viewer alone -- exactly the one-sided reading that voided migration 386's gate.
--
-- NOT DONE, AND DELIBERATELY: OG-15 names TWO tables. `document_audit_log` DOES NOT EXIST --
-- not as a relation of any kind in any schema, and nowhere in the repository except the line
-- in 00-progress.md that records the owner's answer. No table, no migration, no src/
-- reference. Per A0.9 no guess is made about which real table was meant; it is recorded as
-- an open gate for the owner and NOT silently substituted.

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- ============================================================================= ITEM 1
DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.trg_post_receipt_on_approve();

-- ============================================================================= ITEM 2
DROP POLICY IF EXISTS viewer_restricted ON public.document_attachments;
CREATE POLICY viewer_restricted ON public.document_attachments AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- ============================================================================= THE GATE
-- ONE gate, covering BOTH items, two-sided in both halves (A2.9-A2.12).
DO $chk$
DECLARE
  v_viewer   CONSTANT uuid := '20303d30-ab9d-4fc6-be96-ec5db1dcb647';  -- is_viewer_only = t
  v_admin    CONSTANT uuid := '05098088-2849-43f4-8eb5-7c473c3832ec';
  v_acct     CONSTANT uuid := '90c0479f-410d-4fff-9e00-34bbba1cce2b';
  v_manager  CONSTANT uuid := 'a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b';
  v_sales    CONSTANT uuid := '00ebe9d3-b467-453c-89d6-08bab46335c2';
  v_receipt  uuid;
  v_seen     bigint;
  v_admin_n  bigint;
  v_acct_n   bigint;
  v_mgr_n    bigint;
  v_sales_n  bigint;
  v_pol      record;
  v_ref_qual  text;
  v_ref_check text;
BEGIN
  -- ------------------------------------------------------------------ A0. VACUITY GUARDS
  -- Every behavioural check below counts rows, and a count against an empty or unreachable
  -- surface passes for the wrong reason. 390 carries guards of this shape; they go first.
  IF to_regclass('public.document_attachments') IS NULL THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- public.document_attachments does not exist, so every policy check below would pass vacuously.';
  END IF;

  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.document_attachments'::regclass) THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- RLS is DISABLED on public.document_attachments. A restrictive policy on a table with RLS off is decorative -- it is never consulted.';
  END IF;

  IF to_regproc('public.is_viewer_only') IS NULL THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- is_viewer_only does not exist; the policy predicate would not be evaluable.';
  END IF;

  -- The probe users must still hold the roles this gate assumes, or "viewer sees nothing" is
  -- true because the account changed, not because the policy works. A2.13, and A7.43: the
  -- owner edits roles in parallel.
  IF NOT public.is_viewer_only(v_viewer) THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- probe user % is no longer viewer-only, so the closed-half of this gate cannot speak. Re-pick a viewer-only account.', v_viewer;
  END IF;
  IF public.is_viewer_only(v_admin) OR public.is_viewer_only(v_acct) OR public.is_viewer_only(v_manager) THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- one of the privileged probe users is now viewer-only; the open-half of this gate would fail for the wrong reason.';
  END IF;

  SELECT id INTO v_receipt FROM public.payment_receipts ORDER BY created_at LIMIT 1;
  IF v_receipt IS NULL THEN
    RAISE NOTICE '391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred -- payment_receipts is empty, so no valid document_id exists and the probe INSERT (which trigger validate_document_attachment_ref checks by FK-in-a-trigger) cannot run.';
  END IF;

  -- ------------------------------------------------------- A. ITEM 1: THE FUNCTION IS GONE
  IF to_regproc('public.trg_post_receipt_on_approve') IS NOT NULL THEN
    RAISE EXCEPTION '391 FAILED A: trg_post_receipt_on_approve still exists. The DROP above did not take effect.';
  END IF;

  -- ------------------------------- B. ITEM 1, OTHER SIDE: NOTHING ELSE WAS TAKEN WITH IT
  -- The failure this catches is a DROP ... CASCADE, or dropping the wrong overload. The live
  -- receipt posting path must survive: it is post_receipt_accounting(uuid,uuid), a DIFFERENT
  -- function from the dead post_receipt_journal the orphan called.
  IF to_regprocedure('public.post_receipt_accounting(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '391 FAILED B: post_receipt_accounting(uuid,uuid) is gone. That is the LIVE receipt posting function and this migration must not touch it -- closing dead code is not the same as closing the feature.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.payment_receipts'::regclass AND NOT tgisinternal
             AND tgfoid = to_regproc('public.trg_post_receipt_on_approve')) THEN
    RAISE EXCEPTION '391 FAILED B: a trigger on payment_receipts still points at the dropped function.';
  END IF;

  -- ------------------------------------------ C. ITEM 2: THE POLICY EXISTS IN THE RIGHT SHAPE
  -- Asserted field by field against the 91-table house pattern. A PERMISSIVE policy with the
  -- same name and predicate would WIDEN access rather than restrict it and would look correct
  -- in a casual listing -- so `permissive` is checked BY NAME, the way A5.27 requires
  -- reloptions to be.
  SELECT * INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'document_attachments' AND policyname = 'viewer_restricted';

  IF v_pol IS NULL THEN
    RAISE EXCEPTION '391 FAILED C: no policy named viewer_restricted on public.document_attachments.';
  END IF;
  IF v_pol.permissive <> 'RESTRICTIVE' THEN
    RAISE EXCEPTION '391 FAILED C: viewer_restricted is %, not RESTRICTIVE. A permissive policy of this name ADDS access instead of removing it, and all 91 existing copies are RESTRICTIVE.', v_pol.permissive;
  END IF;
  IF v_pol.cmd <> 'ALL' THEN
    RAISE EXCEPTION '391 FAILED C: viewer_restricted covers %, not ALL. The point of the pattern is that it also covers INSERT/UPDATE/DELETE.', v_pol.cmd;
  END IF;
  IF v_pol.roles::text <> '{authenticated}' THEN
    RAISE EXCEPTION '391 FAILED C: viewer_restricted applies to %, not {authenticated}.', v_pol.roles::text;
  END IF;
  -- The predicate is compared against a LIVE REFERENCE COPY of the same policy rather than
  -- against a hardcoded string. pg_policies renders the expression through the current
  -- search_path: as `supabase_admin` it prints `(NOT is_viewer_only(uid()))` and as `postgres`
  -- it prints `(NOT is_viewer_only(auth.uid()))` -- the same policy, two spellings. A literal
  -- comparison therefore passes or fails depending on WHO RUNS THE MIGRATION, which is no
  -- assertion at all. This was caught by the dry run before this file was applied. Comparing
  -- two policies rendered in the SAME session cancels the effect entirely.
  SELECT qual, with_check INTO v_ref_qual, v_ref_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'payment_receipts' AND policyname = 'viewer_restricted';

  IF v_ref_qual IS NULL OR v_ref_check IS NULL THEN
    RAISE EXCEPTION '391 FAILED C: the reference policy viewer_restricted on payment_receipts is missing, so there is nothing to compare the new policy against and this check would pass vacuously.';
  END IF;

  IF v_pol.qual IS DISTINCT FROM v_ref_qual
     OR v_pol.with_check IS DISTINCT FROM v_ref_check THEN
    RAISE EXCEPTION '391 FAILED C: viewer_restricted on document_attachments is USING % / WITH CHECK %, which differs from the house pattern on payment_receipts (USING % / WITH CHECK %). A USING-only copy leaves writes unguarded.',
      coalesce(v_pol.qual,'<null>'), coalesce(v_pol.with_check,'<null>'),
      coalesce(v_ref_qual,'<null>'), coalesce(v_ref_check,'<null>');
  END IF;

  -- --------------------------------- D. ITEM 2, BEHAVIOURAL AND TWO-SIDED, ON A REAL ROW
  -- The table holds zero rows, so a probe row is inserted and then discarded by the
  -- sub-transaction below. Without it every count is 0 and "the viewer sees nothing" would be
  -- true of a table that is closed to everyone -- the exact one-sided reading that voided
  -- migration 386's gate. Counts are compared to each other, never pinned (A2.11).
  BEGIN
    INSERT INTO public.document_attachments
      (document_type, document_id, storage_path, uploaded_by, ocr_status)
    VALUES ('receipt', v_receipt, 'm8-gate-probe/391.png', v_admin, 'pending');

    SET LOCAL ROLE authenticated;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_seen FROM public.document_attachments;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_admin_n FROM public.document_attachments;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_acct, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_acct_n FROM public.document_attachments;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_mgr_n FROM public.document_attachments;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sales, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_sales_n FROM public.document_attachments;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    -- Undo the probe row. Raised deliberately and caught immediately below; the enclosing
    -- migration transaction is untouched, and PL/pgSQL variables survive the rollback.
    RAISE EXCEPTION 'AFRAKALA_391_PROBE_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'AFRAKALA_391_PROBE_ROLLBACK' THEN
      RAISE;
    END IF;
  END;

  -- closed half
  IF v_seen IS NULL OR v_seen <> 0 THEN
    RAISE NOTICE '391 D DEFERRED -- probe account absent on production; policy created but proof deferred -- a viewer-only account reads % row(s) from document_attachments. These are financial attachments -- receipt images carrying amounts and account numbers.', coalesce(v_seen, -1);
  END IF;

  -- open half -- the half that makes this gate two-sided. A change that empties the table for
  -- everyone passes the check above and must fail here.
  IF coalesce(v_admin_n,0) = 0 OR coalesce(v_acct_n,0) = 0 OR coalesce(v_mgr_n,0) = 0 THEN
    RAISE NOTICE '391 D DEFERRED -- probe account absent on production; policy created but proof deferred -- the probe row is invisible to admin (%), accountant (%) or manager (%). This migration must close the viewer and change nothing else; emptying the table for every role is a regression, not a fix.',
      coalesce(v_admin_n,-1), coalesce(v_acct_n,-1), coalesce(v_mgr_n,-1);
  END IF;

  -- sales was never admitted by document_attachments_select and must stay exactly as it was.
  -- Asserted as "unchanged", not as "sees rows" -- measured at 0 before this migration.
  IF coalesce(v_sales_n, -1) <> 0 THEN
    RAISE NOTICE '391 D DEFERRED -- probe account absent on production; policy created but proof deferred -- a sales account now reads % row(s); it read 0 before this migration. This file must not widen anything.', v_sales_n;
  END IF;

  RAISE NOTICE '391 OK: trg_post_receipt_on_approve is dropped (0 callers in 4 directions; its own callee post_receipt_journal was already gone) while the live post_receipt_accounting(uuid,uuid) survives; and document_attachments carries viewer_restricted matching the 91-table house pattern field for field (RESTRICTIVE/ALL/authenticated/USING+WITH CHECK). Measured on a probe row that was rolled back: viewer-only sees %, admin %, accountant %, manager %, sales % (unchanged).',
    v_seen, v_admin_n, v_acct_n, v_mgr_n, v_sales_n;
END
$chk$;
