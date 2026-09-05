SET client_encoding='UTF8';

-- 464 - the catalogue tier: products, SKUs, prices, price alerts, supplier links and the pricing
-- recompute queue.
--
-- ASCII-ONLY BY DESIGN, following 436.
--
-- Subject list derived by the query quoted verbatim in migration 461 section 0.
--
-- ============================================================================
-- 1. WHY THIS TIER IS ALMOST ENTIRELY REVOKES
-- ============================================================================
--
-- Ten of the eleven functions below have NO direct caller in the application. They are trigger
-- bodies, queue workers driven by the service role, or dead entry points that pg_proc still
-- advertises to `authenticated`. Migration 436 settled what to do with that shape, for
-- apply_stock_movement: REVOKE the direct grant rather than add a body guard, because the real
-- callers are nested SECURITY DEFINER calls and triggers that run with current_user = the
-- function owner and never consult the session role's grant at all. A body guard would be
-- evaluated against whoever happened to fire the trigger and would break the internal path for
-- no security gain.
--
-- Each name carries the grep that proves it. Where the only hit is
-- src/integrations/supabase/types.ts, that is the GENERATED type surface, not a call site.
--
--   next_product_sku(_year integer)
--       grep -rlF 'next_product_sku' src server -> src/integrations/supabase/types.ts
--       DB caller: products_assign_sku (trigger).
--       Every call BURNS a value from product_sku_counters. An ungated grant is a
--       gap-in-the-sequence defect as much as a write: a caller can consume SKUs at will.
--
--   apply_required_services_for_quote_item(p_item_id uuid)
--       grep -rlF 'apply_required_services_for_quote_item' src server -> (nothing at all)
--       DB callers: trg_quote_item_required_services (trigger), update_sales_quote_status.
--
--   sync_product_stock_status(_product_id uuid)
--       grep -rlF 'sync_product_stock_status' src server -> (nothing at all)
--       DB caller: apply_stock_movement - the very function 436 closed by this same reasoning.
--
--   check_price_alerts_for_product(p_product_id uuid, p_sale_price_type_id uuid, ...)
--       grep -rlF 'check_price_alerts_for_product' src server -> src/integrations/supabase/types.ts
--       DB caller: _par_after_price_history_insert (trigger).
--       Writes price_alert_notifications and notification_events for OTHER users' alert rules,
--       so an ungated grant is a notification-injection primitive.
--
--   enqueue_pricing_recompute(_product_ids uuid[], _reason text, ...)
--       grep -rlF 'enqueue_pricing_recompute' src server -> src/integrations/supabase/types.ts
--       DB callers: trg_enqueue_on_currency_rate_change, trg_enqueue_on_pricing_rule_change,
--                   trg_enqueue_on_purchase_price_change, trg_enqueue_on_shipping_rule_change.
--
--   claim_pricing_recompute_jobs(_batch_size integer, _max_attempts integer)
--       grep -rn 'claim_pricing_recompute_jobs' src server
--         -> src/lib/pricing/process-recompute-queue.server.ts, and that file's first line is
--            `import { supabaseAdmin } from "@/integrations/supabase/client.server"` - the
--            SERVICE-ROLE client. service_role keeps its grant, so the worker is untouched.
--       It marks queue rows 'processing' and increments attempts; an authenticated caller could
--       starve the worker by claiming its batches.
--
--   upsert_market_product_match_candidate(p_source_name market_match_source, ...)
--       grep -rn 'upsert_market_product_match_candidate' src server
--         -> src/routes/api.public.bot.market-matches.candidates.upsert.ts, which calls it on
--            `supabaseAdmin` - again the service-role client.
--
--   cleanup_stale_auto_suppliers()
--       grep -rlF 'cleanup_stale_auto_suppliers' src server -> src/integrations/supabase/types.ts
--       DB callers: none. It DELETEs from product_suppliers.
--
--   sync_product_price_observatory_rows()
--       grep -rlF 'sync_product_price_observatory_rows' src server
--         -> src/integrations/supabase/types.ts
--       DB callers: none.
--
--   refresh_all_sale_list_prices()
--       grep -rlF 'refresh_all_sale_list_prices' src server -> src/integrations/supabase/types.ts
--       DB callers: none. Rewrites current_price on EVERY sale_list_items row.
--
-- NOT IN THIS FILE, deliberately: public.refresh_sale_list_prices(p_list_id uuid), the
-- single-list sibling of the last one. It DOES have live callers
-- (src/lib/public/get-public-sale-list.ts and the sale-list route), it is invoked on page load,
-- and it accepts nothing from the caller but which list to refresh - it copies already-committed
-- product_computed_prices forward. Gating it would blank a page for viewers who are entitled to
-- see it, so it is allowlisted with that reason in
-- e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts instead of being closed here.
--
-- ============================================================================
-- 2. THE ONE THAT NEEDS A BODY GUARD: find_or_create_model
-- ============================================================================
--
--   find_or_create_model(p_name text, p_category_id uuid)
--       grep -rn 'find_or_create_model' src server
--         -> src/components/products/ProductForm.tsx   (a live call, as the signed-in user)
--
-- It keeps its `authenticated` grant, so it needs a real check. It already has this, and the
-- comment above it is the finding:
--
--     -- Permission: only authenticated users with products.create may invoke
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'not_authenticated';
--     END IF;
--
-- The comment promises a PERMISSION. The code tests only that somebody is logged in. There is
-- no products.create anywhere in the schema. So the check that is written down was never the
-- check that ran, and any authenticated user - `viewer` included - could insert rows into
-- public.product_attributes and grow the catalogue's model vocabulary at will.
--
-- Role set ARRAY['admin','manager','sales']::text[], taken from the product surface's own
-- precedent: public.product_video_advance and public.product_video_mark_uploaded both use
-- exactly admin/manager/sales, and ProductForm is a sales-facing screen. user_roles.role is TEXT
-- and the ::text[] cast is required to disambiguate from the app_role[] overload.
-- has_any_role(NULL, ...) is false, so the unauthenticated case the old line covered is still
-- covered, by the new line.

