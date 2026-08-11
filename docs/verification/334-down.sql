SET client_encoding='UTF8';

-- ============================================================================
-- 334-down — reverse migration 20260810120000_334_internal_products_pricing_api
-- ----------------------------------------------------------------------------
-- Migration 334 only ADDED things: two views and one NOLOGIN role. Nothing was
-- altered or dropped, so this down-script simply removes what 334 created and
-- leaves the database exactly as it was before.
--
-- Run it the same way as any migration:
--   docker cp docs\verification\334-down.sql afrakala-lan-db:/tmp/334-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/334-down.sql
--   docker restart afrakala-lan-rest
--
-- Dropping the role also invalidates the issued API credential (a JWT whose
-- "role" claim names a role that no longer exists is rejected by PostgREST),
-- so this is also the emergency revoke path.
-- ============================================================================

-- Order matters: api_products_pricing reads api_product_price_rows.
DROP VIEW IF EXISTS public.api_products_pricing;
DROP VIEW IF EXISTS public.api_product_price_rows;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'products_api_readonly') THEN
    -- Views are already gone, but revoke defensively so DROP ROLE cannot fail
    -- on a dependency left behind by a partially applied 334.
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM products_api_readonly';
    EXECUTE 'REVOKE products_api_readonly FROM authenticator';
    EXECUTE 'DROP ROLE products_api_readonly';
  END IF;
END
$$;
