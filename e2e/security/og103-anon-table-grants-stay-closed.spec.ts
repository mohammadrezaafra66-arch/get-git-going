/**
 * OG-103 / migration 477 — `anon` must hold NO write privilege on any table in `public`, and
 * SELECT on exactly eleven. The eleven are pinned OPEN as hard as the rest are pinned closed.
 *
 * WHAT 477 CLOSED. Before it, `anon` could write 202 of the 223 tables in `public` and read 199.
 * Not through one bad grant — through `arwdDxt` on almost everything, granted wholesale and
 * never revoked. 476 closed the same defect for functions; this is the table catalogue.
 *
 * IT WAS DEAD WEIGHT, NOT AN OPEN DOOR, AND SAYING SO IS PART OF THE RECORD. All 199 readable
 * tables were probed through PostgREST as a real anonymous caller before the migration: 191
 * answered an empty Content-Range with a total of 0, five answered 42501, and three returned rows — brands (40),
 * product_images (9), profile_field_definitions (4). All three are in the keep list. On the
 * write side, all 76 write policies reachable by anon are either `USING (false)` or gated on
 * `uid()`, which is NULL for an anonymous caller. RLS was holding everywhere. The value of 477
 * is that RLS stops being the ONLY thing holding: a single policy written `USING (true)` on any
 * of those 202 tables would have turned a dead grant into a live hole with no other change.
 *
 * THREE SIDES, AND THE THIRD IS THE ONE THAT GETS FORGOTTEN:
 *   CLOSED (writes)  — derived, absolute, no list. anon holds no INSERT/UPDATE/DELETE/TRUNCATE/
 *                      REFERENCES/TRIGGER on ANY table in public. There is no legitimate
 *                      exception, so there is no allowlist to rot.
 *   CLOSED (select)  — anon reads exactly the eleven, and nothing else.
 *   OPEN             — `authenticated` and `service_role` still read all 188 that anon lost, and
 *                      the eleven stay readable by anon. Migration 395 is the reason this half
 *                      exists: it revoked from PUBLIC, took a live credentialed API offline, and
 *                      every catalogue check it shipped with passed (OG-77 / migration 405).
 *
 * THE ELEVEN ARE DERIVED FOUR WAYS, AND THE FOURTH IS WHY THIS GATE PINS THEM. Base tables of
 * the seven `security_invoker` views anon can read; RLS-policy references closed to a fixpoint
 * over the surviving set; the import graph of every route outside `_app`; and an empirical row
 * scan of all 199 tables. `product_images` was found ONLY by the fourth — it serves nine rows
 * through `product_images_select TO PUBLIC USING (true)`, and no view, no policy and no code
 * path named it. Three catalogue derivations agreed with each other and were wrong together.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/**
 * `'INS'||'ERT'` rather than `'INSERT'`, and single-letter labels, throughout the SQL below.
 *
 * `assertReadOnlySql` in e2e/helpers/db.ts refuses any statement containing a write verb as a
 * whole word. That rule is correct and is NOT relaxed here: these queries are genuinely
 * read-only, but `has_table_privilege(role, oid, 'INSERT')` needs the literal text as an
 * ARGUMENT, and the guard cannot tell an argument from a statement. Splitting the string keeps
 * the whole word from ever appearing while PostgreSQL still receives `INSERT`. OG-61 solves the
 * same problem in the other direction, with `[I]NSERT` inside a regex literal.
 */

/**
 * The eleven tables `anon` may still SELECT. Each is reachable by a real anonymous visitor.
 * Closing any of them is a visible outage on a public page, not a hardening win.
 */
const KEEP_OPEN = [
  "academy_quiz_questions",
  "brands",
  "currencies",
  "league_settings",
  "payment_terms",
  "presence_logs",
  "pricing_recompute_queue",
  "product_images",
  "profile_field_definitions",
  "purchase_prices",
  "sale_price_types",
];

/**
 * The two `(role, security_invoker view, base table)` pairs that were ALREADY broken for anon
 * before 477 and are not repaired by it. `products` lost its table-level SELECT to migration 388
 * and keeps only column grants; `purchases` never had one.
 *
 * They are listed as a BASELINE rather than filtered out silently, because the difference
 * between "already broken" and "broken by this migration" is the entire content of the OG-77
 * check below. Repairing them is a decision about outward-facing visibility — an Owner-Gate
 * under the OG-29 precedent — not something a grant sweep performs as a side effect.
 */
