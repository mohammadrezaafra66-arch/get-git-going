SET client_encoding='UTF8';

-- 399 — OG-61 option (c): close the UNAUTHENTICATED path into 26 SECURITY DEFINER functions
-- that write, and carry no authorization check of their own.
--
-- THE ONE THAT MAKES THIS URGENT, verified live and rolled back on 2026-08-26:
--
--     SET ROLE anon;
--     SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
--     -- admin role rows: 14 -> 13
--
-- An UNAUTHENTICATED caller stripped the admin role from a real administrator. PostgREST
-- exposes every function in `public`, so this needed no credentials at all — only the ability
-- to reach the API. Repeated over `user_roles` it locks the company out of its own system.
-- The probe ran inside BEGIN … ROLLBACK; nothing was actually changed.
--
-- HOW THE SET WAS CHOSEN — the owner's option (c) with OG-62's method, not a blanket sweep:
--   * Scope is SECURITY DEFINER + anon-executable ONLY. That is 314 functions, not the 713
--     the row once implied — 713 counted every anon-executable function regardless of definer.
--   * The 63 STABLE ones were CALLED as anon inside a rollback. 44 refused from inside their
--     own bodies, 2 returned NULL-shaped output, and 3 returned values that look like data
--     until you read them — `("")` and `({})`, which are EMPTY. Judged on the VALUE rather
--     than the row count, per OG-62, **not one of them leaks.** Nothing to revoke there.
--   * The 251 VOLATILE ones had their BODIES read. 119 are trigger functions, which cannot be
--     usefully invoked directly. Of the rest, 96 carry a guard. That leaves these 26.
--   * All 26 were then CALLED as anon inside a rollback: **19 executed with no authorization
--     error whatsoever and ZERO were denied.** The other 7 failed on NULL arguments — a
--     failure of the argument, not of authorization, so they are not evidence of safety and
--     are included.
--
-- THE 11 BOOLEAN RLS HELPERS ARE UNTOUCHED, by owner instruction: RLS policies call them, and
-- revoking EXECUTE would break the very policies that enforce access.
--
-- WHY REVOKING IS SAFE HERE. Every one of these carries an EXPLICIT `authenticated=X` grant
-- separate from the PUBLIC `=X` grant, so removing `anon` and `PUBLIC` leaves `authenticated`
-- and `service_role` exactly as they were. Checked individually, not assumed.
--   * `bot_authenticate_key` looks like it must be anon-callable — a bot presenting a raw key
--     is unauthenticated. It is not: its only caller, `src/server/bot-api.ts:286`, goes through
--     `supabaseAdmin`, i.e. the service role. Revoking anon closes an offline brute-force
--     oracle against `bot_api_keys` without touching the real path.
--   * `expire_pending_documents` is called from the messenger inquiry flow as an authenticated
--     user (`src/lib/messenger/inquiry-status.ts`), which keeps working.
--
-- A BARE GLOBAL REVOKE REMAINS FORBIDDEN and this is not one. It names 26 functions. Mission 4
-- measured why the blanket form is dangerous: it strips EXECUTE from EVERY role rather than
-- anon, and reaches schemas that appear in no list — `pgbouncer.get_auth()` depends entirely
-- on its PUBLIC grant, and killing it kills connection pooling.
--
-- WHAT THIS DOES **NOT** FIX, raised as OG-74 rather than silently widened here: these
-- functions still have no INTERNAL guard, so any *authenticated* user — `sales`, `viewer` —
-- can still call `revoke_user_role_txt` and strip an administrator. Fixing that means adding
-- authorization inside 26 bodies, which is a behavioural change well beyond a grant revoke and
-- needs its own mission. This migration closes the unauthenticated hole, which is the one that
-- needs no credentials at all.