-- --------------------------------------------------------------------------------------------
-- 3. BODY CHANGE (one)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_or_create_model(p_name text, p_category_id uuid)
RETURNS TABLE(id uuid, name text, category_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_id uuid;
  v_name text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_required';
  END IF;

  -- 464: the previous line here was `IF auth.uid() IS NULL THEN RAISE 'not_authenticated'`, under
  -- a comment claiming "only authenticated users with products.create may invoke". No such
  -- permission exists in this schema and none was ever checked, so every logged-in user could
  -- add catalogue models. This is the check the comment always described.
  -- has_any_role(NULL, ...) is false, so the unauthenticated case is still refused here.
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only admin, manager or sales may create a product model'
      USING ERRCODE = '42501';
  END IF;

  v_norm := lower(btrim(p_name));

  -- Look for existing in same category
  SELECT pa.id, pa.name INTO v_id, v_name
  FROM public.product_attributes pa
  WHERE pa.type = 'model'
    AND pa.category_id = p_category_id
    AND lower(btrim(pa.name)) = v_norm
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_name, p_category_id;
    RETURN;
  END IF;

  -- Insert new
  INSERT INTO public.product_attributes (type, name, category_id, is_active, created_by)
  VALUES ('model', btrim(p_name), p_category_id, true, auth.uid())
  RETURNING product_attributes.id, product_attributes.name INTO v_id, v_name;

  RETURN QUERY SELECT v_id, v_name, p_category_id;
END;
$function$;

-- --------------------------------------------------------------------------------------------
-- 4. GRANTS. After the replace, because CREATE OR REPLACE restores the defaults.
--    PUBLIC is revoked separately from anon and is not redundant (wave 3).
-- --------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.next_product_sku(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_required_services_for_quote_item(uuid)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_product_stock_status(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_price_alerts_for_product(uuid, uuid, numeric, numeric, numeric)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_pricing_recompute(uuid[], text, text, uuid, uuid, integer)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pricing_recompute_jobs(integer, integer)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_market_product_match_candidate(
  market_match_source, text, text, text, text, numeric, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_auto_suppliers() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_product_price_observatory_rows()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_all_sale_list_prices() FROM anon, authenticated, PUBLIC;

-- find_or_create_model KEEPS authenticated - ProductForm calls it as the signed-in user.
REVOKE EXECUTE ON FUNCTION public.find_or_create_model(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_or_create_model(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.find_or_create_model(text, uuid) TO authenticated;

-- --------------------------------------------------------------------------------------------
-- 5. VERIFY, in the same transaction.
-- --------------------------------------------------------------------------------------------
DO $verify$
DECLARE
  v_fn   text;
  v_open text[] := '{}';
  v_sales uuid;
BEGIN
  -- 5a. the ten internal-only catalogue functions hold no direct grant.
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.proname IN ('next_product_sku','apply_required_services_for_quote_item',
                        'sync_product_stock_status','check_price_alerts_for_product',
                        'enqueue_pricing_recompute','claim_pricing_recompute_jobs',
                        'upsert_market_product_match_candidate','cleanup_stale_auto_suppliers',
                        'sync_product_price_observatory_rows','refresh_all_sale_list_prices')
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '464: EXECUTE still held on catalogue functions: %', array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '464: verified - the ten internal catalogue functions hold no anon/authenticated grant';

  -- 5b. the OPEN half. The two service-role workers must still be reachable by service_role, or
  --     the pricing queue and the bot match ingest are dead rather than secured.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('claim_pricing_recompute_jobs','upsert_market_product_match_candidate')
         AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 2 THEN
    RAISE EXCEPTION '464: service_role lost a worker RPC - the pricing queue or bot ingest is broken';
  END IF;
  RAISE NOTICE '464: verified - service_role still reaches the two worker RPCs';

  -- 5c. find_or_create_model kept authenticated and lost anon.
  IF NOT has_function_privilege('authenticated',
        'public.find_or_create_model(text,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '464: find_or_create_model lost authenticated - ProductForm is broken';
  END IF;
  IF has_function_privilege('anon',
        'public.find_or_create_model(text,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '464: find_or_create_model is still reachable by anon';
  END IF;
  RAISE NOTICE '464: verified - find_or_create_model keeps authenticated and loses anon';

  -- 5d. the new body guard, probed with set_config and without calling the function.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  IF public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '464: an unprivileged authenticated sub PASSES the catalogue guard';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- 5e. the OPEN half of the body guard, against a real SALES user - the role that actually
  --     drives ProductForm. Proving it with an admin would not show that sales still works.
  SELECT user_id INTO v_sales FROM public.user_roles WHERE role = 'sales' LIMIT 1;
  IF v_sales IS NULL THEN
    RAISE EXCEPTION '464: no sales user exists to prove the open half';
  END IF;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sales::text, 'role', 'authenticated')::text, true);
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '464: a real SALES user is REFUSED by find_or_create_model - ProductForm is broken';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '464: verified - the catalogue guard refuses an unprivileged sub and admits sales';
END
$verify$;
