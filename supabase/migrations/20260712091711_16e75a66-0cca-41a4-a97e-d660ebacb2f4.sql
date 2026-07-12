-- Lock the security-definer sale-price view down to READ ONLY.
--
-- product_computed_prices_public is a simple single-table view, so Postgres makes it
-- auto-updatable. Combined with security_invoker = false (previous migration), any write
-- through the view would execute as the view owner (postgres, BYPASSRLS) and silently
-- bypass RLS on the base table. Supabase's default schema grants leave
-- INSERT/UPDATE/DELETE/TRUNCATE on `authenticated`, so those must be stripped.
--
-- Reads stay open to every authenticated user (that is the point of this view: sale prices
-- visible to all staff, margins never exposed). Writes must go through the base table only,
-- where RLS still applies.
REVOKE ALL ON public.product_computed_prices_public FROM PUBLIC;
REVOKE ALL ON public.product_computed_prices_public FROM anon;
REVOKE ALL ON public.product_computed_prices_public FROM authenticated;

GRANT SELECT ON public.product_computed_prices_public TO authenticated;
