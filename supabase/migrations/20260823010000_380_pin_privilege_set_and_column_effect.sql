-- 380 — pin the privilege SET per object, and make the column sweep an effect test (OG-25).
--
-- WHY. Review round 3 confirmed 379 catches all seven earlier attacks, and then found two more.
-- Both are the same identity-vs-effect mistake this programme has now made in five consecutive
-- gates — this time one layer *inside* the check written to close it.
--
--   (M15) THE CENSUS PINS MEMBERSHIP, NOT COMPOSITION. 379 asks "does anon hold ANY privilege on
--         this object". Once an object is in the set, its privilege composition may change freely,
--         and the change that matters most — gaining SELECT — is invisible. The clearest case is the
--         object the owner explicitly gated:
--
--             GRANT SELECT ON TABLE public.sale_lists      TO anon;
--             GRANT SELECT ON TABLE public.sale_list_items TO anon;
--             -> 379 OK
--
--         Those two hold DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE and **not SELECT**,
--         and that absence IS OG-32 — the Owner-Gate the owner told this mission to record rather
--         than fix. Granting SELECT silently un-gates it and 379 cannot tell.
--
--         No rows leak today: RLS still returns 0 rows to anon on both. So this is undetected drift
--         rather than disclosure. It matters because the census is this mission's primary
--         deliverable — the keep/strip list OG-30 will work from — and it could not distinguish
--         "anon may write but not read" from "anon may read", which is the only distinction that
--         list exists to make.
--
--   (M16) THE COLUMN SWEEP IS STILL AN IDENTITY TEST. 379 check 3 asks
--         `aclexplode(attacl) WHERE grantee = 'anon' OR grantee = 0`. That covers anon and PUBLIC —
--         a *wider* identity test, not an effect test — and misses a role anon inherits:
--
--             CREATE ROLE _colrole;
--             GRANT SELECT (purchase_price) ON public.api_products_pricing TO _colrole;
--             GRANT _colrole TO anon;
--             -> 379 OK, printing "no column-level anon grant anywhere in public"
--                while  table-level = false,  column-level = TRUE
--                and anon reads 355 rows of supplier cost prices.
--
--         The correct call was already in the file twice: check 2 uses has_table_privilege and
--         check 6 uses has_column_privilege for the guard views. Check 3 did not.
--
-- ALSO CORRECTED HERE. 379's own comment claimed "there are ZERO column ACLs in the schema" and
-- "a column grant is never how this project grants anything — every real grant here is table-level".
-- Both are false. There are EIGHT, and they are deliberate:
--
--     currency_sources.api_key   {authenticated=aw/postgres}   -- INSERT/UPDATE, NO SELECT:
--                                                              -- an API key deliberately hidden from readers
--     currency_sources.created_at / id / is_active / name / updated_at / url  {authenticated=r/postgres}
--     sales_quotes.customer_person_id  {authenticated=w/postgres}
--
-- None reaches anon, so 379's assertion still held — but the reasoning offered for asserting
-- absolutely rather than diffing was wrong, and `currency_sources.api_key` shows the project uses
-- column grants precisely to withhold SELECT. That is the same shape as M15.
--
-- 379 is applied and committed and this repository does not edit an applied migration (AGENTS.md
-- rule 6), so this ships here. 380 SUPERSEDES 379; everything 379 asserts is re-asserted below with
-- the two holes closed, so this file stands alone.
--
-- A NOTE ON CHECK 1, kept deliberately narrow. It filters `defaclrole = 'supabase_admin'` and joins
-- pg_namespace, so a global `ALTER DEFAULT PRIVILEGES` with no `IN SCHEMA` (defaclnamespace = 0)
-- does not join and is not seen. That is covered — but by check 7, the freshly-created-object probe,
-- which raises `the tap is NOT closed` for exactly that case. The protection is real and is not
-- where a reader would look for it, so it is stated here.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
--
-- ROLLBACK: docs/verification/380-down.sql (a documented no-op).

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  t             text;
  p             text;
  col           text;
  n             int;
  probe_priv    boolean;
  seq_priv      boolean;
  actual        text[];
  missing       text[];
  unexpected    text[];
  actual_privs  text[];
  public_tables text[] := ARRAY['products','brands','categories','sale_price_types',
                                'profile_field_definitions','shop_settings'];
  expected_privs text[] := ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
  guard_views   text[] := ARRAY[
    'product_computed_prices_public','publish_recipients_view',
    'v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions','vw_account_balances',
    'vw_customer_receivables','vw_supplier_payables'
  ];
  all_privs     text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  seq_privs     text[] := ARRAY['USAGE','SELECT','UPDATE'];
  -- The anon-grant census measured 2026-08-22, as '<relkind>:<relname>=<privileges>'.
  -- 204 tables + 7 views + 5 sequences = 216. Privileges are what `anon` EFFECTIVELY holds, so
  -- PUBLIC grants and inherited roles are already folded in. Note `r:sale_lists` and
  -- `r:sale_list_items` carry no SELECT — that absence is OG-32 and is now pinned, not merely implied.
  census        text[] := ARRAY[
    'S:audit_logs_id_seq=SELECT,UPDATE,USAGE', 'S:bot_api_usage_logs_id_seq=SELECT,UPDATE,USAGE',
    'S:employee_score_events_id_seq=SELECT,UPDATE,USAGE', 'S:payment_voucher_number_seq=SELECT,UPDATE,USAGE',
    'S:score_snapshots_id_seq=SELECT,UPDATE,USAGE',
    'r:academy_courses=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:academy_lessons=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:academy_quiz_attempts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:academy_quiz_questions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:academy_quizzes=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:academy_user_progress=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:achievements=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:ai_conversations=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:ai_generated_content=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:ai_provider_health=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:ai_providers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:ai_usage_routes=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:appeal_reviewers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:asan_control_accounts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:asan_export_numbers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:asan_import_batches=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:asan_import_person_rows=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:asan_import_product_rows=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:audit_logs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_artifacts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_checkpoints=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_driver_outputs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_job_runs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_jobs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_log_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_modules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_worker_heartbeats=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:automation_workers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bank_accounts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bot_api_key_audit_log=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bot_api_key_label_access=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bot_api_key_table_access=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bot_api_keys=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:bot_api_usage_logs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:brands=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:call_logs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:capital_allocation_ledger=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:categories=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:category_product_attributes=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:credit_requests=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:credit_score_snapshots=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:credit_scoring_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:currencies=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:currency_rate_fetches=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:currency_rates=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:currency_sources=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:custom_roles=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:customer_credit_balance=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:customer_credit_ledger=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:customer_credit_profile=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:customers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:daily_mood_entries=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:daily_mood_hafez_poems=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:daily_mood_questions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:daily_mood_scenarios=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dashboard_ticker_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:delivery_receipt_status_history=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:delivery_receipts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:didar_activities=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:didar_import_log=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:document_attachments=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:document_numbers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:document_status_history=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:documents=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dual_documents=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_entity_scores=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_parameter_weights=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_parameter_weights_backup_142=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_parameter_weights_backup_20260722=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_scoring_parameters=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_table_cells=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_table_columns=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_table_row_counters=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_table_rows=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:dynamic_tables=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_achievements=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_leagues=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_level_up_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_mission_progress=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_profiles=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_progress=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_score_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_scores=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:employee_streaks=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:external_parties=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:feedback=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:feedback_items=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:gamification_kpi_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:gamification_kpis=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:gamification_rewards=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:inquiries=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:inquiry_price_cache=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:inquiry_replies=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:inquiry_status_history=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:inquiry_transfers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:invoice_workflow_stages=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:journal_entries=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:journal_lines=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:knowledge_articles=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:knowledge_confirmations=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:knowledge_document_chunks=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:knowledge_documents=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:knowledge_documents_backup_20260722=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:league_seasons=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:league_settings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_indicators=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_product_match_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_product_matches=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_rate_ingestion_runs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_rate_source_mappings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_rate_sources=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:market_rate_ticks=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:marketing_channels=SELECT',
    'r:message_embeddings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messages=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messenger_attachments=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messenger_group_members=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messenger_groups=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messenger_messages=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:messenger_read_receipts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:missions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:notification_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:notification_queue=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_receipt_custom_fields=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_receipt_documents=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_receipt_links=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_receipts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_receipts_backup_20260722=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_terms=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:payment_vouchers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:penalty_appeals=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:performance_penalties=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_context_links=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_field_definitions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_field_values=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_identifiers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_merge_candidates=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:person_merge_log=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:persons=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:phone_collisions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:presence_logs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_alert_notifications=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_alert_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_calculation_snapshots=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_change_reasons=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_list_items=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:price_lists=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:pricing_board_access_requests=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:pricing_board_settings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:pricing_board_viewer_sessions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:pricing_recompute_queue=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:pricing_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_attribute_groups=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_attributes=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_category_attribute_values=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_computed_prices=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_images=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_interaction_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_label_links=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_labels=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_owner_assignments=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_recommendation_overrides=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_sale_price_history=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_sku_counters=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_suppliers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_video_chain=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:product_video_chain_events=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:products=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:profile_field_definitions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:profile_field_values=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:profiles=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:promotion_nomination_policy=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:promotion_nominations=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:purchase_prices=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:purchase_receipts=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:purchase_request_status_history=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:recent_purchase_settings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:role_permissions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sale_list_items=DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE',
    'r:sale_list_versions=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sale_lists=DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE',
    'r:sale_price_types=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sales_quote_counters=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sales_quote_send_queue=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sales_quote_share_logs=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:sales_reminders=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:score_snapshots=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:settlement_types=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:shipping_cost_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:shop_settings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:staff_daily_performance_metrics=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:stock_alert_requests=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:stock_movements=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:stock_transfer_items=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:stock_transfers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:suppliers=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:tasks=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:user_roles=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:validation_rules=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:visitors=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:warehouse_stock=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:warehouses=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:waybill_number_counter=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'r:workflow_settings=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:academy_quiz_questions_public=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:effective_currencies_view=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:employee_monthly_hours=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:v_latest_active_purchase_prices=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:v_league_tiers_public=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:v_pricing_recompute_queue_summary=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
    'v:vw_purchase_float=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
  ];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. the anon default privilege on TABLES and SEQUENCES is gone; FUNCTIONS
  --    is untouched. Deliberately narrow — see the header note; the global
  --    (defaclnamespace = 0) case is caught by check 7.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype IN ('r','S')
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 0 THEN
    RAISE EXCEPTION '380: % default-privilege entr(y/ies) for anon on TABLES/SEQUENCES in public still exist', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype = 'f'
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 1 THEN
    RAISE EXCEPTION '380: the FUNCTIONS default privilege for anon must be untouched (expected 1, found %)', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. THE CENSUS, BY EFFECT, WITH THE PRIVILEGE SET PINNED PER OBJECT.
  --    Closes M15: membership alone could not see SELECT being added to an
  --    object already in the set — including sale_lists, whose missing SELECT
  --    is OG-32. Still by effect, so PUBLIC grants, inherited roles, matviews
  --    and partitioned tables all resolve (M9/M10/M11).
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO actual
    FROM (
      SELECT c.relkind::text || ':' || c.relname || '=' ||
             (SELECT string_agg(x, ',' ORDER BY x)
                FROM unnest(CASE WHEN c.relkind = 'S' THEN seq_privs ELSE all_privs END) x
               WHERE CASE WHEN c.relkind = 'S'
                          THEN has_sequence_privilege('anon', c.oid, x)
                          ELSE has_table_privilege('anon', c.oid, x) END) AS k
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public'
         AND c.relkind IN ('r','v','S','m','p','f')
         AND (CASE WHEN c.relkind = 'S'
                   THEN EXISTS (SELECT 1 FROM unnest(seq_privs) y WHERE has_sequence_privilege('anon', c.oid, y))
                   ELSE EXISTS (SELECT 1 FROM unnest(all_privs) y WHERE has_table_privilege('anon', c.oid, y))
              END)
    ) s;

  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO missing
    FROM unnest(census) x WHERE x <> ALL (actual);
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO unexpected
    FROM unnest(actual) x WHERE x <> ALL (census);

  IF array_length(missing,1) IS NOT NULL OR array_length(unexpected,1) IS NOT NULL THEN
    RAISE EXCEPTION '380: the anon privilege census drifted. expected-but-absent: % ; found-but-unexpected: %',
      coalesce(missing, ARRAY[]::text[]), coalesce(unexpected, ARRAY[]::text[]);
  END IF;

  ---------------------------------------------------------------------------
  -- 3. COLUMN privileges, BY EFFECT, over every column of every object in
  --    scope. Closes M16: `aclexplode … grantee = 'anon' OR grantee = 0` is a
  --    wider identity test, not an effect test, and misses a role anon
  --    inherits. `has_column_privilege` resolves all three.
  --
  --    The rule: anon may hold a column privilege ONLY where it already holds
  --    the same privilege at table level. A column grant that reaches further
  --    than the table grant is invisible to check 2 by construction, because a
  --    column ACL never moves relacl.
  --
  --    This schema really does use column grants — eight of them, all to
  --    `authenticated`, and `currency_sources.api_key` is `aw` precisely to
  --    withhold SELECT. So the check is a diff against table level, not an
  --    assertion that column ACLs do not exist.
  ---------------------------------------------------------------------------
  FOR t, col IN
    SELECT c.relname, a.attname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE ns.nspname = 'public'
       AND c.relkind IN ('r','v','m','p','f')
  LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      IF has_column_privilege('anon', format('public.%I', t)::regclass, col, p)
         AND NOT has_table_privilege('anon', format('public.%I', t)::regclass, p)
      THEN
        RAISE EXCEPTION '380: anon holds % on public.%.% at COLUMN level but not at table level — a column grant reaches past the census, which cannot see it', p, t, col;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 4. the named public tables keep SELECT and their exact recorded privilege set.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY public_tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', t)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '380: anon lost SELECT on public.% — a genuinely public route reads it', t;
    END IF;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO actual_privs
      FROM unnest(all_privs) x
     WHERE has_table_privilege('anon', format('public.%I', t)::regclass, x);
    IF actual_privs IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x) THEN
      RAISE EXCEPTION '380: anon privileges on public.% drifted. expected %, found %',
        t, (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x), actual_privs;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. the functions the public surfaces call. Deliberately weak: PostgreSQL
  --    grants functions EXECUTE to PUBLIC by default and `proacl` here begins
  --    `=X/supabase_admin`, so this can only fail once PUBLIC is revoked too —
  --    the step a FUNCTIONS mission (OG-31) must take and might forget.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY ARRAY['public.refresh_sale_list_prices(uuid)',
                           'public.get_recent_purchase_label(uuid)',
                           'public.get_recent_purchase_labels(uuid[])'] LOOP
    IF NOT has_function_privilege('anon', t, 'EXECUTE') THEN
      RAISE EXCEPTION '380: anon lost EXECUTE on % — a public route calls it', t;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 6. G-1 must not regress, at table or column level.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY all_privs LOOP
      IF has_table_privilege('anon', format('public.%I', t)::regclass, p) THEN
        RAISE EXCEPTION '380: G-1 regressed — anon holds % on public.%', p, t;
      END IF;
    END LOOP;
  END LOOP;

  FOR t, col IN
    SELECT c.relname, a.attname FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND c.relname = ANY (guard_views)
  LOOP
    IF has_column_privilege('anon', format('public.%I', t)::regclass, col, 'SELECT') THEN
      RAISE EXCEPTION '380: G-1 regressed — anon holds a column-level SELECT on public.%.%', t, col;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 7. the headline: a freshly created view and sequence receive nothing.
  --    This is also what catches a global ALTER DEFAULT PRIVILEGES that check 1
  --    cannot see.
  ---------------------------------------------------------------------------
  BEGIN
    EXECUTE 'CREATE VIEW public._og25_g380 AS SELECT 1 AS x';
    EXECUTE 'CREATE SEQUENCE public._og25_g380_seq';
    probe_priv := has_table_privilege('anon', 'public._og25_g380'::regclass, 'SELECT');
    seq_priv   := has_sequence_privilege('anon', 'public._og25_g380_seq'::regclass, 'USAGE');
    EXECUTE 'DROP VIEW public._og25_g380';
    EXECUTE 'DROP SEQUENCE public._og25_g380_seq';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '380: the freshly-created-object probe could not run: % %', SQLSTATE, SQLERRM;
  END;
  IF probe_priv THEN
    RAISE EXCEPTION '380: a freshly created VIEW is still granted to anon — the tap is NOT closed';
  END IF;
  IF seq_priv THEN
    RAISE EXCEPTION '380: a freshly created SEQUENCE is still granted to anon — the tap is NOT closed';
  END IF;

  RAISE NOTICE '380 OK: default privilege gone for TABLES and SEQUENCES, FUNCTIONS untouched; the anon privilege SET matches on all 216 objects across relkind r/v/S/m/p/f, so a SELECT added to an object already in the census is now caught; no column privilege reaches anon past its table grant; 6 public tables at their recorded set; 3 public functions executable; G-1 intact; a fresh view and sequence receive nothing';
END
$chk$;
