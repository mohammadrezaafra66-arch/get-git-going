-- 395 — close every anon-reachable SECURITY DEFINER leak in the pricing, staff and
--        internal-metadata domains (OG-62).
--
-- Owner decision on record (2026-08-26): yes, close it — **with a complete domain-wide
-- sweep**, not just the two functions the gate row names.
--
-- ============================================================================
-- WHAT IS WRONG
-- ============================================================================
--
-- Measured as `anon`, no session, inside BEGIN … ROLLBACK, with REAL arguments:
--
--     get_product_sale_price(uuid,uuid)      ->  79800000                        (a real sale price)
--     get_product_price_bounds(uuid,uuid)    ->  (79800000,87300000,91665000,79800000,t)
--     get_leaderboard*/get_current_league    ->  5 rows of staff scores, league, season
--     get_workflow_settings()                ->  internal workflow config with role names
--     person_fk_registry_report()            ->  29 rows of schema metadata
--     person_merge_registry_keys()           ->  29 rows of table.column names
--     _promo_policy_for(uuid)                ->  the promotion policy row
--
-- Each is `SECURITY DEFINER`, so it runs with its owner's privileges and walks past both
-- column grants and RLS. This is the **third** appearance of the same pattern: OG-49 closed
-- it for `products.sku` (migration 389) and OG-55 closed it for `calculate_adjusted_price`
-- (migration 390), which returned 38,985,000 to a caller whose table SELECT was refused
-- with 42501. A8 says price is NEVER public and everything not explicitly declared public
-- is internal, so all of these are standing violations rather than judgement calls.
--
-- ============================================================================
-- HOW THE LIST WAS BUILT — a sweep, not a name match (A5.31)
-- ============================================================================
--
-- Mission 4 sampled 18 functions. This mission called **every STABLE, anon-executable
-- SECURITY DEFINER function in `public`** — 91 of them — as `anon`, each in its own
-- sub-transaction. VOLATILE definers were never called (A5.31).
--
--     GUARDED (refused from inside their own body)   36
--     RETURNED rows                                  47
--     OTHER                                           8
--
-- A row count is not a leak, though: `has_role(NULL,NULL)` returns one row of `false`. So
-- every function that returned rows was called AGAIN with real arguments and its VALUES
-- inspected. That is what separates the 28 below from the boolean RLS helpers.
--
-- ============================================================================
-- WHY THIS IS SAFE — measured before a single REVOKE was written
-- ============================================================================
--
-- For all 28, live:
--   * `authenticated` holds its OWN explicit EXECUTE grant, and so does `service_role`.
--     Revoking PUBLIC therefore cannot silently remove their access — that is the
--     REVOKE-then-GRANT trap (A5.32) which has bitten this project four times, checked
--     rather than assumed.
--   * **none appears in any RLS policy** (`in_policy = 0` for all 28), so no anonymous
--     request's policy evaluation depends on them.
--   * **none is reachable through a view `anon` can read.** The single view usage is
--     `get_product_price_bounds` inside `api_products_pricing`, which `anon` and
--     `authenticated` both cannot SELECT.
--   * each has exactly ONE signature, so there is no overload to escape through.
--
-- And the app: a whole-tree search finds **no `src/` caller at all** for
-- `get_product_sale_price` or `get_product_price_bounds` (only the generated
-- `integrations/supabase/types.ts`); the remaining consumers —
-- `lib/operations/gamification.ts` and `_app.sales.credit-customers.tsx` — are
-- authenticated routes.
--
-- ============================================================================
-- WHAT THIS MIGRATION DOES *NOT* DO
-- ============================================================================
--
--  * It does not touch the RLS helper functions (`is_viewer_only`, `has_role`,
--    `has_any_role`, `dyn_table_role_can_view`, `kd_role_can_view`, the `is_*` predicates).
--    They returned only booleans to the sweep, they back 93 policies, and revoking them
--    from `anon` would break policy evaluation rather than close a leak. Asserted below.
--  * It does not touch `set_profile_field_value`, the one genuine anon keep-list entry
--    (registration writes profile fields through it before a session necessarily exists).
--    Asserted below.
--  * It does not touch `refresh_sale_list_prices` — A6.33 (OG-48) makes revoking it the
--    first step of the sale-lists repair, and A6.35 (OG-32) blocks that repair for now.
--  * It changes no table grant, no policy, no role and no data.
--
-- Rollback: `docs/verification/395-down.sql`, written BEFORE this file from the live
-- captured ACLs and dry-run proved (A5.28).

