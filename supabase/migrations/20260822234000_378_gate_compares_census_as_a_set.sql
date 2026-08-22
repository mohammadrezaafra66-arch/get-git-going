-- 378 — supersede migration 375's gate: compare the census as a SET, and cover SEQUENCES (OG-25).
--
-- WHY. The independent review defeated 375 twice, and both holes are the same mistake 371 made in
-- the G-1 mission: 375's own header says "assert by name, and compare sets, never cardinalities",
-- and then check 6 counts.
--
--   (M3) A ONE-FOR-ONE SWAP passes check 6. The reviewer ran, inside BEGIN .. ROLLBACK:
--
--          REVOKE ALL ON TABLE public.payment_vouchers FROM anon;
--          GRANT SELECT ON TABLE public.api_products_pricing TO anon;
--
--        census before 211, census after 211, gate green — while an existing object HAD been
--        revoked, which check 6 exists to detect. And the object swapped in is not harmless:
--        `api_products_pricing` carries no `security_invoker`, so it bypasses base-table RLS.
--        Confirmed independently and rolled back: with that grant, anon reads 355 rows carrying
--        supplier cost prices and current sale prices. That is the G-1 defect class, admitted by a
--        gate that was only counting.
--
--   (M4) SEQUENCES ARE UNASSERTED. Migration 373 closes the sequence tap, but 375 checks sequences
--        only through its fresh-object probe. `information_schema.role_table_grants` cannot see
--        sequences at all, so `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon` passed the gate
--        while genuinely changing the end state. Worse, the omission hid a fact the mission should
--        have reported: FIVE sequences already carry an `anon` grant —
--
--          audit_logs_id_seq, bot_api_usage_logs_id_seq, employee_score_events_id_seq,
--          payment_voucher_number_seq, score_snapshots_id_seq        (all anon=rwU)
--
--        so the true census across relkind r/v/S is 216, not 211. That also reconciles the
--        `deferred.md` "216 of 224" figure this mission had recorded as irreducible:
--        204 tables + 7 views + 5 sequences = 216. The original note counted all relkinds and
--        compared the total against tables only. The mission tested two hypotheses and stopped one
--        short; the reviewer supplied the third.
--
-- 375 is applied and committed, and this repository does not edit an applied migration (AGENTS.md
-- rule 6), so the corrected gate ships here. 378 SUPERSEDES 375's check 6 and adds sequence
-- coverage; everything else 375 asserts is re-asserted below so this file stands alone.
--
-- The census array below is the mission's other deliverable: it is the recorded keep/strip list a
-- batched REVOKE (OG-30) will work from, and pinning it means drift in EITHER direction names the
-- object rather than moving a number.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
--
-- ROLLBACK: docs/verification/378-down.sql (a documented no-op).

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
  -- The complete anon-grant census measured 2026-08-22, as '<relkind>:<relname>'.
  -- 204 tables + 7 views + 5 sequences = 216.
  census        text[] := ARRAY[
    'r:academy_courses', 'r:academy_lessons', 'r:academy_quiz_attempts', 'r:academy_quiz_questions',
    'r:academy_quizzes', 'r:academy_user_progress', 'r:achievements', 'r:ai_conversations',
    'r:ai_generated_content', 'r:ai_provider_health', 'r:ai_providers', 'r:ai_usage_routes',
    'r:appeal_reviewers', 'r:asan_control_accounts', 'r:asan_export_numbers', 'r:asan_import_batches',
    'r:asan_import_person_rows', 'r:asan_import_product_rows', 'r:audit_logs', 'r:automation_artifacts',
    'r:automation_checkpoints', 'r:automation_driver_outputs', 'r:automation_job_runs',
    'r:automation_jobs', 'r:automation_log_events', 'r:automation_modules',
    'r:automation_worker_heartbeats', 'r:automation_workers', 'r:bank_accounts',
    'r:bot_api_key_audit_log', 'r:bot_api_key_label_access', 'r:bot_api_key_table_access',
    'r:bot_api_keys', 'r:bot_api_usage_logs', 'r:brands', 'r:call_logs', 'r:capital_allocation_ledger',
    'r:categories', 'r:category_product_attributes', 'r:credit_requests', 'r:credit_score_snapshots',
    'r:credit_scoring_rules', 'r:currencies', 'r:currency_rate_fetches', 'r:currency_rates',
    'r:currency_sources', 'r:custom_roles', 'r:customer_credit_balance', 'r:customer_credit_ledger',
    'r:customer_credit_profile', 'r:customers', 'r:daily_mood_entries', 'r:daily_mood_hafez_poems',
    'r:daily_mood_questions', 'r:daily_mood_scenarios', 'r:dashboard_ticker_events',
    'r:delivery_receipt_status_history', 'r:delivery_receipts', 'r:didar_activities',
    'r:didar_import_log', 'r:document_attachments', 'r:document_numbers', 'r:document_status_history',
    'r:documents', 'r:dual_documents', 'r:dynamic_entity_scores', 'r:dynamic_parameter_weights',
    'r:dynamic_parameter_weights_backup_142', 'r:dynamic_parameter_weights_backup_20260722',
    'r:dynamic_scoring_parameters', 'r:dynamic_table_cells', 'r:dynamic_table_columns',
    'r:dynamic_table_row_counters', 'r:dynamic_table_rows', 'r:dynamic_tables',
    'r:employee_achievements', 'r:employee_leagues', 'r:employee_level_up_events',
    'r:employee_mission_progress', 'r:employee_profiles', 'r:employee_progress',
    'r:employee_score_events', 'r:employee_scores', 'r:employee_streaks', 'r:external_parties',
    'r:feedback', 'r:feedback_items', 'r:gamification_kpi_rules', 'r:gamification_kpis',
    'r:gamification_rewards', 'r:inquiries', 'r:inquiry_price_cache', 'r:inquiry_replies',
    'r:inquiry_status_history', 'r:inquiry_transfers', 'r:invoice_workflow_stages', 'r:journal_entries',
    'r:journal_lines', 'r:knowledge_articles', 'r:knowledge_confirmations',
    'r:knowledge_document_chunks', 'r:knowledge_documents', 'r:knowledge_documents_backup_20260722',
    'r:league_seasons', 'r:league_settings', 'r:market_indicators', 'r:market_product_match_events',
    'r:market_product_matches', 'r:market_rate_ingestion_runs', 'r:market_rate_source_mappings',
    'r:market_rate_sources', 'r:market_rate_ticks', 'r:marketing_channels', 'r:message_embeddings',
    'r:messages', 'r:messenger_attachments', 'r:messenger_group_members', 'r:messenger_groups',
    'r:messenger_messages', 'r:messenger_read_receipts', 'r:missions', 'r:notification_events',
    'r:notification_queue', 'r:payment_receipt_custom_fields', 'r:payment_receipt_documents',
    'r:payment_receipt_links', 'r:payment_receipts', 'r:payment_receipts_backup_20260722',
    'r:payment_terms', 'r:payment_vouchers', 'r:penalty_appeals', 'r:performance_penalties',
    'r:person_context_links', 'r:person_field_definitions', 'r:person_field_values',
    'r:person_identifiers', 'r:person_merge_candidates', 'r:person_merge_log', 'r:persons',
    'r:phone_collisions', 'r:presence_logs', 'r:price_alert_notifications', 'r:price_alert_rules',
    'r:price_calculation_snapshots', 'r:price_change_reasons', 'r:price_list_items', 'r:price_lists',
    'r:pricing_board_access_requests', 'r:pricing_board_settings', 'r:pricing_board_viewer_sessions',
    'r:pricing_recompute_queue', 'r:pricing_rules', 'r:product_attribute_groups', 'r:product_attributes',
    'r:product_category_attribute_values', 'r:product_computed_prices', 'r:product_images',
    'r:product_interaction_events', 'r:product_label_links', 'r:product_labels',
    'r:product_owner_assignments', 'r:product_recommendation_overrides', 'r:product_sale_price_history',
    'r:product_sku_counters', 'r:product_suppliers', 'r:product_video_chain',
    'r:product_video_chain_events', 'r:products', 'r:profile_field_definitions',
    'r:profile_field_values', 'r:profiles', 'r:promotion_nomination_policy', 'r:promotion_nominations',
    'r:purchase_prices', 'r:purchase_receipts', 'r:purchase_request_status_history',
    'r:recent_purchase_settings', 'r:role_permissions', 'r:sale_list_items', 'r:sale_list_versions',
    'r:sale_lists', 'r:sale_price_types', 'r:sales_quote_counters', 'r:sales_quote_send_queue',
    'r:sales_quote_share_logs', 'r:sales_reminders', 'r:score_snapshots', 'r:settlement_types',
    'r:shipping_cost_rules', 'r:shop_settings', 'r:staff_daily_performance_metrics',
    'r:stock_alert_requests', 'r:stock_movements', 'r:stock_transfer_items', 'r:stock_transfers',
    'r:suppliers', 'r:tasks', 'r:user_roles', 'r:validation_rules', 'r:visitors', 'r:warehouse_stock',
    'r:warehouses', 'r:waybill_number_counter', 'r:workflow_settings', 'S:audit_logs_id_seq',
    'S:bot_api_usage_logs_id_seq', 'S:employee_score_events_id_seq', 'S:payment_voucher_number_seq',
    'S:score_snapshots_id_seq', 'v:academy_quiz_questions_public', 'v:effective_currencies_view',
    'v:employee_monthly_hours', 'v:v_latest_active_purchase_prices', 'v:v_league_tiers_public',
    'v:v_pricing_recompute_queue_summary', 'v:vw_purchase_float'
  ];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. the anon default privilege on TABLES and SEQUENCES is gone; FUNCTIONS
  --    is untouched. (Re-asserted from 375.)
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype IN ('r','S')
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 0 THEN
    RAISE EXCEPTION '378: % default-privilege entr(y/ies) for anon on TABLES/SEQUENCES in public still exist', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype = 'f'
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 1 THEN
    RAISE EXCEPTION '378: the FUNCTIONS default privilege for anon must be untouched (expected 1, found %)', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. THE CENSUS, AS A SET. Closes M3: a one-for-one swap now names both the
  --    object that left and the object that arrived.
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(c.relkind::text || ':' || c.relname ORDER BY c.relkind::text, c.relname), ARRAY[]::text[])
    INTO actual
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind IN ('r','v','S')
     AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 'anon'::regrole);

  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO missing
    FROM unnest(census) x WHERE x <> ALL (actual);
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO unexpected
    FROM unnest(actual) x WHERE x <> ALL (census);

  IF array_length(missing,1) IS NOT NULL OR array_length(unexpected,1) IS NOT NULL THEN
    RAISE EXCEPTION '378: the anon-grant census drifted. lost: % ; gained: %',
      coalesce(missing, ARRAY[]::text[]), coalesce(unexpected, ARRAY[]::text[]);
  END IF;

  ---------------------------------------------------------------------------
  -- 3. SEQUENCES explicitly. Closes M4: role_table_grants cannot see them, so
  --    the set check above is backed by a direct privilege test per sequence.
  ---------------------------------------------------------------------------
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
            WHERE ns.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname
  LOOP
    IF has_sequence_privilege('anon', format('public.%I', t)::regclass, 'USAGE')
       <> ('S:' || t = ANY (census)) THEN
      RAISE EXCEPTION '378: sequence public.% has an anon USAGE state the census does not expect', t;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 4. the named public tables keep SELECT and their exact recorded privilege
  --    set. `shop_settings` is here because migration 377 records why.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY public_tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', t)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '378: anon lost SELECT on public.% — a genuinely public route reads it', t;
    END IF;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO actual_privs
      FROM unnest(all_privs) x
     WHERE has_table_privilege('anon', format('public.%I', t)::regclass, x);
    IF actual_privs IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x) THEN
      RAISE EXCEPTION '378: anon privileges on public.% drifted. expected %, found %',
        t, (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x), actual_privs;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. the functions the public surfaces call.
  --    This check is deliberately weak, and the weakness is worth naming:
  --    PostgreSQL grants functions EXECUTE to PUBLIC by default, and all three
  --    carry it (`proacl` begins `=X/supabase_admin`), so has_function_privilege
  --    stays true even after REVOKE ... FROM anon. It can only fail once PUBLIC
  --    is revoked too — which is exactly the step a FUNCTIONS mission (OG-31)
  --    must take and might forget.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY ARRAY['public.refresh_sale_list_prices(uuid)',
                           'public.get_recent_purchase_label(uuid)',
                           'public.get_recent_purchase_labels(uuid[])'] LOOP
    IF NOT has_function_privilege('anon', t, 'EXECUTE') THEN
      RAISE EXCEPTION '378: anon lost EXECUTE on % — a public route calls it', t;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 6. G-1 must not regress, at table or column level. (Re-asserted from 375.)
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY all_privs LOOP
      IF has_table_privilege('anon', format('public.%I', t)::regclass, p) THEN
        RAISE EXCEPTION '378: G-1 regressed — anon holds % on public.%', p, t;
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
      RAISE EXCEPTION '378: G-1 regressed — anon holds a column-level SELECT on public.%.%', t, col;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 7. the headline: a freshly created view and sequence receive nothing.
  ---------------------------------------------------------------------------
  BEGIN
    EXECUTE 'CREATE VIEW public._og25_g378 AS SELECT 1 AS x';
    EXECUTE 'CREATE SEQUENCE public._og25_g378_seq';
    probe_priv := has_table_privilege('anon', 'public._og25_g378'::regclass, 'SELECT');
    seq_priv   := has_sequence_privilege('anon', 'public._og25_g378_seq'::regclass, 'USAGE');
    EXECUTE 'DROP VIEW public._og25_g378';
    EXECUTE 'DROP SEQUENCE public._og25_g378_seq';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '378: the freshly-created-object probe could not run: % %', SQLSTATE, SQLERRM;
  END;
  IF probe_priv THEN
    RAISE EXCEPTION '378: a freshly created VIEW is still granted to anon — the tap is NOT closed';
  END IF;
  IF seq_priv THEN
    RAISE EXCEPTION '378: a freshly created SEQUENCE is still granted to anon — the tap is NOT closed';
  END IF;

  RAISE NOTICE '378 OK: default privilege gone for TABLES and SEQUENCES, FUNCTIONS untouched; census matches all 216 names across r/v/S including the 5 sequences; 6 public tables at their recorded privilege set; 3 public functions executable; G-1 intact at table and column level; a fresh view and sequence receive nothing';
END
$chk$;
