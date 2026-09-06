/**
 * OG-102 / migration 476 — the 142 functions that carried an `anon` EXECUTE grant purely
 * because they were created before migration 393 must stay closed, and the 17 that were
 * deliberately left open must stay open.
 *
 * WHY THIS CLASS OF HOLE IS INVISIBLE TO EVERY OTHER KIND OF CHECK. No GRANT statement was ever
 * written for any of the 142. `grep -rn '<name>' supabase/migrations` finds the CREATE and
 * nothing else. The grant was issued by the schema's FUNCTIONS default privilege at CREATE time
 * — the same mechanism 471 section 1a traced for `ai_get_provider_key` — so history search is
 * structurally incapable of finding them. Only `pg_proc.proacl` can. Measured 2026-09-06:
 * 828 functions in `public`, 647 executable by `anon`, of which 329 belong to extensions
 * (btree_gist, vector, pg_trgm) and 318 are application functions. Every one of the 318 predates
 * 393; none was created after it. 476 revoked the 142 that an unauthenticated caller could
 * actually reach.
 *
 * TWO-SIDED, AND BOTH HALVES ARE LOAD-BEARING (A2.10):
 *   CLOSED — `anon` executes none of the 142. Asserting only this would also pass if the
 *            functions had been dropped, or if every role had been locked out of them.
 *   OPEN   — `authenticated` and `service_role` still execute all 142, so the revoke is proven
 *            to have cut exactly the unauthenticated path. This is the half migration 395 did
 *            not have: it revoked from PUBLIC, `products_api_readonly` reached
 *            `get_product_price_bounds` only through that PUBLIC grant, and a live credentialed
 *            API went down while every catalogue check in 395 passed (OG-77 / migration 405).
 *
 * AND A THIRD HALF THAT IS EASY TO MISS: the 17 EXCLUSIONS must stay reachable. `has_role`,
 * `has_any_role`, `is_viewer_only` and friends are referenced by RLS policies on tables `anon`
 * holds privileges on. An RLS policy expression is part of the query the CURRENT user runs, so
 * revoking EXECUTE from `anon` there does not harden anything — it makes the policy itself raise
 * 42501 and takes the public sale-list page and the public product feed down. A future sweep
 * that "finishes the job" by closing the remaining names would break exactly that.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/**
 * The 142, as `name(identity_args)` — the form `pg_get_function_identity_arguments` prints.
 *
 * Kept as a LITERAL rather than re-derived by the same rule 476 used to select them. A gate that
 * recomputes its own target set from the rule under test cannot detect the rule being narrowed;
 * OG-61 makes the same argument for its 26. The identity arguments are carried because two of
 * these names are overloaded and only one overload was revoked — see the
 * `dyn_table_role_can_view` note in the exclusions test below.
 */
