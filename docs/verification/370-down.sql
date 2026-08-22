-- 370-down.sql — reverse migration 370 (close the anon read path on the `is_viewer_only` view class).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward).
--
-- WHAT 370 DID
--
--   (a) REVOKE ALL … FROM anon on the six views in the `is_viewer_only` guard class that carried an
--       anon grant. Those views are SECURITY DEFINER (PostgreSQL's default), owned by
--       supabase_admin, so the RLS on their base tables never applied to the caller and an
--       unauthenticated PostgREST request read 100% of their rows. Measured 2026-08-22, before the
--       change (g1-anon-view-leak-PROGRESS.md §0.6):
--
--         vw_account_balances               anon saw 1     of 1      rows  (bank name + 10,289,000,000 IRR balance)
--         publish_recipients_view           anon saw 24    of 24     rows  (staff names and roles)
--         v_promotion_suggestions           anon saw 19880 of 19880  rows
--         product_computed_prices_public    anon saw 588   of 588    rows
--         v_dynamic_customer_capital_balances     42501 — blocked only by a missing EXECUTE
--         v_dynamic_salesperson_capital_balances  42501 — on _capital_alloc_used, not by grant
--
--   (b) ALTER VIEW … SET (security_invoker = true) on exactly two of them —
--       product_computed_prices_public and v_promotion_suggestions — the only two that Phase 0
--       proved change nothing for any authenticated reader. The other four were deliberately left
--       alone because security_invoker demonstrably breaks a real reader on each
--       (PROGRESS §"سنجهٔ تعیین‌کننده": accountant 24 -> 1, sales 14 -> 0, sales 210 -> 9,
--       sales 1 -> 0).
--
-- WHAT THIS FILE RESTORES
--
-- The exact ACL each view carried on 2026-08-22 before 370 was written. The privilege set was not
-- retyped from memory — it was read from pg_class.relacl on the live catalogue and was identical
-- on all six:
--
--     anon=arwdDxt/supabase_admin
--
-- which is a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER — i.e. GRANT ALL.
-- (Yes, anon held INSERT/UPDATE/DELETE/TRUNCATE on these views. That is why 370 revokes ALL and not
-- merely SELECT.) The two views this file resets security_invoker on had no reloptions at all
-- before 370, so RESET returns them to NULL, not to some other value.
--
-- CONSEQUENCE OF RUNNING THIS. It re-opens the unauthenticated read path — the bank balance, the
-- staff roster, and the two catalogue views become world-readable to anyone who can reach Kong on
-- :9000 with the published anon key. Run it only as a deliberate rollback.
--
-- WHAT THIS FILE DOES NOT DO, AND WHY IT CANNOT
--
-- It does not undo the schema-level default privilege that produced this situation, because 370
-- does not touch it. `ALTER DEFAULT PRIVILEGES FOR supabase_admin IN SCHEMA public GRANT ALL ON
-- TABLES TO anon` is still in force (pg_default_acl, measured 2026-08-22). Every future table or
-- view created by supabase_admin in `public` is granted arwdDxt to anon automatically. 370 is a
-- point fix on eight objects; the tap is still open. That is raised as an Owner-Gate rather than
-- changed here, because altering it affects every future object in the schema and is far outside
-- the blast radius of a G-1 remediation.
--
-- ORDER. 370-down is independent of 368-down and 369-down; any may be run without the others.

SET client_encoding = 'UTF8';

-- (b) reverse first: return the two views to SECURITY DEFINER (the PostgreSQL default).
-- Neither view had any reloptions before 370, so RESET is the exact inverse of SET.
ALTER VIEW public.product_computed_prices_public RESET (security_invoker);
ALTER VIEW public.v_promotion_suggestions        RESET (security_invoker);

-- (a) restore the anon grants, verbatim as captured from pg_class.relacl.
GRANT ALL ON TABLE public.product_computed_prices_public         TO anon;
GRANT ALL ON TABLE public.publish_recipients_view                TO anon;
GRANT ALL ON TABLE public.v_dynamic_customer_capital_balances    TO anon;
GRANT ALL ON TABLE public.v_dynamic_salesperson_capital_balances TO anon;
GRANT ALL ON TABLE public.v_promotion_suggestions                TO anon;
GRANT ALL ON TABLE public.vw_account_balances                    TO anon;

-- vw_customer_receivables and vw_supplier_payables are deliberately absent from both lists.
-- They never had an anon grant (relacl held only supabase_admin, service_role and postgres), so
-- 370 did not revoke anything from them and this file must not grant anything to them. Adding them
-- here would not restore a previous state — it would create a leak that never existed.
