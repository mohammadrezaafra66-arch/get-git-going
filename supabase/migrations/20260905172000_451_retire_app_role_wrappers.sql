SET client_encoding='UTF8';

-- 451 (B-2): retire the two app_role-typed role wrappers.
--
--   public.assign_user_role(uuid, app_role)
--   public.revoke_user_role(uuid, app_role)
--
-- The live path is the _txt pair, which migration 436 gated behind an explicit
-- admin check. PRECONDITION, asserted below rather than assumed: 436 must be
-- applied, i.e. assign_user_role_txt's body must contain has_any_role. Dropping
-- these wrappers while their target is ungated would reopen a privilege
-- escalation, so the assertion aborts the migration if 436 is missing.
--
-- CAUTION: has_role and has_any_role each exist as an OVERLOAD PAIR (app_role
-- and text). These drops name exact signatures so neither pair is disturbed;
-- the assertions below prove all four survive.
--
-- Zero-reference verified 2026-09-05 across all four frontend call idioms in
-- src/ and server/ and every database catalogue in every schema. The _txt
-- variants are distinct identifiers and are not matched by these searches.
-- No CASCADE.

DO $$
DECLARE src text;
BEGIN
  SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'assign_user_role_txt';
  IF src IS NULL THEN
    RAISE EXCEPTION '451: assign_user_role_txt not found; migration 436 is not applied';
  END IF;
  IF src NOT LIKE '%has_any_role%' THEN
    RAISE EXCEPTION '451: assign_user_role_txt is UNGATED (no has_any_role); refusing to drop the wrappers';
  END IF;

  SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'revoke_user_role_txt';
  IF src IS NULL THEN
    RAISE EXCEPTION '451: revoke_user_role_txt not found; migration 436 is not applied';
  END IF;
  IF src NOT LIKE '%has_any_role%' THEN
    RAISE EXCEPTION '451: revoke_user_role_txt is UNGATED (no has_any_role); refusing to drop the wrappers';
  END IF;
END $$;

DROP FUNCTION public.assign_user_role(uuid, public.app_role);
DROP FUNCTION public.revoke_user_role(uuid, public.app_role);

DO $$
DECLARE n int;
BEGIN
  -- the app_role wrappers are gone
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN ('assign_user_role','revoke_user_role');
  IF n <> 0 THEN RAISE EXCEPTION '451: expected 0 app_role wrappers remaining, found %', n; END IF;

  -- the live _txt pair survives
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN ('assign_user_role_txt','revoke_user_role_txt');
  IF n <> 2 THEN RAISE EXCEPTION '451: _txt pair expected 2, found %', n; END IF;

  -- BOTH overloads of BOTH role predicates survive untouched
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'has_role';
  IF n <> 2 THEN RAISE EXCEPTION '451: has_role overload pair broken, expected 2 found %', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'has_any_role';
  IF n <> 2 THEN RAISE EXCEPTION '451: has_any_role overload pair broken, expected 2 found %', n; END IF;
END $$;