const TARGETS = [
  "_dyn_compute_row_values(p_table_id uuid, p_row_id uuid)",
  "_mi_require_privileged()",
  "_obs_compute_row_values(p_row_id uuid)",
  "add_dynamic_table_column(p_table_id uuid, p_column_key text, p_label text, p_data_type text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean)",
  "adjust_warehouse_stock(_product_id uuid, _warehouse_id uuid, _new_quantity numeric, _note text)",
  "admin_delete_ai_provider(p_id uuid)",
  "admin_gamification_overview()",
  "admin_upsert_ai_provider(p_id uuid, p_name text, p_label text, p_kind text, p_base_url text, p_is_active boolean, p_priority integer, p_chat_model text, p_embed_model text, p_vision_model text, p_capabilities text[], p_api_key text, p_notes text)",
  "api_dynamic_table_query_rows(p_table_slug text, p_filters jsonb, p_limit integer, p_offset integer)",
  "api_dynamic_table_update_cell(p_table_slug text, p_row_id uuid, p_column_key text, p_value text)",
  "approve_currency_fetch(p_fetch_id uuid, p_deactivate_previous boolean)",
  "approve_pending_user(_user_id uuid, _role app_role, _position text)",
  "archive_platform_release(p_id uuid)",
  "asan_assign_document_number(_doc_type text, _source_id uuid)",
  "asan_assign_document_numbers(_doc_type text, _ids uuid[])",
  "asan_classify_person_batch(p_batch_id uuid)",
  "asan_classify_product_batch(p_batch_id uuid)",
  "asan_commit_person_batch(p_batch_id uuid)",
  "asan_commit_product_batch(p_batch_id uuid)",
  "asan_fold_chars(p text)",
  "asan_list_purchase_export(_from date, _to date)",
  "asan_list_sales_export(_from date, _to date)",
  "asan_normalize_code(p text)",
  "asan_normalize_name(p text)",
  "assert_person_fk_registry()",
  "calc_xp_for_level(_level integer)",
  "calculate_customer_realtime_credit(p_customer_id uuid)",
  "calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date)",
  "calculate_salesperson_collected_sales(p_employee_id uuid, p_window_months integer)",
  "claim_next_quote_send_queue_item()",
  "complete_quote_send_queue_item(p_queue_id uuid, p_success boolean, p_error text)",
  "compute_daily_capital(p_capital_date date)",
  "create_bot_api_key(p_name text, p_expires_at timestamp with time zone)",
  "create_custom_role(_name text, _display_name text, _description text)",
  "create_delivery_receipt(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_invoice_id uuid, p_customer_id uuid, p_notes text)",
  "create_document(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_reference_id uuid, p_reference_type text, p_notes text)",
  "create_dynamic_table_row(p_table_id uuid, p_values jsonb)",
  "create_manual_penalty(p_user_id uuid, p_type text, p_severity text, p_description text)",
  "create_sales_quote_with_items(p_customer_name text, p_customer_phone text, p_customer_note text, p_expires_at timestamp with time zone, p_subtotal_amount numeric, p_discount_amount numeric, p_final_amount numeric, p_items jsonb, p_settlement_type_id uuid, p_customer_id uuid, p_below_list_ack boolean, p_deposit_amount numeric, p_commitment_confirmed boolean, p_visitor_id uuid, p_warehouse_id uuid, p_quote_exception_type text, p_quote_exception_minutes integer, p_quote_exception_amount numeric, p_quote_exception_text text)",
  "customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text)",
  "deactivate_user(_user_id uuid)",
  "default_warehouse_id()",
  "delete_bot_api_key_table_access(p_key_id uuid, p_table_id uuid)",
  "dyn_table_role_can_view(_user_id uuid, _access_level text)",
  "export_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer)",
  "finish_market_rate_ingestion_run(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text)",
  "gamification_analytics_achievements(p_from timestamp with time zone, p_to timestamp with time zone)",
  "gamification_analytics_active_season()",
  "gamification_analytics_employees()",
  "gamification_analytics_kpi_effectiveness(p_from timestamp with time zone, p_to timestamp with time zone)",
  "gamification_analytics_league_distribution()",
  "gamification_analytics_missions(p_from timestamp with time zone, p_to timestamp with time zone)",
  "gamification_analytics_risk(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer)",
  "gamification_analytics_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text)",
  "gamification_analytics_top_employees(p_from timestamp with time zone, p_to timestamp with time zone, p_event_type text, p_limit integer)",
  "gamification_analytics_trend(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid, p_event_type text)",
  "gamification_assert_manager()",
  "generate_birthday_notifications()",
  "generate_sale_price_type_code()",
  "get_account_balances(p_account_type text, p_include_inactive boolean)",
  "get_account_ledger(p_account_id uuid, p_from_date date, p_to_date date)",
  "get_delivery_receipts(p_type text, p_status text, p_invoice_id uuid, p_limit integer, p_offset integer)",
  "get_documents(p_type text, p_status text, p_limit integer, p_offset integer)",
  "get_employee_progress(_employee_id uuid)",
  "get_kpi_xp(p_event_key text, p_default numeric)",
  "get_my_rejected_quotes(p_limit integer)",
  "get_payable_detail(p_supplier_id uuid, p_purchase_id uuid)",
  "get_payables_list(p_from_date date, p_to_date date, p_supplier_id uuid, p_due_filter text, p_search text, p_limit integer, p_offset integer, p_include_paid boolean)",
  "get_payables_summary(p_from_date date, p_to_date date, p_supplier_id uuid)",
  "get_receivables_summary(p_from_date date, p_to_date date, p_customer_id uuid)",
  "get_sales_search_products(p_search text, p_brand_ids uuid[], p_category_ids uuid[], p_label_ids uuid[], p_stock_status text, p_product_type text, p_only_with_price boolean, p_limit integer, p_offset integer)",
  "is_user_online(_user_id uuid)",
  "is_valid_audit_entity_type(_entity_type text)",
  "jalali_year(_d date)",
  "league_tier_from_index(_idx integer)",
  "league_tier_index(_tier league_tier)",
  "list_market_rate_ticks_public(p_indicator_id uuid, p_limit integer)",
  "list_mutual_settlement_candidates()",
  "log_invoice_issuance_blocked_overdue(p_customer_id uuid, p_overdue_amount numeric, p_overdue_count integer, p_oldest_due_date date, p_invoice_type text, p_commitment_confirmed boolean)",
  "manual_score_decay_factor(_months_elapsed integer, _effect_months integer)",
  "manual_score_months_elapsed(_from timestamp with time zone, _to timestamp with time zone)",
  "mark_all_notifications_read()",
  "mark_notification_read(p_notification_id uuid)",
  "mi_get_demand_growth(p_days integer)",
  "mi_get_emerging_products(p_days integer, p_limit integer)",
  "mi_get_hot_brands(p_days integer, p_limit integer)",
  "mi_get_hot_categories(p_days integer, p_limit integer)",
  "mi_get_market_index(p_days integer)",
  "mi_get_price_movers(p_days integer, p_direction text, p_sale_price_type_id uuid, p_limit integer)",
  "mi_get_seller_favorite_products(p_days integer, p_limit integer)",
  "mi_get_seller_top_products(p_days integer, p_limit integer)",
  "mi_get_top_checked_today(p_limit integer)",
  "mi_get_trending_products(p_days integer, p_limit integer)",
  "normalize_fa_text(input text)",
  "normalize_identifier(_kind text, _raw text, _strict boolean)",
  "normalize_phone_local(_raw text)",
  "pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date, _document_channel text, _amount numeric, _tracking_number text, _cheque_number text, _cheque_due_date date, _description text, _payee_party_id uuid, _payee_accounting_code text)",
  "person_settlement_position(_person_id uuid)",
  "post_mutual_settlement(_person_id uuid, _offset_amount numeric, _cash_amount numeric, _bank_account_id uuid, _note text, _entry_date date)",
  "post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)",
  "preview_league_season_changes(_season_id uuid)",
  "product_video_advance(_chain_id uuid, _to_stage text, _note text)",
  "product_video_mark_uploaded(_chain_id uuid, _storage_path text, _file_name text, _file_size bigint, _mime_type text)",
  "publish_platform_release(p_id uuid)",
  "query_dynamic_table_rows(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer)",
  "query_dynamic_table_rows_v2(p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer, p_offset integer)",
  "quick_approve_user(_user_id uuid, _role text)",
  "reactivate_user(_user_id uuid)",
  "recompute_customer_credit_scores(p_limit integer, p_offset integer)",
  "record_currency_fetch(p_source_id uuid, p_currency currency_code, p_rate numeric, p_note text)",
  "record_external_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone, p_raw_payload jsonb, p_unit text)",
  "record_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_status text, p_note text, p_unit text)",
  "reject_currency_fetch(p_fetch_id uuid, p_reason text)",
  "reject_pending_user(_user_id uuid, _notes text)",
  "release_stale_quote_send_locks()",
  "reorder_dynamic_table_columns(p_table_id uuid, p_ordered_ids uuid[])",
  "requeue_failed_quote_send_item(p_queue_id uuid)",
  "review_delivery_receipt(p_receipt_id uuid, p_decision text, p_note text)",
  "review_document(p_document_id uuid, p_decision text, p_note text)",
  "review_market_product_match_approve(p_match_id uuid, p_afrakala_product_id uuid, p_notes text)",
  "review_market_product_match_disable(p_match_id uuid, p_reason text, p_notes text)",
  "review_market_product_match_reject(p_match_id uuid, p_reject_reason text, p_notes text)",
  "run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text)",
  "search_product_ids(p_term text, p_limit integer)",
  "search_tokens_match(p_document text, p_term text)",
  "set_bot_api_key_active(p_key_id uuid, p_is_active boolean)",
  "set_bot_api_key_table_access(p_key_id uuid, p_table_id uuid, p_can_read boolean, p_can_update boolean, p_allowed_update_columns uuid[])",
  "set_dynamic_table_row_active(p_row_id uuid, p_is_active boolean)",
  "set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text)",
  "set_profile_field_value(_user_id uuid, _field_name text, _value jsonb)",
  "start_league_season(_name text, _start date, _end date)",
  "start_market_rate_ingestion_run(p_source_code text)",
  "submit_quiz_attempt(_quiz_id uuid, _answers jsonb)",
  "tg_person_fk_registry_gate()",
  "toggle_custom_role_status(_role_id uuid, _is_active boolean)",
  "update_dynamic_table_cell(p_row_id uuid, p_column_id uuid, p_value text)",
  "update_dynamic_table_column(p_column_id uuid, p_label text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean)",
  "update_market_rate_source_mapping(p_mapping_id uuid, p_source_symbol text, p_normalize_multiplier numeric, p_is_enabled boolean, p_note text)",
  "update_role_permissions(_role_name text, _permissions jsonb)",
  "update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text)",
  "update_workflow_setting(p_process_key text, p_uploader_role text, p_reviewer_role text, p_timer_minutes integer, p_penalty_enabled boolean, p_penalty_for text, p_is_active boolean)",
  "validate_price_settlement_compatibility(p_sale_price_type_id uuid, p_settlement_type_id uuid)",
];