REVOKE EXECUTE ON FUNCTION public.ai_record_provider_health(p_provider_id uuid, p_capability text, p_status text, p_error_code text, p_error_message text, p_latency_ms integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_record_provider_health(p_provider_id uuid, p_capability text, p_status text, p_error_code text, p_error_message text, p_latency_ms integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_required_services_for_quote_item(p_item_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_required_services_for_quote_item(p_item_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_burn_document_number(_doc_type text, _source_id uuid, _reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_burn_document_number(_doc_type text, _source_id uuid, _reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_xp_from_score(_employee_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_xp_from_score(_employee_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bot_authenticate_key(p_raw_key text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_authenticate_key(p_raw_key text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_score_snapshots() FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_score_snapshots() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(_employee_id uuid, _event_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(_employee_id uuid, _event_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(_employee_id uuid, _event_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(_employee_id uuid, _event_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_price_alerts_for_product(p_product_id uuid, p_sale_price_type_id uuid, p_current_price numeric, p_previous_price numeric, p_change_percent numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_price_alerts_for_product(p_product_id uuid, p_sale_price_type_id uuid, p_current_price numeric, p_previous_price numeric, p_change_percent numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pricing_recompute_jobs(_batch_size integer, _max_attempts integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pricing_recompute_jobs(_batch_size integer, _max_attempts integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_auto_suppliers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_auto_suppliers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.detect_phone_collisions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.detect_phone_collisions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_pricing_recompute(_product_ids uuid[], _reason text, _source_table text, _source_id uuid, _sale_price_type_id uuid, _priority integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_pricing_recompute(_product_ids uuid[], _reason text, _source_table text, _source_id uuid, _sale_price_type_id uuid, _priority integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_pending_delivery_receipts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_pending_delivery_receipts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_pending_documents() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_pending_documents() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_product_sku(_year integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_product_sku(_year integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_sales_quote_number(_year integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_sales_quote_number(_year integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_settlement_score(_customer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_settlement_score(_customer_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_all_sale_list_prices() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_all_sale_list_prices() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_sale_list_prices(p_list_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_sale_list_prices(p_list_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settle_league_season() FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_league_season() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_product_price_observatory_rows() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_price_observatory_rows() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_product_stock_status(_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_stock_status(_product_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_overdue_status(_customer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_customer_overdue_status(_customer_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_market_product_match_candidate(p_source_name market_match_source, p_source_product_url text, p_source_product_id text, p_source_title text, p_normalized_source_title text, p_confidence_score numeric, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_market_product_match_candidate(p_source_name market_match_source, p_source_product_url text, p_source_product_id text, p_source_title text, p_normalized_source_title text, p_confidence_score numeric, p_notes text) FROM PUBLIC;

-- Assertions. TWO-SIDED, because asserting only the revoke would pass a migration that locked
-- everyone out, and asserting only the survival would pass one that revoked nothing.
--   CLOSED  - anon must execute NONE of the 26.
--   OPEN    - `authenticated` must still execute ALL 26.
--
-- Matched by NAME, not by regprocedure: `pg_get_function_identity_arguments` includes parameter
-- NAMES, which regprocedure cannot parse ("invalid type name") - the dry run caught that. None
-- of these 26 is overloaded, verified against pg_proc, so a name is an exact identifier here.
DO $verify$
DECLARE
  v_anon  int;
  v_auth  int;
  v_total int;
  v_names text;
  c_names constant text[] := ARRAY[
              'ai_record_provider_health',
              'apply_required_services_for_quote_item',
              'asan_burn_document_number',
              'award_xp_from_score',
              'bot_authenticate_key',
              'capture_score_snapshots',
              'check_and_unlock_achievements_for_employee',
              'check_and_update_mission_progress_for_employee',
              'check_price_alerts_for_product',
              'claim_pricing_recompute_jobs',
              'cleanup_stale_auto_suppliers',
              'detect_phone_collisions',
              'enqueue_pricing_recompute',
              'expire_pending_delivery_receipts',
              'expire_pending_documents',
              'next_product_sku',
              'next_sales_quote_number',
              'recalculate_settlement_score',
              'refresh_all_sale_list_prices',
              'refresh_sale_list_prices',
              'revoke_user_role_txt',
              'settle_league_season',
              'sync_product_price_observatory_rows',
              'sync_product_stock_status',
              'update_customer_overdue_status',
              'upsert_market_product_match_candidate'];
BEGIN
  SELECT count(*) INTO v_total
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (c_names);
  IF v_total <> array_length(c_names, 1) THEN
    RAISE EXCEPTION '399: expected % functions by name but found % - the target set has drifted',
      array_length(c_names, 1), v_total;
  END IF;

  SELECT count(*), string_agg(p.proname, ', ')
    INTO v_anon, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (c_names)
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon > 0 THEN
    RAISE EXCEPTION '399: anon still executes % of them: %', v_anon, v_names;
  END IF;

  SELECT count(*) INTO v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (c_names)
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_auth <> array_length(c_names, 1) THEN
    RAISE EXCEPTION '399: authenticated should still execute all % but executes only % - the revoke went too far',
      array_length(c_names, 1), v_auth;
  END IF;

  RAISE NOTICE '399: anon executes 0 of %; authenticated still executes all of them',
    array_length(c_names, 1);
END
$verify$;

-- And the claim that matters, re-run as an executable assertion rather than left as prose:
-- the live attack must now be REFUSED. This is the same call that succeeded before the revoke.
DO $attack$
DECLARE
  v_target uuid;
BEGIN
  SELECT user_id INTO v_target FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_target IS NULL THEN
    RAISE NOTICE '399: no admin user to re-run the attack against; catalogue assertions stand alone';
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM public.revoke_user_role_txt(v_target, 'admin');
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION '399: anon STILL revoked an admin role - the fix does not work';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    RAISE NOTICE '399: verified - the live attack is now refused with 42501';
  END;
END
$attack$;