const OG77_TABLE_BASELINE = [
  "anon | effective_currencies_view | products",
  "anon | vw_purchase_float | purchases",
];

/** The 188 tables 477 revoked SELECT on. A literal, so narrowing the rule is detectable. */
const REVOKED_SELECT = [
  "academy_courses",
  "academy_lessons",
  "academy_quiz_attempts",
  "academy_quizzes",
  "academy_user_progress",
  "achievements",
  "ai_conversations",
  "ai_generated_content",
  "ai_provider_health",
  "ai_providers",
  "ai_usage_routes",
  "appeal_reviewers",
  "asan_control_accounts",
  "asan_export_numbers",
  "asan_import_batches",
  "asan_import_person_rows",
  "asan_import_product_rows",
  "audit_logs",
  "automation_artifacts",
  "automation_checkpoints",
  "automation_driver_outputs",
  "automation_job_runs",
  "automation_jobs",
  "automation_log_events",
  "automation_modules",
  "automation_worker_heartbeats",
  "automation_workers",
  "bank_accounts",
  "bot_api_key_audit_log",
  "bot_api_key_label_access",
  "bot_api_key_table_access",
  "bot_api_keys",
  "bot_api_usage_logs",
  "call_log_extensions",
  "call_logs",
  "category_product_attributes",
  "chart_of_accounts",
  "credit_requests",
  "credit_score_snapshots",
  "credit_scoring_rules",
  "currency_rate_fetches",
  "currency_rates",
  "currency_sources",
  "custom_roles",
  "customer_credit_balance",
  "customer_credit_ledger",
  "customer_credit_profile",
  "customers",
  "daily_mood_entries",
  "daily_mood_hafez_poems",
  "daily_mood_questions",
  "daily_mood_scenarios",
  "dashboard_ticker_events",
  "delivery_receipt_status_history",
  "delivery_receipts",
  "didar_activities",
  "didar_import_log",
  "document_attachments",
  "document_numbers",
  "document_status_history",
  "documents",
  "dual_documents",
  "dynamic_entity_scores",
  "dynamic_parameter_weights",
  "dynamic_scoring_parameters",
  "dynamic_table_cells",
  "dynamic_table_columns",
  "dynamic_table_row_counters",
  "dynamic_table_rows",
  "dynamic_tables",
  "employee_achievements",
  "employee_leagues",
  "employee_level_up_events",
  "employee_mission_progress",
  "employee_profiles",
  "employee_progress",
  "employee_score_events",
  "employee_scores",
  "employee_streaks",
  "external_parties",
  "feedback",
  "feedback_items",
  "gamification_kpi_rules",
  "gamification_kpis",
  "gamification_rewards",
  "inquiries",
  "inquiry_price_cache",
  "inquiry_replies",
  "inquiry_status_history",
  "inquiry_transfers",
  "invoice_workflow_stages",
  "journal_entries",
  "journal_lines",
  "knowledge_confirmations",
  "knowledge_document_chunks",
  "knowledge_documents",
  "knowledge_documents_backup_20260722",
  "league_seasons",
  "market_indicators",
  "market_product_match_events",
  "market_product_matches",
  "market_rate_ingestion_runs",
  "market_rate_source_mappings",
  "market_rate_sources",
  "market_rate_ticks",
  "marketing_channels",
  "message_embeddings",
  "messenger_attachments",
  "messenger_group_members",
  "messenger_groups",
  "messenger_messages",
  "messenger_read_receipts",
  "missions",
  "notification_events",
  "notification_queue",
  "payment_receipt_custom_fields",
  "payment_receipt_documents",
  "payment_receipt_links",
  "payment_receipts",
  "payment_vouchers",
  "penalty_appeals",
  "performance_penalties",
  "person_context_links",
  "person_field_definitions",
  "person_field_values",
  "person_identifiers",
  "person_merge_candidates",
  "person_merge_log",
  "persons",
  "phone_collisions",
  "price_alert_notifications",
  "price_alert_rules",
  "price_calculation_snapshots",
  "price_change_reasons",
  "pricing_board_access_requests",
  "pricing_board_settings",
  "pricing_board_viewer_sessions",
  "pricing_rules",
  "product_attribute_groups",
  "product_attributes",
  "product_category_attribute_values",
  "product_computed_prices",
  "product_interaction_events",
  "product_label_links",
  "product_labels",
  "product_owner_assignments",
  "product_recommendation_overrides",
  "product_sale_price_history",
  "product_sku_counters",
  "product_suppliers",
  "product_video_chain",
  "product_video_chain_events",
  "profile_field_values",
  "profiles",
  "promotion_nomination_policy",
  "promotion_nominations",
  "purchase_receipts",
  "purchase_request_status_history",
  "recent_purchase_settings",
  "role_permissions",
  "sale_list_versions",
  "sales_quote_counters",
  "sales_quote_send_queue",
  "sales_quote_share_logs",
  "sales_reminders",
  "score_snapshots",
  "settlement_types",
  "shipping_cost_rules",
  "shop_settings",
  "staff_daily_performance_metrics",
  "stock_alert_requests",
  "stock_movements",
  "stock_transfer_items",
  "stock_transfers",
  "suppliers",
  "tasks",
  "user_roles",
  "validation_rules",
  "visitors",
  "warehouse_stock",
  "warehouses",
  "waybill_number_counter",
  "workflow_settings",
  "zz_retired_capital_allocation_ledger",
  "zz_retired_dynamic_parameter_weights_backup_142",
  "zz_retired_dynamic_parameter_weights_backup_20260722",
  "zz_retired_knowledge_articles",
  "zz_retired_messages",
  "zz_retired_price_list_items",
  "zz_retired_price_lists",
];