/**
 * The 17 deliberate exclusions. These MUST remain anon-executable. Each is referenced by an RLS
 * policy on a table `anon` can touch, or called by a view `anon` can SELECT, or used in a CHECK
 * constraint / DEFAULT on an anon-writable table.
 */
const MUST_STAY_OPEN = [
  "dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)",
  "has_any_role(_user_id uuid, _roles app_role[])",
  "has_any_role(_user_id uuid, _roles text[])",
  "has_role(_user_id uuid, _role app_role)",
  "has_role(_user_id uuid, _role text)",
  "is_appellant_of_appeal(_appeal_id uuid, _user uuid)",
  "is_board_approved(_user_id uuid, _board_key text)",
  "is_board_manager(_user_id uuid)",
  "is_hr_manager(_user_id uuid)",
  "is_product_owner(_user_id uuid, _product_id uuid)",
  "is_reviewer_of_appeal(_appeal_id uuid, _user uuid)",
  "is_viewer_only(_user_id uuid)",
  "kd_role_can_view(_uid uuid, _access_level text)",
  "messenger_attachment_path_owner(_name text)",
  "messenger_attachment_size_ok(_name text, _size bigint)",
  "normalize_fa(input text)",
  "tehran_today()",
];

const SIG = `p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'`;

function list(xs: string[]): string {
  return xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
}

