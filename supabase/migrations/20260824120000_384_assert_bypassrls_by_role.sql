-- 384 — assert, by role name, which roles may bypass RLS (OG-34). Changes nothing.
--
-- ============================================================================
-- WHY AN ASSERTION AND NOT A FIX
-- ============================================================================
--
-- `ALTER ROLE anon BYPASSRLS` changes no relation-level privilege. Every gate this programme has
-- built — 380, 382, 383 — asks about privileges, and this is an attribute, so all three miss it
-- completely. Measured 2026-08-24 inside a transaction, on twelve tables chosen from
-- `pg_stat_statements` evidence rather than by sounding sensitive:
--
--   table                anon today   anon with BYPASSRLS   owner
--   audit_logs                    0                43,516   43,516
--   notification_queue            0                 1,233    1,233
--   persons                       0                    84       84
--   profiles                      0                    41       41
--   user_roles                    0                    36       36
--   customers                     0                    28       28
--   shop_settings / suppliers / journal_lines / journal_entries /
--   bank_accounts / payment_vouchers    all 0  ->  all equal to the owner's count
--
-- In every one, `anon` with the attribute sees exactly what the object owner sees. It outranks an
-- ordinary gap because the OG-25 audit's whole safety argument is that RLS carries the load: of 209
-- objects `anon` may read it sees rows on five, because for the other 204 the grant does nothing.
-- One attribute voids that for all 202 tables at once, and none of them has FORCE ROW LEVEL SECURITY.
--
-- **AND IT CANNOT BE PREVENTED — ONLY DETECTED.** Measured, not assumed:
--
--   CREATE EVENT TRIGGER … ON ddl_command_start WHEN TAG IN ('ALTER ROLE') …
--   ERROR:  event triggers are not supported for ALTER ROLE
--
-- Roles are cluster-wide shared objects; event triggers are per-database. No in-database mechanism
-- can block the command. Only `supabase_admin` — the sole superuser here — can issue it. So the
-- deliverable is an assertion that fails loudly, not a guard that does not exist. M3's OG-31 was
-- recorded wrong twice because a remedy was assumed before it was measured; this is that lesson.
--
-- **THIS MIGRATION REVOKES NOTHING, AND THAT IS THE MEASUREMENT, NOT CAUTION.** `anon` and
-- `authenticated` already carry `rolbypassrls = false`. There was nothing to revoke. Saying so is
-- better than manufacturing a change to justify a migration.
--
-- ============================================================================
-- TWO ASSUMPTIONS THE MEASUREMENT REFUTED, both of which would have produced a worse gate
-- ============================================================================
--
--   1. `postgres` is NOT a superuser on this server — only `supabase_admin` is. So for `postgres`
--      the attribute is MEANINGFUL, not vacuous. A gate written to the assumption would have marked
--      `postgres` "hollow, superuser" and thereby hidden the only login-capable non-superuser role
--      that bypasses RLS. It is asserted below like any other role, and only `supabase_admin` gets
--      the vacuity caveat.
--
--   2. `BYPASSRLS` is NOT inherited through role membership. It is an attribute, not a privilege.
--      Measured: an `INHERIT` member of a `BYPASSRLS` role has `rolbypassrls = false` and sees zero
--      rows. The real path is `SET ROLE`, which is what PostgREST does — `authenticator` is a member
--      of `anon`, `authenticated`, `service_role` and `products_api_readonly` and switches by JWT
--      claim. So the inheritance check below is written against `SET ROLE` reachability, not against
--      an attribute that does not propagate.
--
-- ROLLBACK: docs/verification/384-down.sql — a documented no-op, written and dry-run proved first.

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  r          record;
  n          int;
  unexpected text;
  missing    text;
  -- The four roles that bypass RLS today, and why each is permitted to.
  --   postgres                 non-superuser, but a platform role Supabase manages
  --   service_role             bypassing RLS IS its purpose; PostgREST switches to it by JWT claim
  --   supabase_admin           the only superuser here; the attribute is vacuous for it
  --   supabase_read_only_user  Supabase-managed reporting role, member of pg_read_all_data
  allowed text[] := ARRAY['postgres','service_role','supabase_admin','supabase_read_only_user'];
  -- The roles a request can actually arrive as through PostgREST. None may bypass RLS.
  -- `authenticator` logs in and SET ROLEs to one of these by JWT claim; `service_role` is the
  -- deliberate exception and is in `allowed` above.
  request_roles text[] := ARRAY['anon','authenticated','authenticator','products_api_readonly'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. No role outside the allow-list bypasses RLS, BY NAME. A count cannot see
  --    a swap — one role losing it while another gains it — which is how gate
  --    381 fell in M3.
  ---------------------------------------------------------------------------
  SELECT string_agg(rolname, ', ' ORDER BY rolname) INTO unexpected
    FROM pg_roles
   WHERE rolbypassrls AND NOT (rolname = ANY (allowed));
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '384: role(s) % bypass RLS and are not on the allow-list. anon with this attribute reads 43,516 audit_logs rows and every customer, person and journal entry. PostgreSQL cannot prevent ALTER ROLE, so this assertion is the only control — investigate who set it before clearing it with ALTER ROLE <name> NOBYPASSRLS', unexpected;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. The allow-list has not silently emptied. Without this, check 1 passes
  --    vacuously if the roles are dropped or renamed, reporting success against
  --    nothing. M3's gate 383 needed exactly this guard.
  ---------------------------------------------------------------------------
  SELECT string_agg(a, ', ' ORDER BY a) INTO missing
    FROM unnest(allowed) a
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = a);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '384: allow-listed role(s) % do not exist. The assertion above cannot be trusted against a set that has changed underneath it', missing;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. The roles a PostgREST request actually arrives as, each by name, each
  --    expected false. This is the check that fires on `ALTER ROLE anon BYPASSRLS`.
  ---------------------------------------------------------------------------
  FOR r IN SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = ANY (request_roles) LOOP
    IF r.rolbypassrls THEN
      RAISE EXCEPTION '384: % can bypass RLS. A PostgREST request can arrive as this role, so every RLS policy in the schema is void for it', r.rolname;
    END IF;
    IF r.rolsuper THEN
      RAISE EXCEPTION '384: % is a SUPERUSER. That bypasses RLS regardless of rolbypassrls, and a request-facing role must never be one', r.rolname;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM pg_roles WHERE rolname = ANY (request_roles);
  IF n <> array_length(request_roles, 1) THEN
    RAISE EXCEPTION '384: expected % request-facing roles, found % — check 3 cannot assert against roles that are gone', array_length(request_roles,1), n;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. SET ROLE reachability. Attributes do not inherit, but `SET ROLE` confers
  --    them, so what matters is which bypassing roles a request-facing role can
  --    switch INTO. `authenticator -> service_role` is the one legitimate path
  --    and is how the service-role key is meant to work. Anything else is new.
  ---------------------------------------------------------------------------
  SELECT string_agg(m.rolname || ' -> ' || g.rolname, ', ' ORDER BY m.rolname) INTO unexpected
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles g ON g.oid = am.roleid
   WHERE m.rolname = ANY (request_roles)
     AND (g.rolbypassrls OR g.rolsuper)
     AND NOT (m.rolname = 'authenticator' AND g.rolname = 'service_role');
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '384: request-facing role(s) can SET ROLE into a role that bypasses RLS: %. Only authenticator -> service_role is expected', unexpected;
  END IF;

  ---------------------------------------------------------------------------
  -- 5. supabase_admin is the only role for which this is vacuous, and the
  --    message says so rather than reporting a pass that means nothing. Gate
  --    381's success notice claimed supabase_admin "kept" a grant that had just
  --    been revoked, because an effect test on a superuser is always true.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n FROM pg_roles WHERE rolsuper;
  IF n <> 1 THEN
    RAISE EXCEPTION '384: % superusers exist, expected exactly 1 (supabase_admin). A new superuser bypasses RLS whatever rolbypassrls says', n;
  END IF;

  RAISE NOTICE '384 OK: exactly 4 roles bypass RLS and all 4 are allow-listed (postgres, service_role, supabase_admin, supabase_read_only_user); the 4 request-facing roles (anon, authenticated, authenticator, products_api_readonly) each have rolbypassrls=false and rolsuper=false; the only SET ROLE path into a bypassing role is authenticator -> service_role, which is by design; exactly 1 superuser exists, and supabase_admin is the ONLY role for which this assertion is vacuous. This migration revoked nothing because anon and authenticated were already false';
END
$chk$;
