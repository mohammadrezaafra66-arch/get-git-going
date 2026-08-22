-- 379 — supersede 378's census: test EFFECT, not identity, and cover every relkind (OG-25).
--
-- WHY. Review round 2 defeated 378 four ways. All four are one mistake, and it is the mistake this
-- programme has now made in four consecutive gates: **asking the catalogue who is NAMED when the
-- question is what a caller can DO.**
--
-- 375's own header wrote the rule down ("use has_table_privilege, not grantee='anon'"). 378 then
-- applied it to sequences — check 3 uses `has_sequence_privilege` and the reviewer could not break
-- it — and left the table/view census on `aclexplode … grantee = 'anon'::regrole`. Fixing the
-- one-for-one swap did not fix the predicate underneath it.
--
--   (M9)  A GRANT TO PUBLIC. `GRANT SELECT ON public.api_products_pricing TO PUBLIC` writes
--         `=r/supabase_admin` into the ACL — the empty grantee is PUBLIC. `anon` is never named, so
--         the census sees nothing, and the gate printed OK. Verified independently and rolled back:
--
--           census sees anon named: false   |   anon can actually read: true
--
--         and that view carries no `security_invoker`, so anon reads 355 rows of which 321 carry
--         supplier cost prices. Same payload as the round-1 swap, through a one-line grant that any
--         routine "make this readable" change would produce.
--
--   (M10) relkind scope. 378 covers 'r','v','S'. `ALTER DEFAULT PRIVILEGES … ON TABLES` covers
--         ordinary tables, views, MATERIALIZED VIEWS, PARTITIONED TABLES and FOREIGN TABLES. The
--         reviewer created a matview over the same pricing view, granted `anon` directly — the ACL
--         literally read `anon=r/supabase_admin` — and the census could not see it because relkind
--         'm' was out of scope. Matviews ignore RLS entirely, which makes them the worst class of
--         object to be blind to. A partitioned table passed the same way.
--
--   (M11) Role inheritance, needing no new role: `products_api_readonly` already holds `r` on
--         `api_products_pricing`, so `GRANT products_api_readonly TO anon` gives anon the read
--         without ever appearing in that table's ACL.
--
--   (m12) Column-level grants. `GRANT SELECT (purchase_price, name) … TO anon` lives in
--         `pg_attribute.attacl`; `relacl` never moves. 378's column check covered only the eight
--         G-1 guard views.
--
-- WHAT CHANGES HERE
--
--   * The census predicate becomes an EFFECT test: does `anon` hold ANY privilege on the object,
--     by `has_table_privilege` / `has_sequence_privilege`, which account for PUBLIC grants and for
--     roles `anon` inherits. This closes M9, M11 and — with the column sweep below — m12.
--
--     ANY privilege, not SELECT. `sale_lists` and `sale_list_items` hold DELETE/INSERT/UPDATE/
--     TRUNCATE for anon and NOT SELECT (OG-32), so a SELECT-only census would drop them and the
--     pinned list would silently shrink from 216 to 214. Measured before writing this: the
--     any-privilege effect set and the old name set are identical, element for element, today.
--
--   * The scope becomes relkind IN ('r','v','S','m','p','f'). There are no matviews, partitioned
--     tables or foreign tables in `public` today (r=224, v=20, S=6), so this changes nothing now and
--     is precisely why it must be pinned now: the next one created would otherwise arrive invisible.
--
--   * A column-privilege sweep runs over every column of every object in scope, not just the eight
--     guard views.
--
-- 378 is applied and committed and this repository does not edit an applied migration (AGENTS.md
-- rule 6), so the corrected gate ships here. 379 SUPERSEDES 378 entirely; everything 378 asserts is
-- re-asserted below so this file stands alone.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
--
-- ROLLBACK: docs/verification/379-down.sql (a documented no-op).

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
  -- The anon-grant census measured 2026-08-22, as '<relkind>:<relname>'.
  -- 204 tables + 7 views + 5 sequences = 216. Verified identical under the effect test.
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
  --    is untouched.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype IN ('r','S')
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 0 THEN
    RAISE EXCEPTION '379: % default-privilege entr(y/ies) for anon on TABLES/SEQUENCES in public still exist', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public' AND d.defaclobjtype = 'f'
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 1 THEN
    RAISE EXCEPTION '379: the FUNCTIONS default privilege for anon must be untouched (expected 1, found %)', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. THE CENSUS, BY EFFECT, ACROSS EVERY relkind ALTER DEFAULT PRIVILEGES
  --    ... ON TABLES can produce. Closes M9 (PUBLIC grants), M10 (relkind
  --    scope) and M11 (role inheritance): has_*_privilege resolves all three,
  --    where `aclexplode ... grantee = 'anon'` resolved none of them.
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO actual
    FROM (
      SELECT c.relkind::text || ':' || c.relname AS k
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public'
         AND c.relkind IN ('r','v','S','m','p','f')
         AND (CASE WHEN c.relkind = 'S'
                   THEN EXISTS (SELECT 1 FROM unnest(seq_privs) x WHERE has_sequence_privilege('anon', c.oid, x))
                   ELSE EXISTS (SELECT 1 FROM unnest(all_privs) x WHERE has_table_privilege('anon', c.oid, x))
              END)
    ) s;

  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO missing
    FROM unnest(census) x WHERE x <> ALL (actual);
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO unexpected
    FROM unnest(actual) x WHERE x <> ALL (census);

  IF array_length(missing,1) IS NOT NULL OR array_length(unexpected,1) IS NOT NULL THEN
    RAISE EXCEPTION '379: the anon-grant census drifted (effect test). lost: % ; gained: %',
      coalesce(missing, ARRAY[]::text[]), coalesce(unexpected, ARRAY[]::text[]);
  END IF;

  ---------------------------------------------------------------------------
  -- 3. COLUMN-level grants, over every object in scope — not just the eight
  --    guard views. Closes m12: a column grant lives in pg_attribute.attacl and
  --    never moves relacl, so the census above cannot see it however it is
  --    written.
  --
  --    The rule asserted is absolute: NO column-level ACL naming anon may exist
  --    anywhere in `public`. Measured 2026-08-22, there are ZERO column ACLs in
  --    the schema, so this is the current state and not a target. It is asserted
  --    absolutely rather than diffed because a column grant is never how this
  --    project grants anything — every real grant here is table-level — so the
  --    first one to appear is drift by definition, and the census is blind to it.
  ---------------------------------------------------------------------------
  FOR t, col IN
    SELECT c.relname, a.attname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE ns.nspname = 'public'
       AND c.relkind IN ('r','v','m','p','f')
       AND a.attacl IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM aclexplode(
                 (SELECT a2.attacl FROM pg_attribute a2
                   WHERE a2.attrelid = format('public.%I', t)::regclass AND a2.attname = col)
               ) ac WHERE ac.grantee = 'anon'::regrole OR ac.grantee = 0)
    THEN
      RAISE EXCEPTION '379: a column-level grant reaching anon exists on public.%.% — relacl cannot show this, and the census is blind to it', t, col;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 4. the named public tables keep SELECT and their exact recorded privilege set.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY public_tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', t)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '379: anon lost SELECT on public.% — a genuinely public route reads it', t;
    END IF;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO actual_privs
      FROM unnest(all_privs) x
     WHERE has_table_privilege('anon', format('public.%I', t)::regclass, x);
    IF actual_privs IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x) THEN
      RAISE EXCEPTION '379: anon privileges on public.% drifted. expected %, found %',
        t, (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x), actual_privs;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. the functions the public surfaces call. Deliberately weak, and the
  --    weakness is named: PostgreSQL grants functions EXECUTE to PUBLIC by
  --    default and `proacl` here begins `=X/supabase_admin`, so this can only
  --    fail once PUBLIC is revoked too — the step a FUNCTIONS mission (OG-31)
  --    must take and might forget.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY ARRAY['public.refresh_sale_list_prices(uuid)',
                           'public.get_recent_purchase_label(uuid)',
                           'public.get_recent_purchase_labels(uuid[])'] LOOP
    IF NOT has_function_privilege('anon', t, 'EXECUTE') THEN
      RAISE EXCEPTION '379: anon lost EXECUTE on % — a public route calls it', t;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 6. G-1 must not regress, at table or column level.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY all_privs LOOP
      IF has_table_privilege('anon', format('public.%I', t)::regclass, p) THEN
        RAISE EXCEPTION '379: G-1 regressed — anon holds % on public.%', p, t;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 7. the headline: a freshly created view and sequence receive nothing.
  ---------------------------------------------------------------------------
  BEGIN
    EXECUTE 'CREATE VIEW public._og25_g379 AS SELECT 1 AS x';
    EXECUTE 'CREATE SEQUENCE public._og25_g379_seq';
    probe_priv := has_table_privilege('anon', 'public._og25_g379'::regclass, 'SELECT');
    seq_priv   := has_sequence_privilege('anon', 'public._og25_g379_seq'::regclass, 'USAGE');
    EXECUTE 'DROP VIEW public._og25_g379';
    EXECUTE 'DROP SEQUENCE public._og25_g379_seq';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '379: the freshly-created-object probe could not run: % %', SQLSTATE, SQLERRM;
  END;
  IF probe_priv THEN
    RAISE EXCEPTION '379: a freshly created VIEW is still granted to anon — the tap is NOT closed';
  END IF;
  IF seq_priv THEN
    RAISE EXCEPTION '379: a freshly created SEQUENCE is still granted to anon — the tap is NOT closed';
  END IF;

  RAISE NOTICE '379 OK: default privilege gone for TABLES and SEQUENCES, FUNCTIONS untouched; census matches all 216 names BY EFFECT across relkind r/v/S/m/p/f, so PUBLIC grants, inherited roles and matviews are all visible; no column-level anon grant anywhere in public; 6 public tables at their recorded privilege set; 3 public functions executable; G-1 intact; a fresh view and sequence receive nothing';
END
$chk$;
