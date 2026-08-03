-- Rollback for migration 276 (requirement 223 — mandatory category services).
--
-- Run with:  psql -v ON_ERROR_STOP=1 --single-transaction -f 276-down.sql
--
-- ⚠️ NO BEGIN/COMMIT IN THIS FILE. Transaction control belongs to the caller.
-- A down script that commits will commit the transaction of any dry-run harness
-- that \i's it — the trap recorded in Phase 6.
--
-- ⚠️ WHAT THIS UNDOES: running it removes the television packaging obligation
-- entirely. A proforma can then be finalised with an unpackaged television and
-- the warehouse gets no task. Only run it to back out 276.
--
-- ⚠️ DATA LOSS: sales_quote_item_services holds real choices (which services a
-- salesperson attached to which line). Dropping it destroys them and they are
-- not reconstructible. If the intent is only to switch the rule OFF, do that
-- instead and keep the tables:
--     UPDATE public.category_required_services SET is_active = false;

SET client_encoding='UTF8';

-- 1) Restore update_sales_quote_status to its pre-276 definition.
--    Source: docs/verification/pre-276/update_sales_quote_status.sql, captured
--    with pg_get_functiondef BEFORE 276 was applied. Signature and return type
--    are unchanged, so CREATE OR REPLACE is sufficient.
\i pre-276/update_sales_quote_status.sql

-- 2) Triggers and their functions.
DROP TRIGGER IF EXISTS trg_sales_quote_items_required_services ON public.sales_quote_items;
DROP TRIGGER IF EXISTS trg_sqis_protect_mandatory ON public.sales_quote_item_services;
DROP FUNCTION IF EXISTS public.trg_quote_item_required_services();
DROP FUNCTION IF EXISTS public.trg_protect_mandatory_quote_item_service();
DROP FUNCTION IF EXISTS public.apply_required_services_for_quote_item(uuid);

-- 3) Tables, children first.
--    Verified before writing this: all three were created by 276 and appear in
--    no earlier migration, so dropping them takes nothing that predates it.
DROP TABLE IF EXISTS public.sales_quote_item_services;
DROP TABLE IF EXISTS public.category_required_services;
DROP TABLE IF EXISTS public.product_service_types;

-- 4) Tasks created by 276 are deliberately NOT deleted. They are real work
--    orders the warehouse may already have acted on; deleting them would erase
--    a record of physical work. Cancel them by hand if that is what is wanted.
