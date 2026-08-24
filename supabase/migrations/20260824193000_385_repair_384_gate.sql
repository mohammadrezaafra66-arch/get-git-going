-- 385 — repair migration 384's assertion gate. Creates nothing, revokes nothing.
--
-- This is a REPAIR, not a second gate. The programme caps each mission at one assertion gate and
-- says that if it is defeated it must be repaired rather than supplemented. 384 is applied and
-- committed and this repository does not edit an applied migration (AGENTS.md rule 6), so the
-- repair ships here and **384's checks 4 and 5 are retired by this file**. 384's checks 1, 2 and 3
-- stand unchanged and are not restated below.
--
-- ============================================================================
-- A CORRECTION FIRST: "IT CANNOT BE PREVENTED, ONLY DETECTED" WAS TOO STRONG
-- ============================================================================
--
-- 384's header states, categorically, that no in-database mechanism can block
-- `ALTER ROLE anon BYPASSRLS`. An independent review refuted it, and re-measuring here confirmed
-- the refutation and then found the reviewer's version incomplete in the direction that matters.
--
-- `supautils` is loaded on this server (`session_preload_libraries = supautils`) and reserves a
-- list of roles that only a superuser may modify:
--
--   supautils.reserved_roles | supabase_admin, supabase_auth_admin, supabase_storage_admin,
--     supabase_read_only_user, supabase_realtime_admin, supabase_replication_admin,
--     dashboard_user, pgbouncer, service_role*, authenticator*, authenticated*, anon*
--
-- Measured 2026-08-24, each case inside BEGIN … ROLLBACK, as the NON-superuser role `postgres`:
--
--   ALTER ROLE anon BYPASSRLS                 -> 42501  "anon" is a reserved role, only
--                                                        superusers can modify it
--   ALTER ROLE authenticated BYPASSRLS        -> blocked, same message
--   ALTER ROLE authenticator BYPASSRLS        -> blocked, same message
--   ALTER ROLE products_api_readonly BYPASSRLS-> **SUCCEEDED**
--   CREATE ROLE _m9r_new BYPASSRLS            -> **SUCCEEDED**
--
-- and as the superuser `supabase_admin`:
--
--   ALTER ROLE anon BYPASSRLS                 -> SUCCEEDED  (supautils does not constrain superusers)
--
-- So the true statement is narrower than 384's and narrower than the review's:
--
--   * `anon`, `authenticated` and `authenticator` ARE protected from every non-superuser. That is a
--     real first line of defence and 384 was wrong to say none existed.
--   * `products_api_readonly` — a request-facing role, in 384's own `request_roles` array — is NOT
--     on the reserved list, so the non-superuser, login-capable role `postgres` can hand it
--     `BYPASSRLS` directly.
--   * Creating a brand-new bypassing role is not blocked for anyone.
--   * A superuser is not constrained at all.
--
-- The assertion is therefore not "the only control" — it is the control for exactly the paths
-- supautils leaves open, which is a better reason to have it than the one 384 gave. What 384 got
-- right stands: event triggers genuinely cannot fire on `ALTER ROLE`
-- (`ERROR: event triggers are not supported for ALTER ROLE`; roles are cluster-wide, event triggers
-- per-database), and `ON login` triggers do not exist on PostgreSQL 15.
--
-- **384's check 1 raises an exception whose text still says "PostgreSQL cannot prevent ALTER ROLE,
-- so this assertion is the only control".** That message cannot be repaired from here, because on
-- replay 384 runs first and an applied migration is not edited. An operator who sees it should read
-- this header: the first thing to check is the supautils reserved-roles configuration, and the role
-- most likely to have been changed is the one supautils does not cover.
--
-- ============================================================================
-- THE TWO DEFECTS THIS FILE REPAIRS
-- ============================================================================
--
-- P-A — CHECK 5 IS A BARE COUNT, SO A SUPERUSER SWAP PASSES. 384's check 1 comment says in so many
--   words that "a count cannot see a swap — which is how gate 381 fell in M3", and then check 5
--   commits exactly that error: `SELECT count(*) INTO n FROM pg_roles WHERE rolsuper`. Reproduced
--   here (order matters — promoting must come first, because `ALTER ROLE supabase_admin
--   NOSUPERUSER` strips the running session's own superuser status and blocks the next statement):
--
--     ALTER ROLE dashboard_user SUPERUSER;  ALTER ROLE supabase_admin NOSUPERUSER;
--       superusers now: dashboard_user      dashboard_user canlogin: true
--       384 verdict: OK
--
--   End state: a login-capable role is the sole superuser, `supabase_admin` is not a superuser at
--   all, and 384's success notice asserts the opposite in plain text. Repaired by asserting the SET
--   by name, the way check 1 already does for `rolbypassrls`.
--
-- P-B — CHECK 4 CLAIMS "SET ROLE REACHABILITY" BUT JOINS `pg_auth_members` DIRECTLY, SO IT SEES
--   EXACTLY ONE HOP. Reproduced:
--
--     CREATE ROLE _m9m NOLOGIN INHERIT;  GRANT service_role TO _m9m;  GRANT _m9m TO anon;
--       pg_has_role('anon','service_role','USAGE') -> true
--       384 verdict: OK
--
--   `anon` really can `SET ROLE service_role` while the gate reports that the only path is
--   `authenticator -> service_role`. The direct grant IS caught, so the check works one edge deep
--   and no further. Repaired with `pg_has_role`, which follows the whole membership graph.
--
--   THE OBVIOUS REPAIR IS ALSO WRONG, and this file's first draft made the mistake. `pg_has_role`
--   takes a privilege argument, and the two are not interchangeable:
--
--     USAGE  — the role's privileges arrive automatically, i.e. through INHERIT
--     MEMBER — the role can SET ROLE into it
--
--   `BYPASSRLS` is an attribute and does not inherit; `SET ROLE` is the only way to acquire it,
--   which is the whole reason 384 check 4 exists. So `USAGE` tests the one mechanism that cannot
--   confer it. Measured — `GRANT supabase_read_only_user TO products_api_readonly`:
--
--     pg_has_role('products_api_readonly','supabase_read_only_user','USAGE')  -> false
--     pg_has_role('products_api_readonly','supabase_read_only_user','MEMBER') -> true
--     draft verdict with USAGE: OK
--
--   `products_api_readonly` and `authenticator` are both NOINHERIT, so a `USAGE` check is blind to
--   exactly the two request-facing roles most likely to be granted something. The two-hop `anon`
--   case caught it only because `anon` happens to be INHERIT. This is the same identity-versus-
--   effect error that defeated five earlier gates in this programme, wearing a new hat: the
--   question is not "does this role hold the privileges" but "can this role become that role".
--
-- Two further clauses, both inside the subject check 4 already claims rather than beyond it:
--
--   * `pg_read_all_data` / `pg_write_all_data` on a request-facing role. Measured: with
--     `GRANT pg_read_all_data TO anon`, 384 passes. This is NOT an RLS bypass — measured as `anon`,
--     `audit_logs` still returned 0 rows, because RLS continues to apply. But it silently voids the
--     entire OG-25 privilege-revocation result, and because the privilege arrives through role
--     membership rather than `relacl` it is invisible to gates 380, 382 and 383 and to the
--     catalogue digest the whole programme regresses against.
--   * `rolconfig`. Measured: `ALTER ROLE authenticator SET role = 'service_role'` passes 384, and
--     would make every new pooled connection start as `service_role`. PostgREST issues
--     `SET LOCAL ROLE` per request so the practical impact is small, but a check that claims to
--     cover SET ROLE reachability should not be blind to a role that starts there.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
-- ROLLBACK: docs/verification/385-down.sql — a documented no-op, written and dry-run proved first.

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  unexpected text;
  bad        text;
  -- kept identical to 384 so the two files cannot drift apart silently
  allowed       text[] := ARRAY['postgres','service_role','supabase_admin','supabase_read_only_user'];
  request_roles text[] := ARRAY['anon','authenticated','authenticator','products_api_readonly'];
  -- the only superuser this installation is supposed to have. Asserted by NAME, not by count.
  superusers    text[] := ARRAY['supabase_admin'];
  -- membership in either of these hands out schema-wide data access without touching any relacl
  blanket       text[] := ARRAY['pg_read_all_data','pg_write_all_data'];
BEGIN
  ---------------------------------------------------------------------------
  -- A. REPLACES 384 CHECK 5. The set of superusers, by name, in both directions:
  --    an extra superuser and a swapped-out one are different failures and the
  --    message has to be able to say which.
  ---------------------------------------------------------------------------
  SELECT string_agg(rolname, ', ' ORDER BY rolname) INTO unexpected
    FROM pg_roles WHERE rolsuper AND NOT (rolname = ANY (superusers));
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '385: unexpected superuser(s): %. A superuser bypasses RLS whatever rolbypassrls says. 384 check 5 counted superusers instead of naming them, so it passed while dashboard_user held this alone', unexpected;
  END IF;

  SELECT string_agg(s, ', ' ORDER BY s) INTO unexpected
    FROM unnest(superusers) s
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s AND rolsuper);
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '385: expected superuser(s) % are not superusers. Either the role was demoted or it no longer exists; in both cases nothing above can be trusted', unexpected;
  END IF;

  ---------------------------------------------------------------------------
  -- B. REPLACES 384 CHECK 4. SET ROLE reachability, TRANSITIVELY and by the
  --    right privilege. pg_has_role follows the whole membership graph, where
  --    the pg_auth_members join 384 used stops at the first edge; and MEMBER
  --    asks 'can this role SET ROLE into that one', which is the only way an
  --    attribute travels. USAGE would ask about INHERIT and miss both NOINHERIT
  --    request-facing roles.
  ---------------------------------------------------------------------------
  SELECT string_agg(m || ' -> ' || g.rolname, ', ' ORDER BY m, g.rolname) INTO unexpected
    FROM unnest(request_roles) m
    CROSS JOIN pg_roles g
   WHERE (g.rolbypassrls OR g.rolsuper)
     AND g.rolname <> m
     AND pg_has_role(m, g.oid, 'MEMBER')   -- MEMBER = can SET ROLE. USAGE would test INHERIT,
                                           -- which cannot confer an attribute. See header.
     AND NOT (m = 'authenticator' AND g.rolname = 'service_role');
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '385: request-facing role(s) can SET ROLE into a role that bypasses RLS: %. Only authenticator -> service_role is expected. This is checked transitively — the path may run through one or more intermediate roles, which is what 384 check 4 could not see', unexpected;
  END IF;

  ---------------------------------------------------------------------------
  -- C. Blanket data-access membership on a request-facing role. Not an RLS
  --    bypass — RLS still filters — but it restores schema-wide SELECT/INSERT
  --    without writing a single grant, so no relacl-based gate and no catalogue
  --    digest in this programme can see it.
  ---------------------------------------------------------------------------
  SELECT string_agg(m || ' is a member of ' || b, ', ' ORDER BY m, b) INTO bad
    FROM unnest(request_roles) m CROSS JOIN unnest(blanket) b
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = b)
     AND pg_has_role(m, b, 'MEMBER');  -- MEMBER, not USAGE: a NOINHERIT member still reaches it
                                       -- by SET ROLE, and two of the four roles here are NOINHERIT
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '385: %. That confers schema-wide access through role membership rather than through relacl, so migrations 380, 382 and 383 and the catalogue digest are all blind to it. RLS still applies, so this is not an RLS bypass — it is the OG-25 revocation result being voided', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- D. rolconfig: no request-facing role may start its session as something
  --    else. `ALTER ROLE authenticator SET role = 'service_role'` is the case
  --    that passed 384.
  ---------------------------------------------------------------------------
  SELECT string_agg(r.rolname || ': ' || cfg, ', ' ORDER BY r.rolname) INTO bad
    FROM pg_roles r, unnest(coalesce(r.rolconfig, ARRAY[]::text[])) cfg
   WHERE r.rolname = ANY (request_roles)
     AND lower(split_part(cfg, '=', 1)) IN ('role', 'session_authorization');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '385: request-facing role(s) carry a session-role default: %. Every new connection would begin as that role before PostgREST issues its own SET LOCAL ROLE', bad;
  END IF;

  RAISE NOTICE '385 OK: the set of superusers is exactly {supabase_admin}, asserted by name rather than by count; no request-facing role can SET ROLE into a bypassing or superuser role by any path length (tested with pg_has_role MEMBER, not USAGE, because an attribute travels only through SET ROLE and two of the four request-facing roles are NOINHERIT), the one permitted exception being authenticator -> service_role; none of the four request-facing roles is a member of pg_read_all_data or pg_write_all_data; and none carries a role/session_authorization default in rolconfig. Retires migration 384 checks 4 and 5; 384 checks 1, 2 and 3 stand. Note 384 header and check-1 message overstate the case: supautils DOES block ALTER ROLE for anon, authenticated and authenticator, but not for products_api_readonly, not for CREATE ROLE, and not for a superuser';
END
$chk$;
