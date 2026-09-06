SET client_encoding='UTF8';

-- 476 - the proacl sweep. 142 pre-393 functions in `public` lose the `anon` EXECUTE grant they
--       were born with. No GRANT statement exists for any of them anywhere in history; the
--       grant came from the schema's FUNCTIONS default privilege at CREATE time, so a search of
--       supabase/migrations cannot find them. Only `pg_proc.proacl` can.
--
-- ASCII-ONLY BY DESIGN. This file changes no function body and adds no user-visible string.
--
-- ============================================================================
-- 0. WHAT WAS MEASURED, LIVE, ON 2026-09-06 (afrakala-lan-db / database `afrakala`)
-- ============================================================================
--
--   functions in schema public                                          828
--   ... executable by `anon`                                            647
--   ... of those, owned by an extension (btree_gist 188, vector 110,
--       pg_trgm 31)                                                     329
--   ... application functions (no pg_depend deptype 'e')                318
--
-- Two independent methods agree on the 318/329 split: `pg_depend deptype='e'`, and a scan of
-- supabase/migrations for the CREATE that first defines each name (329 names appear in no
-- migration file at all - they arrived with CREATE EXTENSION).
--
-- OF THE 318 APPLICATION FUNCTIONS, ZERO WERE CREATED AFTER MIGRATION 393. Every one predates
-- 2026-08-26. That is the positive result of this sweep: 393 closed the default privilege and
-- it has held. What 393 did not do - and never claimed to do - was retroactively strip the
-- grants already handed out. This file does that, for the reachable ones.
--
-- ============================================================================
-- 1. SCOPE: 142 OF THE 318, AND EVERY EXCLUSION IS DERIVED, NOT CHOSEN
-- ============================================================================
--
--   318  application functions executable by anon
--  -159  return `trigger` - PostgREST does not expose them, so no anonymous caller can
--        reach them at all. Revoking would close nothing and would rest on a claim about when
--        PostgreSQL checks EXECUTE for a trigger function. Left in place DELIBERATELY and
--        handed forward, not silently omitted. See section 5.
--   159  non-trigger, anon-reachable through /rest/v1/rpc/
--   -17  referenced by an RLS policy on a table `anon` can touch, or called by a view `anon`
--        can SELECT, or used in a CHECK constraint / DEFAULT on an anon-writable table.
--   142  revoked here.
--
-- THE 17 EXCLUSIONS ARE THE OG-77 TRAP IN A DIFFERENT CATALOGUE, and they are why this file
-- carries 142 names and not 159. OG-77 / migration 405 records what happens when a revoke
-- ignores that a role must EXECUTE what it reads: 395 revoked `get_product_price_bounds` from
-- PUBLIC and took the credentialed products API offline, because that role reached the function
-- only through the PUBLIC grant - and every catalogue check in 395 passed. The same
-- relationship exists in `pg_policy`: an RLS policy expression is part of the query the CURRENT
-- user runs. These are the 17, all predicate helpers:
--
--   dyn_table_role_can_view, has_any_role(uuid,app_role[]), has_any_role(uuid,text[]),
--   has_role(uuid,app_role), has_role(uuid,text), is_appellant_of_appeal, is_board_approved,
--   is_board_manager, is_hr_manager, is_product_owner, is_reviewer_of_appeal, is_viewer_only,
--   kd_role_can_view, messenger_attachment_path_owner, messenger_attachment_size_ok,
--   normalize_fa, tehran_today
--
-- `has_role` and `has_any_role` sit in the RLS policies of tables `anon` holds privileges on.
-- Revoking EXECUTE from anon there would not harden anything - it would make the policy
-- expression itself raise 42501 and take the public sale-list page and the public product feed
-- down. They stay.
--
-- ============================================================================
-- 2. WHY REVOKING IS SAFE - THREE MEASUREMENTS, NOT AN ARGUMENT
-- ============================================================================
--
-- (a) NO CALLER LOSES ACCESS. All 647 anon-executable functions - the 142 included - carry an
--     EXPLICIT `authenticated=X` AND an EXPLICIT `service_role=X` entry in proacl. Measured:
--
--       no_explicit_authenticated = 0
--       no_explicit_service_role  = 0
--
--     So neither role reaches any of them through the bare `=X` PUBLIC entry, and revoking
--     PUBLIC cannot cut them. This is the fact 395 did not have.
--
-- (b) NO VIEW BREAKS. OG-77's own query, re-run with these functions as the target set and
--     every role in pg_roles (not an enumerated pair), returns ZERO (role, view, function)
--     triples that would lose EXECUTE. The derivation is NOT vacuous: 36 triples are in scope
--     and 2 functions - `is_viewer_only` and `tehran_today` - are actually called by views.
--     Both are in the excluded 17, so they are never revoked here at all.
--
-- (c) NO APPLICATION CALLER IS ANONYMOUS. Every route outside the auth-gated `_app` layout was
--     walked transitively through its import graph - login, register, reset-password,
--     pending-approval, unauthorized, index, public.sale-lists, sitemap, mcp, .well-known,
--     api.healthz, api.version and every api/public/* handler - 81 files. It found 22 RPC call
--     sites. Every one is either issued through `supabaseAdmin` (service_role), or already
--     anon=false:
--
--       refresh_sale_list_prices    src/lib/public/get-public-sale-list.ts:50
--                                   ALREADY anon=false (revoked by 399)
--       get_recent_purchase_label   src/components/products/RecentPurchaseBadge.tsx:26
--                                   ALREADY anon=false
--       log_event                   src/lib/auth/AuthProvider.tsx:79 and :104 - both run AFTER
--                                   signInWithPassword resolves, so the client already holds a
--                                   session and the call is `authenticated`, not `anon`.
--       set_profile_field_value     src/routes/register.tsx:131 - "while we still have a
--                                   session", and its body already opens
--                                   `IF auth.uid() IS NULL THEN RAISE 'Auth required'`.
--                                   Revoking turns P0001 into 42501 for a caller that was
--                                   already being refused.
--       every bot_* / *_system / ai_* call goes through supabaseAdmin (service_role).
--
--     There is no pg_cron in this database (pg_extension: 0 rows), so no scheduled caller runs
--     without a JWT either.
--
-- ============================================================================
-- 3. WHAT WAS ACTUALLY EXPOSED - RANKED, AND SMALLER THAN IT FIRST LOOKED
-- ============================================================================
--
-- Composition of the 142 by what the body does:
--
--   DEFINER, writes, own caller check      67
--   DEFINER, reads,  own caller check      28
--   DEFINER, reads,  no direct check       29   <-- see the correction below
--   INVOKER, reads                         17   (RLS applies; the grant buys nothing)
--   INVOKER, writes, own caller check       1
--
-- ZERO of the 142 is a SECURITY DEFINER writer with no caller check. That class is the OG-61
-- hole, and migrations 399 / 468 / 471 already closed it; this sweep confirms none was missed.
--
-- A FIRST PASS OVERSTATED THE "NO CHECK" COLUMN AND THE CORRECTION IS RECORDED RATHER THAN
-- QUIETLY ADOPTED. A regex over `prosrc` for auth.uid/has_role/... counted 29 unguarded DEFINER
-- readers, including all 13 `mi_get_*` and all 9 `gamification_analytics_*`. Reading the bodies
-- shows they DELEGATE the check one call deep:
--
--   mi_get_hot_brands              PERFORM _mi_require_privileged();  -- admin/manager/accountant
--   gamification_analytics_summary PERFORM public.gamification_assert_manager();
--   asan_assign_document_numbers   PERFORM public.asan_assign_document_number(...) per id, and
--                                  that one requires admin/accountant
--   query_dynamic_table_rows_v2    delegates the row set to query_dynamic_table_rows, which
--                                  checks dyn_table_role_can_view
--
-- All of those refuse an anonymous caller today. The grant on them is redundant, not a live
-- leak. After that correction SIX functions are genuinely unguarded and anon-reachable:
--
--   _dyn_compute_row_values(uuid, uuid)   DEFINER, no check - computed values for any dynamic
--                                         table row, given a table id and a row id
--   _obs_compute_row_values(uuid)         DEFINER, no check - price-observatory row values
--   is_user_online(uuid)                  DEFINER, no check - reads profiles.last_seen_at, so
--                                         an anonymous caller can probe whether a given user
--                                         id is online right now
--   get_kpi_xp(text, numeric)             DEFINER, no check - gamification XP rule values
--   generate_sale_price_type_code()       DEFINER, no check - reads existing codes to mint one
--   assert_person_fk_registry()           DEFINER, no check - internal registry assertion
--
-- Like `ai_get_provider_key` in 471, the first two are capability-URLs rather than one-request
-- compromises: they need a uuid the caller must obtain elsewhere. A row id is not a secret.
--
-- ============================================================================
-- 4. NO BODY IS CHANGED, DELIBERATELY
-- ============================================================================
--
-- 471 paired its revoke with a body guard because that function hands out credentials. The six
-- above get the revoke only, and the reason is specific rather than lazy: they are INTERNAL
-- HELPERS called from inside other SECURITY DEFINER functions. A guard of the form
-- `IF auth.uid() IS NULL THEN RAISE` would also refuse every server-side path, because a
-- `service_role` JWT carries no `sub` claim and auth.uid() is NULL there - the exact trap
-- 471's COALESCE note describes, in the direction that breaks working callers instead of the
-- direction that lets attackers through. Choosing the right guard per function needs the
-- call-site analysis 468 and 471 each did for their own handful. Handed forward, not done blind.
--
-- ============================================================================
-- 5. WHAT THIS FILE DOES NOT DO
-- ============================================================================
--
--   * The 159 trigger-returning functions keep their anon grant. Unreachable via PostgREST.
--   * The 329 extension functions (btree_gist, vector, pg_trgm) keep theirs. They are managed
--     objects - CREATE EXTENSION and any extension update re-issue the grants - and several are
--     type I/O and GiST/GIN support functions that the planner and index scans resolve
--     internally. Revoking them closes nothing and risks operator resolution.
--   * `anon` holds INSERT/UPDATE/DELETE table grants on 202 public tables and SELECT on 199.
--     RLS is what stops it. That is a separate surface and a separate mission.
--   * `authenticated` is not revoked anywhere in this file, exactly as in 468 and 471.
--
-- ============================================================================
-- 6. ORDER AND FAILURE MODE
-- ============================================================================
--
-- Grants only - there is no CREATE OR REPLACE anywhere in this file - so none of the ordering
-- traps in 471 section 5 apply. Both `FROM anon` and `FROM PUBLIC` are issued on every
-- function, because 294 of the 318 carry BOTH an explicit `anon=X` and a bare `=X/supabase_admin`
-- entry, and each survives the other's revoke untouched (381 documents one direction, 471 the
-- other). Issuing only one half is exactly how ai_get_provider_key stayed open for a month.
--
-- If this file is wrong, the symptom is 42501 raised for an authenticated user on an admin
-- screen. Measurement (a) is what says that cannot happen, and the paired e2e gate re-checks it
-- from the catalogue on every run.

REVOKE EXECUTE ON FUNCTION public._dyn_compute_row_values(p_table_id uuid, p_row_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._dyn_compute_row_values(p_table_id uuid, p_row_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._mi_require_privileged() FROM anon;
REVOKE EXECUTE ON FUNCTION public._mi_require_privileged() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._obs_compute_row_values(p_row_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._obs_compute_row_values(p_row_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_dynamic_table_column(p_table_id uuid, p_column_key text, p_label text, p_data_type text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_dynamic_table_column(p_table_id uuid, p_column_key text, p_label text, p_data_type text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_warehouse_stock(_product_id uuid, _warehouse_id uuid, _new_quantity numeric, _note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_warehouse_stock(_product_id uuid, _warehouse_id uuid, _new_quantity numeric, _note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_ai_provider(p_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_ai_provider(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_gamification_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_gamification_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_ai_provider(p_id uuid, p_name text, p_label text, p_kind text, p_base_url text, p_is_active boolean, p_priority integer, p_chat_model text, p_embed_model text, p_vision_model text, p_capabilities text[], p_api_key text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_ai_provider(p_id uuid, p_name text, p_label text, p_kind text, p_base_url text, p_is_active boolean, p_priority integer, p_chat_model text, p_embed_model text, p_vision_model text, p_capabilities text[], p_api_key text, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.api_dynamic_table_query_rows(p_table_slug text, p_filters jsonb, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_dynamic_table_query_rows(p_table_slug text, p_filters jsonb, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.api_dynamic_table_update_cell(p_table_slug text, p_row_id uuid, p_column_key text, p_value text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_dynamic_table_update_cell(p_table_slug text, p_row_id uuid, p_column_key text, p_value text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_currency_fetch(p_fetch_id uuid, p_deactivate_previous boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_currency_fetch(p_fetch_id uuid, p_deactivate_previous boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_pending_user(_user_id uuid, _role app_role, _position text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_pending_user(_user_id uuid, _role app_role, _position text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_platform_release(p_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_platform_release(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_assign_document_number(_doc_type text, _source_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_assign_document_number(_doc_type text, _source_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_assign_document_numbers(_doc_type text, _ids uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_assign_document_numbers(_doc_type text, _ids uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_classify_person_batch(p_batch_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_classify_person_batch(p_batch_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_classify_product_batch(p_batch_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_classify_product_batch(p_batch_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_commit_person_batch(p_batch_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_commit_person_batch(p_batch_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_commit_product_batch(p_batch_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_commit_product_batch(p_batch_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_fold_chars(p text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_fold_chars(p text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_list_purchase_export(_from date, _to date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_list_purchase_export(_from date, _to date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_list_sales_export(_from date, _to date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_list_sales_export(_from date, _to date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_normalize_code(p text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_normalize_code(p text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_normalize_name(p text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.asan_normalize_name(p text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assert_person_fk_registry() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assert_person_fk_registry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calc_xp_for_level(_level integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calc_xp_for_level(_level integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_customer_realtime_credit(p_customer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_customer_realtime_credit(p_customer_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_salesperson_collected_sales(p_employee_id uuid, p_window_months integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_salesperson_collected_sales(p_employee_id uuid, p_window_months integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_next_quote_send_queue_item() FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_next_quote_send_queue_item() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_quote_send_queue_item(p_queue_id uuid, p_success boolean, p_error text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_quote_send_queue_item(p_queue_id uuid, p_success boolean, p_error text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_daily_capital(p_capital_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_daily_capital(p_capital_date date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_bot_api_key(p_name text, p_expires_at timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_bot_api_key(p_name text, p_expires_at timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_custom_role(_name text, _display_name text, _description text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_custom_role(_name text, _display_name text, _description text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_delivery_receipt(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_invoice_id uuid, p_customer_id uuid, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_delivery_receipt(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_invoice_id uuid, p_customer_id uuid, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_document(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_reference_id uuid, p_reference_type text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_document(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_reference_id uuid, p_reference_type text, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_dynamic_table_row(p_table_id uuid, p_values jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_dynamic_table_row(p_table_id uuid, p_values jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_manual_penalty(p_user_id uuid, p_type text, p_severity text, p_description text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_penalty(p_user_id uuid, p_type text, p_severity text, p_description text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sales_quote_with_items(p_customer_name text, p_customer_phone text, p_customer_note text, p_expires_at timestamp with time zone, p_subtotal_amount numeric, p_discount_amount numeric, p_final_amount numeric, p_items jsonb, p_settlement_type_id uuid, p_customer_id uuid, p_below_list_ack boolean, p_deposit_amount numeric, p_commitment_confirmed boolean, p_visitor_id uuid, p_warehouse_id uuid, p_quote_exception_type text, p_quote_exception_minutes integer, p_quote_exception_amount numeric, p_quote_exception_text text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_sales_quote_with_items(p_customer_name text, p_customer_phone text, p_customer_note text, p_expires_at timestamp with time zone, p_subtotal_amount numeric, p_discount_amount numeric, p_final_amount numeric, p_items jsonb, p_settlement_type_id uuid, p_customer_id uuid, p_below_list_ack boolean, p_deposit_amount numeric, p_commitment_confirmed boolean, p_visitor_id uuid, p_warehouse_id uuid, p_quote_exception_type text, p_quote_exception_minutes integer, p_quote_exception_amount numeric, p_quote_exception_text text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deactivate_user(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_user(_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.default_warehouse_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.default_warehouse_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_bot_api_key_table_access(p_key_id uuid, p_table_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_bot_api_key_table_access(p_key_id uuid, p_table_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.export_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.export_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_achievements(p_from timestamp with time zone, p_to timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_achievements(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_active_season() FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_active_season() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_employees() FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_employees() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_kpi_effectiveness(p_from timestamp with time zone, p_to timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_kpi_effectiveness(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_league_distribution() FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_league_distribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_missions(p_from timestamp with time zone, p_to timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_missions(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_risk(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_risk(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_top_employees(p_from timestamp with time zone, p_to timestamp with time zone, p_event_type text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_top_employees(p_from timestamp with time zone, p_to timestamp with time zone, p_event_type text, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_trend(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_analytics_trend(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gamification_assert_manager() FROM anon;
REVOKE EXECUTE ON FUNCTION public.gamification_assert_manager() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_birthday_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_birthday_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sale_price_type_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_sale_price_type_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_balances(p_account_type text, p_include_inactive boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_account_balances(p_account_type text, p_include_inactive boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_ledger(p_account_id uuid, p_from_date date, p_to_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_account_ledger(p_account_id uuid, p_from_date date, p_to_date date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_delivery_receipts(p_type text, p_status text, p_invoice_id uuid, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_delivery_receipts(p_type text, p_status text, p_invoice_id uuid, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_documents(p_type text, p_status text, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_documents(p_type text, p_status text, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_employee_progress(_employee_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_progress(_employee_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_rejected_quotes(p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rejected_quotes(p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payable_detail(p_supplier_id uuid, p_purchase_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_payable_detail(p_supplier_id uuid, p_purchase_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payables_list(p_from_date date, p_to_date date, p_supplier_id uuid, p_due_filter text, p_search text, p_limit integer, p_offset integer, p_include_paid boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_payables_list(p_from_date date, p_to_date date, p_supplier_id uuid, p_due_filter text, p_search text, p_limit integer, p_offset integer, p_include_paid boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payables_summary(p_from_date date, p_to_date date, p_supplier_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_payables_summary(p_from_date date, p_to_date date, p_supplier_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_receivables_summary(p_from_date date, p_to_date date, p_customer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_receivables_summary(p_from_date date, p_to_date date, p_customer_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sales_search_products(p_search text, p_brand_ids uuid[], p_category_ids uuid[], p_label_ids uuid[], p_stock_status text, p_product_type text, p_only_with_price boolean, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_search_products(p_search text, p_brand_ids uuid[], p_category_ids uuid[], p_label_ids uuid[], p_stock_status text, p_product_type text, p_only_with_price boolean, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_online(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_user_online(_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_valid_audit_entity_type(_entity_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_valid_audit_entity_type(_entity_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.jalali_year(_d date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jalali_year(_d date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.league_tier_from_index(_idx integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.league_tier_from_index(_idx integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.league_tier_index(_tier league_tier) FROM anon;
REVOKE EXECUTE ON FUNCTION public.league_tier_index(_tier league_tier) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(p_indicator_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(p_indicator_id uuid, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_mutual_settlement_candidates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_mutual_settlement_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_invoice_issuance_blocked_overdue(p_customer_id uuid, p_overdue_amount numeric, p_overdue_count integer, p_oldest_due_date date, p_invoice_type text, p_commitment_confirmed boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_invoice_issuance_blocked_overdue(p_customer_id uuid, p_overdue_amount numeric, p_overdue_count integer, p_oldest_due_date date, p_invoice_type text, p_commitment_confirmed boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_score_decay_factor(_months_elapsed integer, _effect_months integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_score_decay_factor(_months_elapsed integer, _effect_months integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_score_months_elapsed(_from timestamp with time zone, _to timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_score_months_elapsed(_from timestamp with time zone, _to timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(p_notification_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(p_notification_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_demand_growth(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_demand_growth(p_days integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_emerging_products(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_emerging_products(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_hot_brands(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_hot_brands(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_hot_categories(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_hot_categories(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_market_index(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_market_index(p_days integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_price_movers(p_days integer, p_direction text, p_sale_price_type_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_price_movers(p_days integer, p_direction text, p_sale_price_type_id uuid, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_seller_favorite_products(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_seller_favorite_products(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_seller_top_products(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_seller_top_products(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_top_checked_today(p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_top_checked_today(p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_get_trending_products(p_days integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_get_trending_products(p_days integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_fa_text(input text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_fa_text(input text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_identifier(_kind text, _raw text, _strict boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_identifier(_kind text, _raw text, _strict boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_phone_local(_raw text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_phone_local(_raw text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date, _document_channel text, _amount numeric, _tracking_number text, _cheque_number text, _cheque_due_date date, _description text, _payee_party_id uuid, _payee_accounting_code text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date, _document_channel text, _amount numeric, _tracking_number text, _cheque_number text, _cheque_due_date date, _description text, _payee_party_id uuid, _payee_accounting_code text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.person_settlement_position(_person_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.person_settlement_position(_person_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_mutual_settlement(_person_id uuid, _offset_amount numeric, _cash_amount numeric, _bank_account_id uuid, _note text, _entry_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_mutual_settlement(_person_id uuid, _offset_amount numeric, _cash_amount numeric, _bank_account_id uuid, _note text, _entry_date date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_league_season_changes(_season_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.preview_league_season_changes(_season_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_video_advance(_chain_id uuid, _to_stage text, _note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.product_video_advance(_chain_id uuid, _to_stage text, _note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_video_mark_uploaded(_chain_id uuid, _storage_path text, _file_name text, _file_size bigint, _mime_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.product_video_mark_uploaded(_chain_id uuid, _storage_path text, _file_name text, _file_size bigint, _mime_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_platform_release(p_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_platform_release(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.query_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.query_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.query_dynamic_table_rows_v2(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.query_dynamic_table_rows_v2(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quick_approve_user(_user_id uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.quick_approve_user(_user_id uuid, _role text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reactivate_user(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_user(_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_credit_scores(p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_credit_scores(p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_currency_fetch(p_source_id uuid, p_currency currency_code, p_rate numeric, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_currency_fetch(p_source_id uuid, p_currency currency_code, p_rate numeric, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone, p_raw_payload jsonb, p_unit text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone, p_raw_payload jsonb, p_unit text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_status text, p_note text, p_unit text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_status text, p_note text, p_unit text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_currency_fetch(p_fetch_id uuid, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_currency_fetch(p_fetch_id uuid, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_pending_user(_user_id uuid, _notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_pending_user(_user_id uuid, _notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_stale_quote_send_locks() FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_stale_quote_send_locks() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_dynamic_table_columns(p_table_id uuid, p_ordered_ids uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_dynamic_table_columns(p_table_id uuid, p_ordered_ids uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.requeue_failed_quote_send_item(p_queue_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.requeue_failed_quote_send_item(p_queue_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_delivery_receipt(p_receipt_id uuid, p_decision text, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_delivery_receipt(p_receipt_id uuid, p_decision text, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_document(p_document_id uuid, p_decision text, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_document(p_document_id uuid, p_decision text, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_approve(p_match_id uuid, p_afrakala_product_id uuid, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_approve(p_match_id uuid, p_afrakala_product_id uuid, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_disable(p_match_id uuid, p_reason text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_disable(p_match_id uuid, p_reason text, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_reject(p_match_id uuid, p_reject_reason text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_market_product_match_reject(p_match_id uuid, p_reject_reason text, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_product_ids(p_term text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_product_ids(p_term text, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_tokens_match(p_document text, p_term text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_tokens_match(p_document text, p_term text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_bot_api_key_active(p_key_id uuid, p_is_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_bot_api_key_active(p_key_id uuid, p_is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_bot_api_key_table_access(p_key_id uuid, p_table_id uuid, p_can_read boolean, p_can_update boolean, p_allowed_update_columns uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_bot_api_key_table_access(p_key_id uuid, p_table_id uuid, p_can_read boolean, p_can_update boolean, p_allowed_update_columns uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_dynamic_table_row_active(p_row_id uuid, p_is_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_dynamic_table_row_active(p_row_id uuid, p_is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_profile_field_value(_user_id uuid, _field_name text, _value jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_profile_field_value(_user_id uuid, _field_name text, _value jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_league_season(_name text, _start date, _end date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_league_season(_name text, _start date, _end date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run(p_source_code text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run(p_source_code text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_person_fk_registry_gate() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_person_fk_registry_gate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_custom_role_status(_role_id uuid, _is_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_custom_role_status(_role_id uuid, _is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_dynamic_table_cell(p_row_id uuid, p_column_id uuid, p_value text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_dynamic_table_cell(p_row_id uuid, p_column_id uuid, p_value text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_dynamic_table_column(p_column_id uuid, p_label text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_dynamic_table_column(p_column_id uuid, p_label text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_market_rate_source_mapping(p_mapping_id uuid, p_source_symbol text, p_normalize_multiplier numeric, p_is_enabled boolean, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_market_rate_source_mapping(p_mapping_id uuid, p_source_symbol text, p_normalize_multiplier numeric, p_is_enabled boolean, p_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_role_permissions(_role_name text, _permissions jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_role_permissions(_role_name text, _permissions jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_workflow_setting(p_process_key text, p_uploader_role text, p_reviewer_role text, p_timer_minutes integer, p_penalty_enabled boolean, p_penalty_for text, p_is_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_workflow_setting(p_process_key text, p_uploader_role text, p_reviewer_role text, p_timer_minutes integer, p_penalty_enabled boolean, p_penalty_for text, p_is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_price_settlement_compatibility(p_sale_price_type_id uuid, p_settlement_type_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_price_settlement_compatibility(p_sale_price_type_id uuid, p_settlement_type_id uuid) FROM PUBLIC;
