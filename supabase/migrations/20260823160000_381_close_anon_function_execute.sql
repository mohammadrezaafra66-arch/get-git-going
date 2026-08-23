-- 381 — close the anon function-EXECUTE leak (OG-33), and record OG-31 as measured and handed back.
--
-- ============================================================================
-- OG-33 — an unauthenticated caller learns procurement timing
-- ============================================================================
--
-- `get_recent_purchase_label(uuid)` and `get_recent_purchase_labels(uuid[])` are SECURITY DEFINER
-- and executable by `anon`. Measured 2026-08-23 with the published anon key and no session, against
-- a product that has purchases:
--
--   POST /rest/v1/rpc/get_recent_purchase_label  {"p_product_id": "<any product uuid>"}
--     -> {"status":"none","hours_since":967.17,
--         "last_purchase_at":"2026-07-13T10:01:00.667437+00:00","is_today_purchase":false}
--
--   GET /rest/v1/purchases?select=id&limit=1      (same caller)
--     -> HTTP 401     — anon holds no grant on that table
--
-- So the definer context reaches past a table the caller cannot read. That is the G-1 defect class
-- surviving in a function rather than a view.
--
-- **THE OWNER DECIDED THIS ON 2026-08-23: the last-purchase timestamp must not be public, close it,
-- and explicitly not by falling back.** Recorded that way because it matters — a closure backed by
-- a decision is not the same as one backed by an agent's default.
--
-- TWO REVOKES, NOT ONE. Both functions' proacl reads:
--
--   {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
--     ^^ the leading `=X` is PUBLIC
--
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. `REVOKE ... FROM anon` alone leaves
-- `has_function_privilege('anon', ..., 'EXECUTE')` true and achieves nothing. 712 of the 841
-- functions in `public` carry that PUBLIC grant, so this is the schema's normal shape.
--
-- WHAT KEEPS WORKING, and why. Four routes reach these functions through
-- `RecentPurchaseBadge.tsx` / `RecentPurchaseGroup.tsx`:
--
--   _app.products.$id.tsx        authenticated
--   _app.products.index.tsx      authenticated
--   _app.sales.search.tsx        authenticated
--   public.sale-lists.$listId    PUBLIC — and already broken for anon today:
--                                anon has no SELECT on sale_lists, and zero lists are published
--
-- Both functions carry an explicit `authenticated=X` grant, which neither revoke below touches. So
-- the three `_app` routes are unaffected, and the one public route loses a call it could not
-- usefully make anyway.
--
-- ============================================================================
-- OG-31 — the FUNCTIONS default privilege: MEASURED, AND HANDED BACK UNCHANGED
-- ============================================================================
--
-- This migration does NOT close the FUNCTIONS default privilege, because measurement showed the
-- intended remedy is a no-op. That is the answer to OG-31, not an omission.
--
-- The premise was that `pg_default_acl` carrying `anon=X` for objtype `f` is what grants `anon`
-- EXECUTE on every new function, exactly as the `r` and `S` entries did for tables and sequences
-- before migration 373. **It is not.** Measured 2026-08-23, each case inside BEGIN … ROLLBACK:
--
--   A  ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon
--      -> default acl becomes {postgres=X, authenticated=X, service_role=X}   (anon removed)
--      -> a new function still comes out with proacl {=X/supabase_admin, …}
--      -> has_function_privilege('anon', new_fn, 'EXECUTE') = TRUE
--
--   B  … REVOKE EXECUTE ON FUNCTIONS FROM anon, then … FROM PUBLIC
--      -> the PUBLIC revoke changes the default acl not at all; anon = TRUE
--
--   C  … REVOKE ALL ON FUNCTIONS FROM PUBLIC                   -> no change; anon = TRUE
--   D  … REVOKE ALL FROM PUBLIC then REVOKE ALL FROM anon      -> `=X` still present; anon = TRUE
--
-- The reason is visible in the catalogue: the `f` row of `pg_default_acl` reads
-- `{postgres=X, anon=X, authenticated=X, service_role=X}` and contains **no PUBLIC entry at all**.
-- PostgreSQL's built-in default for functions — EXECUTE to PUBLIC — is not represented there, so
-- `ALTER DEFAULT PRIVILEGES … REVOKE … FROM PUBLIC` has nothing to remove and silently does nothing.
-- The 712 functions carrying `=X` are that built-in default at work.
--
-- So OG-31 as posed has the wrong subject. Revoking the `anon` entry is a one-line change available
-- to whoever takes this on, but **alone it changes nothing observable**, and shipping a statement
-- that looks like a fix and is not is the pattern this programme has already been corrected for.
-- Closing the future function tap needs a different mechanism — an explicit `REVOKE … FROM PUBLIC`
-- per function, or an event trigger issuing one on `CREATE FUNCTION` — and that is a schema-wide
-- change whose blast radius nothing in this mission's scope justifies. Handed back with these
-- measurements attached to the Owner-Gate row.
--
-- ROLLBACK: docs/verification/381-down.sql — written and dry-run proved before this file existed.
-- Object owner: supabase_admin.

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- OG-33 — the only change this migration makes
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- gate — the ONE assertion this mission is allowed
--
-- Everything below tests EFFECT, never identity. Five consecutive gates in this programme fell to
-- that distinction: `grantee = 'anon'` cannot see a PUBLIC grant or a role anon inherits, and it is
-- exactly a PUBLIC grant that makes the OG-33 revokes need two statements instead of one.
-- ---------------------------------------------------------------------------

DO $chk$
DECLARE
  f            text;
  r            text;
  n            int;
  probe_exec   boolean;
  og33         text[] := ARRAY['public.get_recent_purchase_label(uuid)',
                               'public.get_recent_purchase_labels(uuid[])'];
  keep_roles   text[] := ARRAY['authenticated','service_role','postgres','supabase_admin'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. OG-33: anon can no longer execute either function — by EFFECT, which is
  --    the only test that sees through the PUBLIC grant.
  ---------------------------------------------------------------------------
  FOREACH f IN ARRAY og33 LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '381: anon can still EXECUTE % — a REVOKE from anon alone does not remove the PUBLIC grant', f;
    END IF;
    IF has_function_privilege('public', f, 'EXECUTE') THEN
      RAISE EXCEPTION '381: PUBLIC still holds EXECUTE on %', f;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 2. OG-33: the four roles that must keep it, kept it. If this fails, three
  --    `_app` routes just lost their recent-purchase badge.
  ---------------------------------------------------------------------------
  FOREACH f IN ARRAY og33 LOOP
    FOREACH r IN ARRAY keep_roles LOOP
      IF NOT has_function_privilege(r, f, 'EXECUTE') THEN
        RAISE EXCEPTION '381: % lost EXECUTE on % — the revoke hit the wrong grantee', r, f;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 3. Migration 373 must not have been undone: no anon default privilege on
  --    TABLES or SEQUENCES. The FUNCTIONS entry is deliberately left in place —
  --    see the OG-31 section above; revoking it is a no-op and this migration
  --    does not pretend otherwise.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public'
     AND d.defaclobjtype IN ('r','S')
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 0 THEN
    RAISE EXCEPTION '381: % default-privilege entr(y/ies) for anon remain on r/S in public — migration 373 has been undone', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. THE HEADLINE, and it asserts the measured reality rather than a wish.
  --    A freshly created function IS still executable by anon, through
  --    PostgreSQL's built-in EXECUTE-to-PUBLIC default. This migration does not
  --    close that and does not claim to. The check is here so that the day
  --    someone DOES close it, this assertion fails and forces the record to be
  --    updated instead of quietly going stale.
  ---------------------------------------------------------------------------
  BEGIN
    EXECUTE 'CREATE FUNCTION public._m3_probe() RETURNS int LANGUAGE sql IMMUTABLE AS $probe$ SELECT 1 $probe$';
    probe_exec := has_function_privilege('anon', 'public._m3_probe()', 'EXECUTE');
    EXECUTE 'DROP FUNCTION public._m3_probe()';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '381: the freshly-created-function probe could not run: % %', SQLSTATE, SQLERRM;
  END;
  IF NOT probe_exec THEN
    RAISE EXCEPTION '381: a freshly created function is NO LONGER executable by anon. This migration did not make that change and OG-31 records it as unsolved — someone closed the built-in PUBLIC default. Update the record before proceeding';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Scope fence, asserted rather than promised. This mission revoked from
  --    exactly two functions; the rest of the anon-executable surface is M10's
  --    to decide. 746 were anon-executable before; 744 must remain.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF n <> 744 THEN
    RAISE EXCEPTION '381: % functions are anon-executable, expected 744 (746 measured before, minus the 2 closed here). This mission must not have touched any other function', n;
  END IF;

  RAISE NOTICE '381 OK: anon and PUBLIC lost EXECUTE on both get_recent_purchase_label functions; authenticated, service_role, postgres and supabase_admin kept it; migration 373 intact on TABLES and SEQUENCES; exactly 744 functions remain anon-executable, two fewer than before; and a freshly created function is STILL anon-executable via the built-in PUBLIC default, which is OG-31 measured and handed back rather than closed';
END
$chk$;
