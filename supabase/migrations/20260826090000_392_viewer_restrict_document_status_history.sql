-- 392 -- close a live viewer-only read AND write path on public.document_status_history.
--
-- THIS IS AN INDEPENDENT FINDING, NOT A RECONSTRUCTION OF OG-15's SECOND TABLE.
--
--   OG-15's answer named `document_attachments` and `document_audit_log`. The first was done
--   by migration 391. **`document_audit_log` never existed.** The name originated in a
--   FABRICATED report on 2026-08-25 -- the same session whose M5C completion claim had no
--   commit, no branch and no PR -- and was then repeated, unverified, in the owner's answer.
--   `to_regclass` returns NULL and a whole-tree grep returns nothing but the line recording
--   the answer itself. It is the SECOND fabricated object name to propagate this way; the
--   first was `document_serial_counters` / `next_serial`, closed as OG-59. See A0.9.
--
--   So this migration does NOT claim to be "what OG-15 meant". No guess was made about that.
--   `document_status_history` was chosen on its own evidence, measured below, and would be
--   worth closing even if OG-15 had never been raised. `audit_logs` -- the other candidate --
--   already carries `viewer_restricted` and is owed nothing.
--
-- WHAT WAS MEASURED, AND IT IS A REAL HOLE, NOT DEFENCE IN DEPTH.
--
--   Migration 391's item 2 turned out to be defence in depth: the viewer already read nothing
--   from `document_attachments`, and that was reported as such. **This one is different, and
--   the difference is the whole reason the file exists.**
--
--   `document_status_history` carried exactly two PERMISSIVE policies, both to {public}:
--     * SELECT admits `d.uploaded_by = auth.uid()` OR admin OR manager
--     * INSERT admits anyone whose `changed_by` is their own uid OR NULL
--
--   Both tables involved hold ZERO rows live, so an empty-table measurement would have been
--   vacuous. Measured instead on a probe document uploaded BY the viewer-only account, inside
--   BEGIN/ROLLBACK -- because the question is precisely whether the `uploaded_by` branch is a
--   live path for that role or only a theoretical one:
--
--     role                     | is_viewer_only | history rows visible
--     -------------------------+----------------+---------------------
--     viewer-only 20303d30     | t              | 1     <-- LIVE READ PATH
--     admin       05098088     | f              | 1
--     accountant  90c0479f     | f              | 0     <-- never admitted by this policy
--     manager     a0a4afe5     | f              | 1
--     sales       00ebe9d3     | f              | 0     <-- never admitted
--
--     viewer-only INSERT into document_status_history .... INSERT 0 1  -- SUCCEEDED
--
--   So a viewer-only account could **read** the status history of any document it uploaded,
--   and **write** rows into that history at will. On an audit trail the write is arguably the
--   worse of the two: it lets a role that should be read-only author the record of who changed
--   what. `FOR ALL` closes both in one policy, which is exactly why the house pattern is
--   `FOR ALL` and not `FOR SELECT`.
--
--   Note `accountant` reads 0 here while reading the parent `documents` row fine -- the
--   history policy admits only uploader/admin/manager. That asymmetry predates this file and
--   is left exactly as it is; this migration must not widen it.
--
-- THE PATTERN IS COPIED, NOT INVENTED (A1.5). Read live from `pg_policies`: 91 tables carry
-- `viewer_restricted` and all 91 are identical -- AS RESTRICTIVE, FOR ALL, TO authenticated,
-- USING and WITH CHECK both `(NOT is_viewer_only(auth.uid()))`. Migration 281 established the
-- executable form; 391 is the most recent copy. `is_viewer_only` is true only when `viewer`
-- is the user's SOLE role, so this cannot blind the owner's own multi-role account.
--
-- Rollback: docs/verification/392-down.sql, dry-run proved forward-then-back before this file
-- was applied.

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

DROP POLICY IF EXISTS viewer_restricted ON public.document_status_history;
CREATE POLICY viewer_restricted ON public.document_status_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- ============================================================================= THE GATE
-- ONE gate (A2.9), two-sided (A2.10): the viewer is closed on BOTH read and write, AND the
-- four other roles are unchanged row for row. A change that empties the table for everyone
-- must FAIL -- that is check E, and it is behavioural, not structural.
DO $chk$
DECLARE
  v_viewer  CONSTANT uuid := '20303d30-ab9d-4fc6-be96-ec5db1dcb647';  -- is_viewer_only = t
  v_admin   CONSTANT uuid := '05098088-2849-43f4-8eb5-7c473c3832ec';
  v_acct    CONSTANT uuid := '90c0479f-410d-4fff-9e00-34bbba1cce2b';
  v_mgr     CONSTANT uuid := 'a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b';
  v_sales   CONSTANT uuid := '00ebe9d3-b467-453c-89d6-08bab46335c2';
  v_doc     CONSTANT uuid := '00000000-0000-0000-0000-00000000e392';
  v_pol       record;
  v_ref_qual  text;
  v_ref_check text;
  v_viewer_n  bigint;
  v_admin_n   bigint;
  v_acct_n    bigint;
  v_mgr_n     bigint;
  v_sales_n   bigint;
  v_viewer_wrote boolean := NULL;