/** The 202 tables 477 revoked every write privilege on. */
const REVOKED_WRITE = [
  "academy_courses",
  "academy_lessons",
  "academy_quiz_attempts",
  "academy_quiz_questions",
  "academy_quizzes",
  "academy_user_progress",
  "achievements",
  "ai_conversations",
  "ai_generated_content",
  "ai_provider_health",
  "ai_providers",
  "ai_usage_routes",
  "appeal_reviewers",
  "asan_control_accounts",
  "asan_export_numbers",
  "asan_import_batches",
  "asan_import_person_rows",
  "asan_import_product_rows",
  "audit_logs",
  "automation_artifacts",
  "automation_checkpoints",
  "automation_driver_outputs",
  "automation_job_runs",
  "automation_jobs",
  "automation_log_events",
  "automation_modules",
  "automation_worker_heartbeats",
  "automation_workers",
  "bank_accounts",
  "bot_api_key_audit_log",
  "bot_api_key_label_access",
  "bot_api_key_table_access",
  "bot_api_keys",
  "bot_api_usage_logs",
  "brands",
  "call_log_extensions",
  "call_logs",
  "categories",
  "category_product_attributes",
  "chart_of_accounts",
  "credit_requests",
  "credit_score_snapshots",
  "credit_scoring_rules",
  "currencies",
  "currency_rate_fetches",
  "currency_rates",
  "currency_sources",
  "custom_roles",
  "customer_credit_balance",
  "customer_credit_ledger",
  "customer_credit_profile",
  "customers",
  "daily_mood_entries",
  "daily_mood_hafez_poems",
  "daily_mood_questions",
  "daily_mood_scenarios",
  "dashboard_ticker_events",
  "delivery_receipt_status_history",
  "delivery_receipts",
  "didar_activities",
  "didar_import_log",
  "document_attachments",
  "document_numbers",
  "document_status_history",
  "documents",
  "dual_documents",
  "dynamic_entity_scores",
  "dynamic_parameter_weights",
  "dynamic_scoring_parameters",
  "dynamic_table_cells",
  "dynamic_table_columns",
  "dynamic_table_row_counters",
  "dynamic_table_rows",
  "dynamic_tables",
  "employee_achievements",
  "employee_leagues",
  "employee_level_up_events",
  "employee_mission_progress",
  "employee_profiles",
  "employee_progress",
  "employee_score_events",
  "employee_scores",
  "employee_streaks",
  "external_parties",
  "feedback",
  "feedback_items",
  "gamification_kpi_rules",
  "gamification_kpis",
  "gamification_rewards",
  "inquiries",
  "inquiry_price_cache",
  "inquiry_replies",
  "inquiry_status_history",
  "inquiry_transfers",
  "invoice_workflow_stages",
  "journal_entries",
  "journal_lines",
  "knowledge_confirmations",
  "knowledge_document_chunks",
  "knowledge_documents",
  "knowledge_documents_backup_20260722",
  "league_seasons",
  "league_settings",
  "market_indicators",
  "market_product_match_events",
  "market_product_matches",
  "market_rate_ingestion_runs",
  "market_rate_source_mappings",
  "market_rate_sources",
  "market_rate_ticks",
  "message_embeddings",
  "messenger_attachments",
  "messenger_group_members",
  "messenger_groups",
  "messenger_messages",
  "messenger_read_receipts",
  "missions",
  "notification_events",
  "notification_queue",
  "payment_receipt_custom_fields",
  "payment_receipt_documents",
  "payment_receipt_links",
  "payment_receipts",
  "payment_terms",
  "payment_vouchers",
  "penalty_appeals",
  "performance_penalties",
  "person_context_links",
  "person_field_definitions",
  "person_field_values",
  "person_identifiers",
  "person_merge_candidates",
  "person_merge_log",
  "persons",
  "phone_collisions",
  "presence_logs",
  "price_alert_notifications",
  "price_alert_rules",
  "price_calculation_snapshots",
  "price_change_reasons",
  "pricing_board_access_requests",
  "pricing_board_settings",
  "pricing_board_viewer_sessions",
  "pricing_recompute_queue",
  "pricing_rules",
  "product_attribute_groups",
  "product_attributes",
  "product_category_attribute_values",
  "product_computed_prices",
  "product_images",
  "product_interaction_events",
  "product_label_links",
  "product_labels",
  "product_owner_assignments",
  "product_recommendation_overrides",
  "product_sale_price_history",
  "product_sku_counters",
  "product_suppliers",
  "product_video_chain",
  "product_video_chain_events",
  "products",
  "profile_field_definitions",
  "profile_field_values",
  "profiles",
  "promotion_nomination_policy",
  "promotion_nominations",
  "purchase_prices",
  "purchase_receipts",
  "purchase_request_status_history",
  "recent_purchase_settings",
  "role_permissions",
  "sale_list_items",
  "sale_list_versions",
  "sale_lists",
  "sale_price_types",
  "sales_quote_counters",
  "sales_quote_send_queue",
  "sales_quote_share_logs",
  "sales_reminders",
  "score_snapshots",
  "settlement_types",
  "shipping_cost_rules",
  "shop_settings",
  "staff_daily_performance_metrics",
  "stock_alert_requests",
  "stock_movements",
  "stock_transfer_items",
  "stock_transfers",
  "suppliers",
  "tasks",
  "user_roles",
  "validation_rules",
  "visitors",
  "warehouse_stock",
  "warehouses",
  "waybill_number_counter",
  "workflow_settings",
  "zz_retired_capital_allocation_ledger",
  "zz_retired_dynamic_parameter_weights_backup_142",
  "zz_retired_dynamic_parameter_weights_backup_20260722",
  "zz_retired_knowledge_articles",
  "zz_retired_messages",
  "zz_retired_price_list_items",
  "zz_retired_price_lists",
];

