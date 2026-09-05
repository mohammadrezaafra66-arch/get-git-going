BEGIN;

-- Production hotfix 2026-08-31: close the unauthenticated path to
-- revoke_user_role_txt. anon and PUBLIC can currently execute it, letting an
-- unauthenticated caller strip an administrator's role via port 8000.
-- authenticated keeps its explicit grant, so the real path is unaffected.
-- This does NOT add an internal guard against authenticated misuse (OG-74).

REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM PUBLIC;

DO $verify$
DECLARE v_anon bool; v_auth bool;
BEGIN
  SELECT has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_anon, v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'revoke_user_role_txt';
  IF v_anon THEN
    RAISE EXCEPTION 'hotfix: anon still executes revoke_user_role_txt';
  END IF;
  IF NOT v_auth THEN
    RAISE EXCEPTION 'hotfix: authenticated lost access - the revoke went too far';
  END IF;
  RAISE NOTICE 'hotfix: anon can no longer execute revoke_user_role_txt; authenticated still can';
END
$verify$;

COMMIT;
