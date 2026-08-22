-- 370 — close the unauthenticated read path on the `is_viewer_only` view class (G-1).
--
-- THE DEFECT. Eight views in `public` filter with `NOT is_viewer_only(uid())`. All eight are
-- SECURITY DEFINER — that is PostgreSQL's default for a view — and all eight are owned by
-- supabase_admin. So the row-level security on their base tables is evaluated as the *owner*, not
-- as the caller, and never filters anything. `is_viewer_only(NULL)` returns false for a caller with
-- no identity, so the guard passes. Six of the eight also carried `GRANT ALL … TO anon`.
--
-- The result, measured against the live test server on 2026-08-22 over plain HTTP with the
-- published anon key and no session at all
-- (docs/execution/g1-anon-view-leak-PROGRESS.md §0.4–0.6):
--
--   GET /rest/v1/vw_account_balances            200 — bank name, account title, opening balance,
--                                                     total in/out, current balance 10,289,000,000 IRR
--   GET /rest/v1/publish_recipients_view        200 — full name and roles of all 24 users
--   GET /rest/v1/v_promotion_suggestions        200 — 19,880 rows of product, SKU, stock, channel
--   GET /rest/v1/product_computed_prices_public  200 — 588 computed sale-price rows
--
-- In every case the anon row count equalled the owner-eye row count exactly. The leak was total,
-- not partial.
--
-- The remaining two of the eight, v_dynamic_customer_capital_balances and
-- v_dynamic_salesperson_capital_balances, returned 42501 — but NOT because of their grants, which
-- anon holds in full. They fail on `permission denied for function _capital_alloc_used`. That is an
-- accidental barrier: if that function's ACL ever changes, both views start leaking silently. This
-- migration removes the dependence on that accident.
--
-- WHAT THIS MIGRATION DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- (a) REVOKE ALL … FROM anon on the six views that hold an anon grant.
--
--     No application code breaks. The five real consumers of these views in `src/` —
--     ProductPublishPricesCard, SalesProductRecommendations, useAminHozoorBoardPrices,
--     workbench-queries and useDynamicCapital — are all mounted under the authenticated `_app`
--     shell and all use the shared client that carries the signed-in user's token. Every genuinely
--     public route in the repo (public.sale-lists.$listId, api.public.bot.*, sitemap.xml, index)
--     was searched: none reads any of the eight. vw_account_balances, the worst leak, has no
--     reference anywhere in src/ at all.
--
-- (b) SET (security_invoker = true) on exactly TWO views, so that base-table RLS applies to the
--     caller and the object stops depending on its grant list alone — defence in depth on top of
--     (a), not instead of it. This follows an established pattern: ten views in this schema already
--     carry security_invoker.
--
--     The two are product_computed_prices_public and v_promotion_suggestions, and they were chosen
--     by measurement, not by judgement. Every one of the eight was tested inside BEGIN … ROLLBACK
--     with a simulated JWT for accountant, sales, admin and viewer, before and after turning
--     security_invoker on. These two are the only ones where no authenticated reader changes:
--
--       product_computed_prices_public   accountant 588->588  sales 588->588  admin 588->588
--       v_promotion_suggestions          accountant 19880->19880  sales 19880->19880  admin 19880->19880
--
--     The other four are NOT given security_invoker, because it demonstrably breaks a live reader:
--
--       publish_recipients_view                accountant 24 -> 1,  sales 24 -> 1
--       v_dynamic_customer_capital_balances    sales 14 -> 0
--       v_dynamic_salesperson_capital_balances sales 210 -> 9
--       vw_account_balances                    sales 1 -> 0
--
--     For those four, (a) alone closes the anon path, which is what G-1 is about. Whether `sales`
--     should be seeing a bank balance at all is a real question, but changing it is a behaviour
--     change for signed-in users and belongs to an owner decision, not to this migration.
--
-- (c) It does NOT rewrite is_viewer_only() to fail closed on a NULL uid. That would change the
--     behaviour of all eight views at once plus anything else that calls it, and is raised as an
--     Owner-Gate instead.
--
-- (d) It does NOT touch the schema-level default privilege. `ALTER DEFAULT PRIVILEGES FOR
--     supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon` is in force and will grant
--     arwdDxt to anon on every future table and view supabase_admin creates in `public`
--     (pg_default_acl, measured 2026-08-22). This migration is therefore a point fix, and the same
--     class of defect can reappear on the next new view. Raised as an Owner-Gate.
--
-- ROLLBACK: docs/verification/370-down.sql
-- Owner of every object below: supabase_admin.

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- (a) close the anon read path
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.product_computed_prices_public         FROM anon;
REVOKE ALL ON TABLE public.publish_recipients_view                FROM anon;
REVOKE ALL ON TABLE public.v_dynamic_customer_capital_balances    FROM anon;
REVOKE ALL ON TABLE public.v_dynamic_salesperson_capital_balances FROM anon;
REVOKE ALL ON TABLE public.v_promotion_suggestions                FROM anon;
REVOKE ALL ON TABLE public.vw_account_balances                    FROM anon;

-- vw_customer_receivables and vw_supplier_payables are intentionally not listed: they never had an
-- anon grant, and naming them here would imply a change that does not exist.

-- ---------------------------------------------------------------------------
-- (b) defence in depth, only where it was proven to cost nothing
-- ---------------------------------------------------------------------------

ALTER VIEW public.product_computed_prices_public SET (security_invoker = true);
ALTER VIEW public.v_promotion_suggestions        SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- gate — assert the end state, so a partial apply cannot pass silently
-- ---------------------------------------------------------------------------

DO $chk$
DECLARE
  v            text;
  n_anon       int;
  n_guard      int;
  n_invoker    int;
  guard_views  text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions',
    'vw_account_balances',
    'vw_customer_receivables',
    'vw_supplier_payables'
  ];
BEGIN
  -- 1. the guard class is still exactly the eight views this migration was written against.
  SELECT count(*) INTO n_guard
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';
  IF n_guard <> 8 THEN
    RAISE EXCEPTION '370: the is_viewer_only view class is now % views, not 8 — this migration was written against a different set', n_guard;
  END IF;

  -- 2. anon holds no privilege of any kind on any of the eight.
  FOREACH v IN ARRAY guard_views LOOP
    SELECT count(*) INTO n_anon
      FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public'
       AND g.table_name = v
       AND g.grantee = 'anon';
    IF n_anon <> 0 THEN
      RAISE EXCEPTION '370: anon still holds % privilege(s) on public.%', n_anon, v;
    END IF;
  END LOOP;

  -- 3. the two chosen views carry security_invoker, and no others in the guard class do.
  SELECT count(*) INTO n_invoker
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND c.relname = ANY (guard_views)
     AND c.reloptions::text ILIKE '%security_invoker=true%';
  IF n_invoker <> 2 THEN
    RAISE EXCEPTION '370: expected exactly 2 guard-class views with security_invoker, found %', n_invoker;
  END IF;

  -- 4. authenticated must NOT have been caught by the revoke — it is the role the whole
  --    application runs as. If this fails, every signed-in user just lost these views.
  FOREACH v IN ARRAY ARRAY['product_computed_prices_public','v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances','v_promotion_suggestions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = v
         AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
    ) THEN
      RAISE EXCEPTION '370: authenticated lost SELECT on public.% — the revoke hit the wrong role', v;
    END IF;
  END LOOP;

  RAISE NOTICE '370 OK: 8 guard-class views, 0 anon privileges, 2 security_invoker, authenticated intact';
END
$chk$;
