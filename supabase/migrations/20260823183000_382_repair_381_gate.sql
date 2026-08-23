-- 382 — repair migration 381's assertion gate. Creates nothing.
--
-- This is a REPAIR, not a second gate. The programme caps each mission at one assertion gate and
-- says that if it is defeated it must be repaired rather than supplemented. 381 is applied and
-- committed and this repository does not edit an applied migration (AGENTS.md rule 6), so the
-- repair ships here and **381's checks 4 and 5 are retired by this file**.
--
-- WHY. An independent review defeated 381's gate twice, and both holes are one mistake:
-- **it was aimed at the schema instead of at the change.**
--
--   P1 — NET CENSUS BLIND TO A SWAP. Check 5 asserted `744` anon-executable functions across all
--        841. The reviewer closed `is_viewer_only(uuid)` and `tehran_today()` to anon and opened two
--        admin RPCs to anon. Count stayed 744. Gate passed. `is_viewer_only` backs 91 RLS policies.
--
--   P2 — NO CONSUMER CHECK AT ALL. The reviewer revoked anon SELECT on `shop_settings` and
--        `products`, which kills `/api/healthz` and `/api/public/products`, and additionally revoked
--        the owner's own EXECUTE. Gate passed, and its success notice still claimed
--        "supabase_admin kept it".
--
-- Three further defects, all from the same aim:
--
--   * Check 5 pins whole-schema state into a migration that must replay whole-and-in-order. Any
--     future migration that adds or removes one anon-executable function breaks 381's replay for a
--     reason that has nothing to do with 381.
--   * `supabase_admin` in 381's keep-list is vacuous — it is a superuser, so
--     `has_function_privilege('supabase_admin', …)` is unconditionally true. That is exactly why P2
--     could revoke the owner's grant unnoticed. Dropped here. `postgres`, `authenticated` and
--     `service_role` are all non-superuser on this server and remain meaningful.
--   * 381's check 4 is a self-invalidating tripwire: it asserts a freshly created function IS still
--     anon-executable, so it fails the day OG-31 is closed. It was also the only DDL in an otherwise
--     pure-DCL migration. Retired — the OG-31 state now lives in the Owner-Gate record, which is
--     where a decision belongs, not in a migration that must replay.
--
-- WHAT THIS GATE ASSERTS INSTEAD: the change, and the things the change could plausibly have
-- broken. Nothing else.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
-- ROLLBACK: docs/verification/382-down.sql (a documented no-op).

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  f     text;
  r     text;
  t     text;
  og33  text[] := ARRAY['public.get_recent_purchase_label(uuid)',
                        'public.get_recent_purchase_labels(uuid[])'];
  -- superuser deliberately excluded: has_function_privilege is unconditionally true for it
  keep  text[] := ARRAY['authenticated','service_role','postgres'];
  -- the RLS helpers anon must keep, by exact signature. P1 walked through because nothing named
  -- these; a net census cannot distinguish "two closed, two opened" from "nothing changed".
  helpers text[] := ARRAY['public.is_viewer_only(uuid)',
                          'public.has_any_role(uuid, app_role[])',
                          'public.has_any_role(uuid, text[])',
                          'public.has_role(uuid, app_role)',
                          'public.has_role(uuid, text)',
                          'public.tehran_today()'];
  -- the two tables the live public surfaces read as anon. P2 walked through because nothing named
  -- these: shop_settings is /api/healthz, products is /api/public/products.
  surfaces text[] := ARRAY['public.shop_settings','public.products'];
BEGIN
  -- 1. the change itself: anon and PUBLIC cannot execute either OG-33 function.
  FOREACH f IN ARRAY og33 LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '382: anon can still EXECUTE % — remember a REVOKE from anon alone leaves the PUBLIC grant', f;
    END IF;
    IF has_function_privilege('public', f, 'EXECUTE') THEN
      RAISE EXCEPTION '382: PUBLIC still holds EXECUTE on %', f;
    END IF;
  END LOOP;

  -- 2. the roles that must keep it, kept it. Three `_app` routes depend on this.
  FOREACH f IN ARRAY og33 LOOP
    FOREACH r IN ARRAY keep LOOP
      IF NOT has_function_privilege(r, f, 'EXECUTE') THEN
        RAISE EXCEPTION '382: % lost EXECUTE on % — the revoke hit the wrong grantee', r, f;
      END IF;
    END LOOP;
  END LOOP;

  -- 2b. the owner's own grant, checked by ACL rather than by effect, because effect cannot see it.
  FOREACH f IN ARRAY og33 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
       WHERE p.oid = f::regprocedure
         AND a.grantee = 'supabase_admin'::regrole
         AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '382: supabase_admin has no EXECUTE aclitem on % — a superuser test would have missed this', f;
    END IF;
  END LOOP;

  -- 3. P1: the RLS helpers anon still needs, by name. Closes the swap hole.
  FOREACH f IN ARRAY helpers LOOP
    IF NOT has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '382: anon lost EXECUTE on % — RLS policies across the schema call it, and M3 had no business touching it', f;
    END IF;
  END LOOP;

  -- 4. P2: the two tables the live public surfaces read as anon. Closes the collateral hole.
  FOREACH t IN ARRAY surfaces LOOP
    IF NOT has_table_privilege('anon', t::regclass, 'SELECT') THEN
      RAISE EXCEPTION '382: anon lost SELECT on % — that breaks a live public surface (/api/healthz reads shop_settings, /api/public/products reads products)', t;
    END IF;
  END LOOP;

  -- 5. migration 373 must not have been undone. Cheap, and it is the one piece of
  --    schema-wide state this mission's own change could plausibly be confused with.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
     WHERE ns.nspname = 'public' AND d.defaclobjtype IN ('r','S')
       AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole)
  ) THEN
    RAISE EXCEPTION '382: an anon default privilege is back on TABLES or SEQUENCES in public — migration 373 has been undone';
  END IF;

  RAISE NOTICE '382 OK: anon and PUBLIC hold no EXECUTE on either get_recent_purchase_label function; authenticated, service_role and postgres do, and supabase_admin holds a real aclitem rather than a superuser pass; the six RLS helper signatures anon needs are intact; anon can still read shop_settings and products; migration 373 intact. 381 checks 4 and 5 are retired by this file';
END
$chk$;