/** Signatures from `xs` for which `role` currently holds EXECUTE. */
function canExecute(role: string, xs: string[]): string[] {
  return dbRows(`
    select ${SIG}
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where ${SIG} in (${list(xs)})
       and has_function_privilege('${role}', p.oid, 'EXECUTE')
     order by 1
  `);
}

/** Signatures from `xs` for which `role` does NOT hold EXECUTE. */
function cannotExecute(role: string, xs: string[]): string[] {
  return dbRows(`
    select ${SIG}
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where ${SIG} in (${list(xs)})
       and not has_function_privilege('${role}', p.oid, 'EXECUTE')
     order by 1
  `);
}

test("the target list still resolves to real functions", () => {
  // Without this, a rename or a signature change would empty the set and every assertion below
  // would pass by measuring nothing.
  const found = dbRows(`
    select ${SIG}
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where ${SIG} in (${list(TARGETS)})
  `);
  expect(
    found.length,
    `${TARGETS.length - found.length} of the 476 targets no longer exist under that signature`,
  ).toBe(TARGETS.length);
});

test("⛔ anon executes NONE of the functions 476 closed", () => {
  const stillOpen = canExecute("anon", TARGETS);
  expect(
    stillOpen,
    `anon can still EXECUTE these, so the pre-393 default-privilege grant is back: ${stillOpen.join(", ")}. ` +
      "Check for a CREATE OR REPLACE that restored the ACL, or a GRANT added by a later migration.",
  ).toEqual([]);
});