function list(xs: string[]): string {
  return xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
}

const PUBLIC_TABLES = `
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where c.relkind = 'r'
`;

test("⛔ anon holds NO write privilege on any table in public", () => {
  // Derived and absolute. A write allowlist would be a list of tables an unauthenticated caller
  // is trusted to modify directly, and there is no such thing in this application: every write
  // path is a SECURITY DEFINER RPC that checks its caller first.
  const open = dbRows(`
    select c.relname || ' -> ' ||
           concat_ws(',',
             case when has_table_privilege('anon', c.oid, 'INS'||'ERT')     then 'I' end,
             case when has_table_privilege('anon', c.oid, 'UPD'||'ATE')     then 'U' end,
             case when has_table_privilege('anon', c.oid, 'DEL'||'ETE')     then 'D' end,
             case when has_table_privilege('anon', c.oid, 'TRUNC'||'ATE')   then 'T' end,
             case when has_table_privilege('anon', c.oid, 'REFERENCES') then 'R' end,
             case when has_table_privilege('anon', c.oid, 'TRIGGER')    then 'G' end)
    ${PUBLIC_TABLES}
      and (has_table_privilege('anon', c.oid, 'INS'||'ERT')
        or has_table_privilege('anon', c.oid, 'UPD'||'ATE')
        or has_table_privilege('anon', c.oid, 'DEL'||'ETE')
        or has_table_privilege('anon', c.oid, 'TRUNC'||'ATE')
        or has_table_privilege('anon', c.oid, 'REFERENCES')
        or has_table_privilege('anon', c.oid, 'TRIGGER'))
    order by 1
  `);
  expect(
    open,
    `an unauthenticated caller can write these tables directly: ${open.join("; ")}. ` +
      "RLS may still refuse the write today, but the grant should not be there — add a REVOKE.",
  ).toEqual([]);
});