SET client_encoding='UTF8';

REVOKE EXECUTE ON FUNCTION public.get_current_league(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_league(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_employee_rank(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_rank(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_league_leaderboard(league_tier,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_league_leaderboard(league_tier,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_numeric_setting(text,numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_numeric_setting(text,numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_observatory_snippets_for_products(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_observatory_snippets_for_products(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_price_bounds(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_price_bounds(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_sale_price(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_sale_price(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_timeline(uuid,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_timeline(uuid,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_rank_neighbors(uuid,text,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_rank_neighbors(uuid,text,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_workflow_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workflow_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_workflow_setting(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workflow_setting(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_trusted_credit_customers(text,text,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,boolean,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_trusted_credit_customers(text,text,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,boolean,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._par_latest_usd_rate() FROM anon;
REVOKE EXECUTE ON FUNCTION public._par_latest_usd_rate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.person_fk_registry_report() FROM anon;
REVOKE EXECUTE ON FUNCTION public.person_fk_registry_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.person_merge_registry_keys() FROM anon;
REVOKE EXECUTE ON FUNCTION public.person_merge_registry_keys() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() FROM anon;
REVOKE EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_videos_waiting() FROM anon;
REVOKE EXECUTE ON FUNCTION public.product_videos_waiting() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._promo_policy_for(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._promo_policy_for(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_market_product_match(market_match_source,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_market_product_match(market_match_source,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid,vector,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid,vector,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) FROM PUBLIC;

-- ============================================================================
-- THE GATE — one gate (A2.9), two-sided (A2.10)
-- ============================================================================
--
-- Everything is asserted BY FUNCTION NAME across all signatures, not by exact signature.
-- Migration 383 records why: a reviewer defeated an exact-signature gate by creating an
-- overload, and the leak returned under a signature the gate did not look at.

DO $gate$
DECLARE
  names text[] := ARRAY[
    '_par_latest_usd_rate',
    '_promo_policy_for',
    'get_current_league',
    'get_employee_rank',
    'get_leaderboard',
    'get_leaderboard_all_time',
    'get_leaderboard_daily',
    'get_leaderboard_monthly',
    'get_leaderboard_weekly',
    'get_league_leaderboard',
    'get_numeric_setting',
    'get_observatory_pdf_hints_for_products',
    'get_observatory_snippets_for_products',
    'get_product_price_bounds',
    'get_product_sale_price',
    'get_product_stats',
    'get_product_timeline',
    'get_rank_neighbors',
    'get_workflow_setting',
    'get_workflow_settings',
    'list_trusted_credit_customers',
    'person_fk_registry_report',
    'person_merge_registry_keys',
    'polymorphic_ref_orphan_report',
    'product_videos_waiting',
    'resolve_market_product_match',
    'search_messenger_messages_semantic',
    'validate_journal_entry_balance'
  ];
  nm       text;
  n        int;
  bad      text;
  v_prod   uuid;
  v_spt    uuid;
  v_admin  uuid;
  v_price  numeric;
  v_hint   text;
BEGIN
  ------------------------------------------------------------------ vacuity
  FOREACH nm IN ARRAY names LOOP
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = nm;
    IF n = 0 THEN
      RAISE EXCEPTION '395 V1: function % has vanished from public — a wholesale DROP would otherwise pass every check below silently', nm;
    END IF;
  END LOOP;

  ------------------------------------------------------------------ C1 closed to anon
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = ANY(names)
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '395 C1: anon can still EXECUTE: %', bad;
  END IF;

  ------------------------------------------------------------------ C2 no PUBLIC grant
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = ANY(names)
    AND p.proacl IS NOT NULL
    AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '395 C2: PUBLIC still holds EXECUTE on: % — revoking anon alone changes nothing, because PostgreSQL grants functions to PUBLIC by default', bad;
  END IF;

  ------------------------------------------------------------------ O1 legitimate roles keep access
  -- This is the A2.10 half. A change that closed these for everyone would pass C1/C2 and
  -- must fail here instead of reading as "secure".
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = ANY(names)
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '395 O1: authenticated LOST EXECUTE on: % — the signed-in app is broken, not secured', bad;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = ANY(names)
    AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '395 O1: service_role LOST EXECUTE on: % — every server-side route through these breaks', bad;
  END IF;

  ------------------------------------------------------------------ C3 behavioural, as anon
  SELECT id INTO v_prod FROM public.products WHERE status = 'active' LIMIT 1;
  SELECT id INTO v_spt  FROM public.sale_price_types LIMIT 1;
  IF v_prod IS NULL OR v_spt IS NULL THEN
    RAISE EXCEPTION '395 V2: no active product or sale price type — the behavioural checks would pass vacuously';
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    SELECT public.get_product_sale_price(v_prod, v_spt) INTO v_price;
    RESET ROLE;
    RAISE EXCEPTION '395 C3: as anon, get_product_sale_price still RETURNED % — the price is still public', v_price;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;   -- correct: permission denied for function
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM LIKE '395 C3:%' THEN RAISE; END IF;
      RAISE EXCEPTION '395 C3: as anon the call failed, but NOT with a permission error (%). RLS returns zero rows silently while a privilege refusal returns 42501; the two must not be confused (A5.32).', SQLERRM;
  END;

  ------------------------------------------------------------------ O2 behavioural, as authenticated
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT public.get_product_sale_price(v_prod, v_spt) INTO v_price;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION '395 O2: a signed-in caller can no longer read the sale price (%) — this migration broke the real pricing path', SQLERRM;
  END;
  IF v_price IS NULL THEN
    RAISE EXCEPTION '395 O2: a signed-in caller got NULL from get_product_sale_price — the legitimate path returns nothing';
  END IF;

  ------------------------------------------------------------------ O3 RLS helpers untouched
  FOREACH nm IN ARRAY ARRAY['is_viewer_only','has_role','has_any_role','dyn_table_role_can_view','kd_role_can_view'] LOOP
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = nm
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
    IF n > 0 THEN
      RAISE EXCEPTION '395 O3: the RLS helper % lost anon EXECUTE on % signature(s). It backs RLS policies evaluated for anonymous requests; revoking it breaks policy evaluation rather than closing a leak.', nm, n;
    END IF;
  END LOOP;

  ------------------------------------------------------------------ O4 the anon keep-list
  IF NOT has_function_privilege('anon','public.set_profile_field_value(uuid,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION '395 O4: anon lost EXECUTE on set_profile_field_value — registration writes profile fields through it before a session necessarily exists';
  END IF;

  ------------------------------------------------------------------ C4 regression bar
  FOREACH nm IN ARRAY ARRAY['find_duplicate_product','calculate_adjusted_price','get_recent_purchase_label','get_recent_purchase_labels'] LOOP
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = nm;
    IF n = 0 THEN
      RAISE EXCEPTION '395 C4: % has vanished — the regression check would pass vacuously', nm;
    END IF;
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = nm
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE'));
    IF n > 0 THEN
      RAISE EXCEPTION '395 C4: % is anon/PUBLIC executable again — OG-33/OG-49/OG-55 regression', nm;
    END IF;
  END LOOP;

  ------------------------------------------------------------------ O5 no over-reach on the public product surface
  IF NOT has_column_privilege('anon','public.products','name','SELECT') THEN
    RAISE EXCEPTION '395 O5: anon lost SELECT on products.name, which A8 declares public — this migration reached past functions into the product keep-list';
  END IF;

  RAISE NOTICE '395 OK: all % functions in the pricing/staff/internal-metadata sweep are closed to anon AND to PUBLIC, asserted by NAME across every signature. Proven behaviourally: as anon get_product_sale_price now raises a privilege error rather than returning a price, and as a signed-in caller it still returns one (%). authenticated and service_role keep EXECUTE on every one of them, so the surface was closed rather than emptied. The RLS helpers and set_profile_field_value keep their anon grants, products.name stays readable, and the four doors closed by OG-33/OG-49/OG-55 remain shut.', array_length(names,1), v_price;
END $gate$;