BEGIN
  -- ------------------------------------------------------------------ A. VACUITY GUARDS
  -- Every count below is a comparison and a comparison against an unreachable surface passes
  -- for the wrong reason. These go first, as in 390 and 391.
  IF to_regclass('public.document_status_history') IS NULL THEN
    RAISE EXCEPTION '392 FAILED A: public.document_status_history does not exist; every check below would pass vacuously.';
  END IF;

  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid='public.document_status_history'::regclass) THEN
    RAISE EXCEPTION '392 FAILED A: RLS is DISABLED on document_status_history. A restrictive policy on a table with RLS off is never consulted -- it is decorative.';
  END IF;

  IF to_regproc('public.is_viewer_only') IS NULL THEN
    RAISE EXCEPTION '392 FAILED A: is_viewer_only does not exist; the policy predicate would not be evaluable.';
  END IF;

  -- The probe accounts must still hold the roles this gate assumes (A7.43: the owner edits
  -- roles in parallel). Otherwise "the viewer sees nothing" could be true because the account
  -- changed rather than because the policy works.
  IF NOT public.is_viewer_only(v_viewer) THEN
    RAISE EXCEPTION '392 FAILED A: probe account % is no longer viewer-only, so the closed half of this gate cannot speak.', v_viewer;
  END IF;
  IF public.is_viewer_only(v_admin) OR public.is_viewer_only(v_mgr) THEN
    RAISE EXCEPTION '392 FAILED A: admin or manager probe account is now viewer-only; the open half would fail for the wrong reason.';
  END IF;

  -- ----------------------------------------------- B. THE POLICY EXISTS IN THE RIGHT SHAPE
  SELECT * INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='document_status_history' AND policyname='viewer_restricted';

  IF v_pol IS NULL THEN
    RAISE EXCEPTION '392 FAILED B: no policy named viewer_restricted on document_status_history.';
  END IF;
  IF v_pol.permissive <> 'RESTRICTIVE' THEN
    RAISE EXCEPTION '392 FAILED B: viewer_restricted is %, not RESTRICTIVE. A permissive policy of this name ADDS access instead of removing it; all 91 existing copies are RESTRICTIVE.', v_pol.permissive;
  END IF;
  IF v_pol.cmd <> 'ALL' THEN
    RAISE EXCEPTION '392 FAILED B: viewer_restricted covers %, not ALL. FOR SELECT would leave the measured viewer INSERT path wide open, which is half the reason this migration exists.', v_pol.cmd;
  END IF;
  IF v_pol.roles::text <> '{authenticated}' THEN
    RAISE EXCEPTION '392 FAILED B: viewer_restricted applies to %, not {authenticated}.', v_pol.roles::text;
  END IF;

  -- ------------------------------------- C. THE PREDICATE, COMPARED TO A LIVE REFERENCE COPY
  -- NOT to a hardcoded string. pg_policies renders the expression through the current
  -- search_path: as supabase_admin it prints `uid()`, as postgres `auth.uid()` -- the same
  -- policy, two spellings. A literal comparison would pass or fail depending on WHO RAN THE
  -- MIGRATION, which is no assertion at all. Migration 391's dry run caught exactly that bug
  -- in its own gate; this file is written with the correction from the start.
  SELECT qual, with_check INTO v_ref_qual, v_ref_check
    FROM pg_policies
   WHERE schemaname='public' AND tablename='payment_receipts' AND policyname='viewer_restricted';

  IF v_ref_qual IS NULL OR v_ref_check IS NULL THEN
    RAISE EXCEPTION '392 FAILED C: the reference policy viewer_restricted on payment_receipts is missing, so there is nothing to compare against and this check would pass vacuously.';
  END IF;

  IF v_pol.qual IS DISTINCT FROM v_ref_qual OR v_pol.with_check IS DISTINCT FROM v_ref_check THEN
    RAISE EXCEPTION '392 FAILED C: predicate is USING % / WITH CHECK %, which differs from the house pattern on payment_receipts (USING % / WITH CHECK %). A USING-only copy leaves the viewer INSERT path open.',
      coalesce(v_pol.qual,'<null>'), coalesce(v_pol.with_check,'<null>'),
      coalesce(v_ref_qual,'<null>'), coalesce(v_ref_check,'<null>');
  END IF;

  -- ------------------------------- D/E. BEHAVIOURAL, ON A REAL ROW, BOTH DIRECTIONS AND BOTH
  --                                      COMMANDS. Discarded by the sub-transaction below.
  -- Both tables hold zero rows live, so without a probe row every count is 0 and "the viewer
  -- sees nothing" would be equally true of a table closed to everyone -- the one-sided reading
  -- that voided migration 386's gate. The probe document is uploaded BY the viewer so that the
  -- `d.uploaded_by = auth.uid()` branch is actually exercised. Counts are compared to each
  -- other, never pinned (A2.11).
  BEGIN
    INSERT INTO public.documents (id, type, uploaded_by, storage_path, file_name, status)
    VALUES (v_doc, 'invoice', v_viewer, 'gate392-probe/doc.pdf', 'gate392.pdf', 'pending_review');

    INSERT INTO public.document_status_history (document_id, from_status, to_status, changed_by, note)
    VALUES (v_doc, 'pending_review', 'confirmed', v_admin, 'gate 392 probe');

    SET LOCAL ROLE authenticated;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role','authenticated')::text, true);
    SELECT count(*) INTO v_viewer_n FROM public.document_status_history;

    -- the WRITE half of the closed direction, measured rather than assumed
    BEGIN
      INSERT INTO public.document_status_history (document_id, from_status, to_status, changed_by, note)
      VALUES (v_doc, 'confirmed', 'rejected', v_viewer, 'gate 392 viewer write attempt');
      v_viewer_wrote := true;
    EXCEPTION WHEN insufficient_privilege THEN
      v_viewer_wrote := false;
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    SELECT count(*) INTO v_admin_n FROM public.document_status_history;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_acct, 'role','authenticated')::text, true);
    SELECT count(*) INTO v_acct_n FROM public.document_status_history;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role','authenticated')::text, true);
    SELECT count(*) INTO v_mgr_n FROM public.document_status_history;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sales, 'role','authenticated')::text, true);
    SELECT count(*) INTO v_sales_n FROM public.document_status_history;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    RAISE EXCEPTION 'AFRAKALA_392_PROBE_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'AFRAKALA_392_PROBE_ROLLBACK' THEN RAISE; END IF;
  END;

  -- closed half -- READ
  IF v_viewer_n IS NULL OR v_viewer_n <> 0 THEN
    RAISE EXCEPTION '392 FAILED D: a viewer-only account still reads % history row(s) for a document it uploaded. That is the exact live path this migration exists to close.', coalesce(v_viewer_n,-1);
  END IF;

  -- closed half -- WRITE. Measured before this migration as SUCCEEDING.
  IF v_viewer_wrote IS DISTINCT FROM false THEN
    RAISE EXCEPTION '392 FAILED D: a viewer-only account could still INSERT into document_status_history (result %). The INSERT policy is {public} and checks only changed_by, so a FOR SELECT policy would not have closed this. It must be denied.', coalesce(v_viewer_wrote::text,'<null>');
  END IF;

  -- open half -- the half that makes this gate two-sided. A change that empties the table for
  -- everyone passes both checks above and must fail here.
  IF coalesce(v_admin_n,0) = 0 OR coalesce(v_mgr_n,0) = 0 THEN
    RAISE EXCEPTION '392 FAILED E: the probe history row is invisible to admin (%) or manager (%). Closing the viewer must not empty the table for the roles that legitimately read it.',
      coalesce(v_admin_n,-1), coalesce(v_mgr_n,-1);
  END IF;

  -- unchanged half -- accountant and sales read 0 today because this policy never admitted
  -- them. Asserted as "still 0", not as "sees rows": this file must not widen anything either.
  IF coalesce(v_acct_n,-1) <> 0 OR coalesce(v_sales_n,-1) <> 0 THEN
    RAISE EXCEPTION '392 FAILED E: accountant reads % and sales reads % history rows; both read 0 before this migration. This file closes one door and opens none.',
      coalesce(v_acct_n,-1), coalesce(v_sales_n,-1);
  END IF;

  RAISE NOTICE '392 OK: document_status_history carries viewer_restricted matching the house pattern field for field (RESTRICTIVE/ALL/authenticated/USING+WITH CHECK, predicate compared to a live reference copy). Measured on a probe document uploaded BY the viewer and then rolled back: viewer-only now reads % rows (was 1) and its INSERT is DENIED (it SUCCEEDED before); admin %, manager % still read the row; accountant % and sales % unchanged.',
    v_viewer_n, v_admin_n, v_mgr_n, v_acct_n, v_sales_n;
END
$chk$;