test("authenticated still executes ALL of them — the revoke cut only the anonymous path", () => {
  const lost = cannotExecute("authenticated", TARGETS);
  expect(
    lost,
    `authenticated lost EXECUTE on these, so 476 cut more than the anonymous path: ${lost.join(", ")}`,
  ).toEqual([]);
});

test("service_role still executes ALL of them", () => {
  const lost = cannotExecute("service_role", TARGETS);
  expect(
    lost,
    `service_role lost EXECUTE on these, which breaks every server-side caller: ${lost.join(", ")}`,
  ).toEqual([]);
});

test("⛔ the 17 deliberate exclusions stay reachable by anon", () => {
  // The direction nobody checks. `dyn_table_role_can_view` is the reason the identity arguments
  // are carried rather than bare names: 476 revoked the two-argument overload, which no policy
  // references, and left the three-argument overload that policies do reference. A gate written
  // against bare names could not tell those two apart and would report the wrong one either way.
  const closed = cannotExecute("anon", MUST_STAY_OPEN);
  expect(
    closed,
    `these are referenced by RLS policies on anon-accessible tables, views anon can read, or ` +
      `constraints on anon-writable tables — closing them makes the POLICY raise 42501 and takes ` +
      `the public sale-list page and product feed down: ${closed.join(", ")}. ` +
      "Do not 'finish the sweep' by revoking these.",
  ).toEqual([]);
});

test("no NEW function in public is born anon-executable", () => {
  // 476 cleaned up what 393 could not reach backwards. This asserts 393 itself still holds, so
  // the backlog cannot silently refill. Extension-owned functions are excluded: CREATE EXTENSION
  // re-issues their grants and they are not ours to revoke.
  const born = dbRows(`
    select ${SIG}
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid
                          and d.classid = 'pg_proc'::regclass
                          and d.deptype = 'e')
       and p.prorettype <> 'trigger'::regtype
       and ${SIG} not in (${list(MUST_STAY_OPEN)})
     order by 1
  `);
  expect(
    born,
    `these non-extension, non-trigger public functions are anon-executable and are not one of ` +
      `the 17 documented exclusions: ${born.join(", ")}. ` +
      "Either the pg_default_acl FUNCTIONS grant to anon came back (see migration 393), or a " +
      "migration issued an explicit GRANT ... TO anon. Add a REVOKE, or add the function to " +
      "MUST_STAY_OPEN with the policy/view/constraint row that requires it.",
  ).toEqual([]);
});
