SET client_encoding = 'UTF8';

-- 579 — restore EXECUTE on person_merge helpers for authenticated.
--
-- Migration 463 revoked EXECUTE on public._person_merge_repoint from
-- authenticated under the false premise that person_merge is SECURITY DEFINER
-- and would keep calling the helper as the owner.
--
-- Measured fact (239 and every later recreate through 552): person_merge is
-- SECURITY INVOKER. Nested EXECUTE checks therefore run as the signed-in role.
-- After 463, admin/manager merge from the UI fails with:
--   permission denied for function _person_merge_repoint
--
-- The real control stays in the helpers: _person_merge_assert_person_fk
-- re-checks admin/manager and that (table, column) is a persons FK.
-- Restoring the 239 grant is the correct fix; re-granting does not reopen
-- the hole 463 thought it closed, because the body guard was already there.
--
-- Also restore _person_merge_count_refs (same call path in Step F) so the
-- post-merge verification sweep does not fail next.

REVOKE ALL ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._person_merge_count_refs(text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._person_merge_count_refs(text, text, uuid)
  TO authenticated, service_role;

DO $verify$
DECLARE
  v_auth_repoint boolean;
  v_auth_count   boolean;
  v_anon_repoint boolean;
  v_invoker      boolean;
BEGIN
  SELECT has_function_privilege('authenticated',
           'public._person_merge_repoint(text,text,uuid,uuid)'::regprocedure, 'EXECUTE')
    INTO v_auth_repoint;
  SELECT has_function_privilege('authenticated',
           'public._person_merge_count_refs(text,text,uuid)'::regprocedure, 'EXECUTE')
    INTO v_auth_count;
  SELECT has_function_privilege('anon',
           'public._person_merge_repoint(text,text,uuid,uuid)'::regprocedure, 'EXECUTE')
    INTO v_anon_repoint;
  SELECT NOT p.prosecdef
    INTO v_invoker
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'person_merge'
     AND pg_get_function_identity_arguments(p.oid) = 'p_winner_id uuid, p_loser_id uuid, p_reason text';

  IF NOT v_auth_repoint THEN
    RAISE EXCEPTION '558: authenticated still cannot EXECUTE _person_merge_repoint';
  END IF;
  IF NOT v_auth_count THEN
    RAISE EXCEPTION '558: authenticated still cannot EXECUTE _person_merge_count_refs';
  END IF;
  IF v_anon_repoint THEN
    RAISE EXCEPTION '558: anon must not EXECUTE _person_merge_repoint';
  END IF;
  IF NOT v_invoker THEN
    RAISE EXCEPTION '558: person_merge is unexpectedly SECURITY DEFINER; revisit this grant';
  END IF;

  RAISE NOTICE '558 OK: merge helpers executable by authenticated; person_merge is INVOKER; anon blocked';
END
$verify$;

NOTIFY pgrst, 'reload schema';