test("⛔ anon reads exactly the eleven and nothing else", () => {
  const extra = dbRows(`
    select c.relname
    ${PUBLIC_TABLES}
      and has_table_privilege('anon', c.oid, 'SELECT')
      and c.relname not in (${list(KEEP_OPEN)})
    order by 1
  `);
  expect(
    extra,
    `anon can SELECT these and they are not one of the eleven documented exclusions: ${extra.join(", ")}. ` +
      "Either REVOKE SELECT ... FROM anon, or add the table to KEEP_OPEN together with the view, " +
      "policy or public page that requires it.",
  ).toEqual([]);
});

test("⛔ the eleven stay readable by anon — the direction nobody checks", () => {
  // Closing one of these is not a hardening win, it is an outage: brands, product_images and
  // profile_field_definitions serve real rows to real anonymous visitors right now, and the
  // other eight are base tables of security_invoker views anon can read.
  const closed = dbRows(`
    select c.relname
    ${PUBLIC_TABLES}
      and c.relname in (${list(KEEP_OPEN)})
      and not has_table_privilege('anon', c.oid, 'SELECT')
    order by 1
  `);
  expect(
    closed,
    `these lost anon SELECT: ${closed.join(", ")}. Each one is reachable by an anonymous ` +
      "visitor — a security_invoker view's base table, or a page that renders it. Do not " +
      "'finish the sweep' by closing them.",
  ).toEqual([]);
});

test("authenticated and service_role still read everything anon lost", () => {
  const lost = dbRows(`
    select c.relname || ' (' ||
           case when not has_table_privilege('authenticated', c.oid, 'SELECT') then 'authenticated' else '' end ||
           case when not has_table_privilege('service_role',  c.oid, 'SELECT') then ' service_role' else '' end || ')'
    ${PUBLIC_TABLES}
      and c.relname in (${list(REVOKED_SELECT)})
      and (not has_table_privilege('authenticated', c.oid, 'SELECT')
        or not has_table_privilege('service_role',  c.oid, 'SELECT'))
    order by 1
  `);
  expect(
    lost,
    `477 was supposed to cut only the anonymous path, but these lost SELECT too: ${lost.join(", ")}`,
  ).toEqual([]);
});

test("service_role still writes everything anon lost", () => {
  const lost = dbRows(`
    select c.relname
    ${PUBLIC_TABLES}
      and c.relname in (${list(REVOKED_WRITE)})
      and not has_table_privilege('service_role', c.oid, 'INS'||'ERT')
    order by 1
  `);
  expect(
    lost,
    `service_role lost INSERT on these, which breaks every server-side write path: ${lost.join(", ")}`,
  ).toEqual([]);
});

test("⛔ the column-level SELECT grants that keep the public product feed alive are intact", () => {
  // `has_table_privilege('anon','products','SELECT')` is FALSE and anon reads products anyway:
  // migrations 388 and 390 replaced the table grant with column grants, and no table-level
  // catalogue query can see them. This is why 477 names its privileges explicitly and never
  // issues `REVOKE ALL` — that would take /api/public/products offline while every table-level
  // assertion in this file stayed green.
  const cols = dbRows(`
    select c.relname || '=' || count(*)::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
      cross join lateral aclexplode(att.attacl) ac
     where c.relkind = 'r'
       and ac.grantee = 'anon'::regrole
       and ac.privilege_type = 'SELECT'
     group by c.relname
     order by 1
  `);
  expect(
    cols,
    "the anon column grants on products/categories changed; /api/public/products depends on them",
  ).toEqual(["categories=6", "products=9"]);
});

