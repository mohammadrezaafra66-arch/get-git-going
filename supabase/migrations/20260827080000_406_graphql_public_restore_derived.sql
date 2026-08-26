SET client_encoding='UTF8';

-- 406 — OG-78: close the one schema 393's containment could not see, and replace the reasoning
-- that hid it with a criterion derived from the catalogue.
--
-- ─── WHAT 393 DID, AND WHY ITS METHOD WAS BLIND ──────────────────────────────────────────────
-- 393 revoked the global FUNCTIONS default privilege from PUBLIC (the `defaclnamespace = 0` row,
-- grantor `supabase_admin`) and restored it in six named schemas. That list came from a census
-- of schemas where `supabase_admin` owns functions TODAY.
--
-- `graphql_public` owns **zero** functions today, so the census could not see it — and it is the
-- one schema where Supabase's own machinery creates a PUBLIC-grant-dependent function with no
-- explicit GRANT of its own. `extensions.grant_pg_graphql_access()` fires on
-- `ddl_command_end` for `CREATE/ALTER EXTENSION pg_graphql` and does:
--     create or replace function graphql_public.graphql(...) ...;
--     grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
-- Every GRANT names schema `graphql`; the function it just created lives in `graphql_public` and
-- relies entirely on `acldefault()`'s PUBLIC grant. `set_graphql_placeholder()` recreates it the
-- same way with no GRANT at all.
--
-- Latent today, not live: nothing is broken because that function is absent. But any
-- `ALTER EXTENSION pg_graphql UPDATE` recreates it closed to `anon`, `authenticated` AND
-- `service_role`.
--
-- ─── WHY `auth` AND `storage` ARE CORRECTLY ABSENT, WHICH THE CRITERION MUST NOT BREAK ───────
-- Both are reachable by request-facing roles and neither has a restore row, so a naive "every
-- reachable schema needs one" rule would add two unnecessary grants. They need nothing because
-- **`ALTER DEFAULT PRIVILEGES` rows are PER-GRANTOR**: functions in `auth` are owned by
-- `supabase_auth_admin` and in `storage` by `supabase_storage_admin`, so the `supabase_admin`
-- global revoke never applies to them. Measured:
--     auth    | supabase_auth_admin    | 4 functions
--     storage | supabase_storage_admin | 11 functions
--
-- ─── THE CRITERION, DERIVED RATHER THAN LISTED (RULE 14) ─────────────────────────────────────
-- A schema needs a FUNCTIONS restore for grantor `supabase_admin` if and only if
--   (a) `supabase_admin` OWNS the schema — so a function created there carries it as grantor;
--   (b) some request-facing role has USAGE on it; and
--   (c) it is not `public`, which 393 closes deliberately and scopes per-role.
-- Applied to the live catalogue this yields exactly five schemas, four already restored and
-- `graphql_public` missing — which is the finding, reached without anyone naming it.
--
-- The gate below asserts the CRITERION, not a list. A schema added to the catalogue tomorrow
-- that meets it and has no restore fails this assertion — which is what 393's O2 could never do,
-- because it iterated the same array as its own restore statements and so could only ever detect
-- a restore removed from a schema that was already named.

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

DO $verify$
DECLARE
  v_gaps text;
  v_n    int;
BEGIN
  -- THE DERIVED ASSERTION. No schema name appears in it.
  SELECT string_agg(n.nspname, ', ' ORDER BY n.nspname), count(*)
    INTO v_gaps, v_n
    FROM pg_namespace n
   WHERE pg_get_userbyid(n.nspowner) = 'supabase_admin'
     AND n.nspname <> 'public'
     AND (has_schema_privilege('anon',          n.oid, 'USAGE')
       OR has_schema_privilege('authenticated', n.oid, 'USAGE')
       OR has_schema_privilege('service_role',  n.oid, 'USAGE'))
     AND NOT EXISTS (
       SELECT 1 FROM pg_default_acl d
        WHERE d.defaclnamespace = n.oid
          AND d.defaclobjtype = 'f'
          AND d.defaclrole = 'supabase_admin'::regrole);
  IF v_n > 0 THEN
    RAISE EXCEPTION '406: % schema(s) meet the criterion and have no FUNCTIONS restore: %', v_n, v_gaps;
  END IF;

  -- And the criterion must not be vacuous. If it selects nothing at all, the assertion above
  -- passes for the wrong reason and would keep passing after the global revoke was removed.
  SELECT count(*) INTO v_n
    FROM pg_namespace n
   WHERE pg_get_userbyid(n.nspowner) = 'supabase_admin'
     AND n.nspname <> 'public'
     AND (has_schema_privilege('anon',          n.oid, 'USAGE')
       OR has_schema_privilege('authenticated', n.oid, 'USAGE')
       OR has_schema_privilege('service_role',  n.oid, 'USAGE'));
  IF v_n < 2 THEN
    RAISE EXCEPTION '406: the criterion selects only % schema(s); it is not measuring anything', v_n;
  END IF;
  RAISE NOTICE '406: criterion covers % schema(s), all restored', v_n;

  -- The global revoke must still BE there. Restoring every schema would satisfy the gap check
  -- above perfectly and would have undone 393 entirely.
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl
     WHERE defaclnamespace = 0 AND defaclobjtype = 'f'
       AND defaclrole = 'supabase_admin'::regrole) THEN
    RAISE EXCEPTION '406: the global FUNCTIONS revoke is gone — 393 has been undone';
  END IF;

  -- And `public` must still be closed to anon, which is what 393 existed to do.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype = 'f'
       AND a.grantee = 'anon'::regrole
       AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION '406: anon regained the default EXECUTE in public — 393''s purpose is undone';
  END IF;

  RAISE NOTICE '406: verified - global revoke intact, public still closed to anon, no derived gaps';
END
$verify$;