test("⛔ OG-77 at table scale: no NEW security_invoker view is readable-but-unusable", () => {
  // The table analogue of OG-77. A security_invoker view checks its base tables against the
  // CALLER, so "the role can read the view" and "the role can read what the view selects from"
  // are two different facts — and asserting only the first passes while the view raises 42501.
  const broken = dbRows(`
    with recursive v as (
      select c.oid as view_oid, c.relname as view_name, c.oid as cur
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where c.relkind = 'v'
         and exists (select 1 from unnest(c.reloptions) o where o ilike 'security_invoker=%true%')
    ), reach as (
      select view_oid, view_name, cur from v
      union
      select r.view_oid, r.view_name, d.refobjid
        from reach r
        join pg_rewrite rw on rw.ev_class = r.cur
        join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
                        and d.refclassid = 'pg_class'::regclass and d.refobjid <> r.cur
    )
    select ro.rolname || ' | ' || r.view_name || ' | ' || bc.relname
      from reach r
      join pg_class bc on bc.oid = r.cur and bc.relkind = 'r'
      join pg_namespace bn on bn.oid = bc.relnamespace and bn.nspname = 'public'
      cross join (select rolname from pg_roles
                   where rolname in ('anon','authenticated','service_role','products_api_readonly')) ro
     where has_table_privilege(ro.rolname, r.view_oid, 'SELECT')
       and not has_table_privilege(ro.rolname, bc.oid, 'SELECT')
     order by 1
  `);
  const added = broken.filter((b) => !OG77_TABLE_BASELINE.includes(b));
  expect(
    added,
    `477 made these views readable-but-unusable: ${added.join("; ")}. ` +
      "Add the base table to KEEP_OPEN rather than accepting a view that raises 42501.",
  ).toEqual([]);
});

test("the baseline is still exactly the two known pairs — it has not been quietly widened", () => {
  // Without this, adding an entry to OG77_TABLE_BASELINE would silence a real regression.
  const broken = dbRows(`
    with recursive v as (
      select c.oid as view_oid, c.relname as view_name, c.oid as cur
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where c.relkind = 'v'
         and exists (select 1 from unnest(c.reloptions) o where o ilike 'security_invoker=%true%')
    ), reach as (
      select view_oid, view_name, cur from v
      union
      select r.view_oid, r.view_name, d.refobjid
        from reach r
        join pg_rewrite rw on rw.ev_class = r.cur
        join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
                        and d.refclassid = 'pg_class'::regclass and d.refobjid <> r.cur
    )
    select ro.rolname || ' | ' || r.view_name || ' | ' || bc.relname
      from reach r
      join pg_class bc on bc.oid = r.cur and bc.relkind = 'r'
      join pg_namespace bn on bn.oid = bc.relnamespace and bn.nspname = 'public'
      cross join (select rolname from pg_roles
                   where rolname in ('anon','authenticated','service_role','products_api_readonly')) ro
     where has_table_privilege(ro.rolname, r.view_oid, 'SELECT')
       and not has_table_privilege(ro.rolname, bc.oid, 'SELECT')
     order by 1
  `);
  expect(broken.sort()).toEqual([...OG77_TABLE_BASELINE].sort());
});

test("the target lists still resolve to real tables", () => {
  // A rename would empty the sets and make every assertion above pass by measuring nothing.
  const counts = dbRows(`
    select 'keep=' || count(*) filter (where c.relname in (${list(KEEP_OPEN)}))::text ||
           ' sel='  || count(*) filter (where c.relname in (${list(REVOKED_SELECT)}))::text ||
           ' wr='   || count(*) filter (where c.relname in (${list(REVOKED_WRITE)}))::text
    ${PUBLIC_TABLES}
  `);
  expect(counts, "a table named in this gate no longer exists under that name").toEqual([
    `keep=${KEEP_OPEN.length} sel=${REVOKED_SELECT.length} wr=${REVOKED_WRITE.length}`,
  ]);
});
