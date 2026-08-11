-- =====================================================================
-- Migration: rls_permissive_select_fix
-- Purpose : Fix the SYSTEMIC "permissive SELECT" RLS pattern.
--
--   A QA sweep found tables whose RLS SELECT policy is permissive
--   (`USING (true)` or `USING (auth.role() = 'authenticated')`), so ANY
--   authenticated user can read every row directly via PostgREST
--   (`GET /rest/v1/<table>`), bypassing every UI/route guard.
--
-- SOURCE OF TRUTH (corrected): the LIVE self-hosted database `afrakala`
--   (NOT `postgres`, and NOT `supabase/schema_full_export.sql`, which is a
--   stale dump of a different DB). Live state: 192 tables, 463 policies,
--   ZERO tables without RLS, and **38 open SELECT policies** — see
--   `docs/qa/rls-live-afrakala.txt`. This migration is aligned to those 38.
--
--   Of the 38 open policies: 4 are sensitive LEAKs (Section A), 6 are admin
--   CONFIG safe to restrict (Section B), 5 are ⚠️ UNSURE (Section C, left
--   commented), and 23 are intentional REFERENCE/catalog/RBAC/broadcast data
--   that lower roles MUST read (KEEP block — NOT changed; restricting them
--   BREAKS the app).
--
--   Each replacement policy is derived from that module's REAL access
--   mechanism (route guards in src/routes/*, the RBAC matrix in
--   src/lib/rbac/roles.ts, and RLS on sibling tables) — not guessed.
--
-- NOT fixed here (LOW priority, confirmed against live afrakala):
--   `academy_lessons`, `academy_quizzes`, `knowledge_articles` use
--   `auth.role() = 'authenticated'` (NOT `true`), so they are outside the
--   qual=true 38-list. They ARE readable by any authenticated user in live,
--   but severity is LOW: only training/article content, and the sensitive
--   answer-keys table `academy_quiz_questions` is already locked to
--   admin/manager. Excluded as low-priority, not because they are closed.
--   (The `auth.role()='authenticated'` class is separate from these 38 and
--    may include other tables — worth a follow-up sweep.)
--
-- Convention: connect as `supabase_admin` (project convention for RLS DDL).
-- Idempotent: every block is DROP POLICY IF EXISTS ...; CREATE POLICY ...;
--
-- After applying: docker restart afrakala-lan-rest
--   (PostgREST caches the schema/policies and must reload.)
-- =====================================================================


-- =====================================================================
-- SECTION A — LEAK tables (sensitive data exposed to every authenticated user)
--
-- ✅ STATUS: A1 (inquiry_price_cache) and A2 (didar_activities) are ALREADY
--    APPLIED/CLOSED in the live `afrakala` DB (confirmed): both now use a
--    role-based SELECT condition instead of qual=true. The DROP+CREATE below
--    is idempotent, so re-running it is a safe no-op that reproduces exactly
--    the applied policy. A3 (daily_capital_settings) and A4
--    (dynamic_entity_scores) are still open in live and are fixed here.
-- =====================================================================

-- A1. inquiry_price_cache  (P0 — negotiated PURCHASE prices; MSG-N07)
--     Columns: product_id, price, valid_until, created_by. NO group_id, so
--     is_messenger_group_member(...) scoping (used by the other inquiry tables)
--     is structurally impossible here. The server paths that need it
--     (create_inquiry validity check, reply_inquiry insert) are SECURITY
--     DEFINER and bypass RLS, and no frontend reads this table directly.
--     Per the "tighter option when ambiguous" rule we restrict to the
--     privileged purchase/pricing audience.
-- ⚠️ If inquiry-answering "buyer" groups ever include non-privileged roles
--    that must read the cached price directly (not via a DEFINER RPC), this
--    should become a group-membership check instead — revisit with product.
DROP POLICY IF EXISTS inquiry_price_cache_select ON public.inquiry_price_cache;
DROP POLICY IF EXISTS inquiry_price_cache_select_privileged ON public.inquiry_price_cache;
CREATE POLICY inquiry_price_cache_select_privileged ON public.inquiry_price_cache
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- A2. didar_activities — CRM activity (subject/description/customer/raw_data).
--     Mirror its sibling didar_import_log (admin OR manager).
DROP POLICY IF EXISTS didar_activities_read ON public.didar_activities;
DROP POLICY IF EXISTS didar_activities_select_admin_manager ON public.didar_activities;
CREATE POLICY didar_activities_select_admin_manager ON public.didar_activities
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- A3. daily_capital_settings — holds total_capital (sensitive daily financial
--     figure). Its sibling tables daily_capital_inputs / daily_capital_snapshots
--     already restrict SELECT to admin/manager/accountant; this one was left
--     open. All actual readers (accounting dynamic-capital route, customer
--     credit route, the allocation !inner joins) are admin/manager/accountant.
DROP POLICY IF EXISTS dcs_select_authenticated ON public.daily_capital_settings;
DROP POLICY IF EXISTS dcs_select_privileged ON public.daily_capital_settings;
CREATE POLICY dcs_select_privileged ON public.daily_capital_settings
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- A4. dynamic_entity_scores — per-customer credit sub-scores and per-salesperson
--     performance scores. Consumers: customer-credit route (admin/manager/
--     accountant) and users/$userId route (admin). No lower role reads it.
DROP POLICY IF EXISTS dyn_scores_read_authenticated ON public.dynamic_entity_scores;
DROP POLICY IF EXISTS dyn_scores_select_privileged ON public.dynamic_entity_scores;
CREATE POLICY dyn_scores_select_privileged ON public.dynamic_entity_scores
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));


-- =====================================================================
-- SECTION B — CONFIG tables (admin/finance-only config; verified NO lower-role
--             runtime reader). SELECT audience is set as a superset of each
--             table's existing WRITE audience so writers can still read back.
-- =====================================================================

-- B1. invoice_workflow_stages — read at runtime ONLY by /admin/workflow-stages
--     (verified: no invoice-view reads it); write = admin/accountant.
DROP POLICY IF EXISTS iws_select ON public.invoice_workflow_stages;
DROP POLICY IF EXISTS iws_select_privileged ON public.invoice_workflow_stages;
CREATE POLICY iws_select_privileged ON public.invoice_workflow_stages
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- B2. payment_receipt_custom_fields — read by the accounting PaymentReceiptForm
--     (accountant) + /admin/receipt-fields; write = admin/accountant.
DROP POLICY IF EXISTS prcf_select_authed ON public.payment_receipt_custom_fields;
DROP POLICY IF EXISTS prcf_select_privileged ON public.payment_receipt_custom_fields;
CREATE POLICY prcf_select_privileged ON public.payment_receipt_custom_fields
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- B3. recent_purchase_settings — read directly only by /admin/recent-purchase-
--     settings; the runtime label path uses get_recent_purchase_label()
--     (SECURITY DEFINER, bypasses RLS). Write = admin/manager.
DROP POLICY IF EXISTS "recent_purchase_settings read authenticated" ON public.recent_purchase_settings;
DROP POLICY IF EXISTS recent_purchase_settings_select_admin_manager ON public.recent_purchase_settings;
CREATE POLICY recent_purchase_settings_select_admin_manager ON public.recent_purchase_settings
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role]));

-- B4. workflow_settings — NOT read directly by the frontend; all runtime access
--     is via get_workflow_setting()/get_workflow_settings() (SECURITY DEFINER).
--     Write = admin/manager.
DROP POLICY IF EXISTS "all authenticated can read settings" ON public.workflow_settings;
DROP POLICY IF EXISTS workflow_settings_select_admin_manager ON public.workflow_settings;
CREATE POLICY workflow_settings_select_admin_manager ON public.workflow_settings
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role]));

-- B5. dynamic_scoring_parameters — scoring config (parameter definitions).
--     Read only by the credit-scoring UI (credit-rules = admin/accountant,
--     customer credit = admin/manager/accountant, user score = admin);
--     write = admin/manager.
DROP POLICY IF EXISTS dyn_scoring_params_read_authenticated ON public.dynamic_scoring_parameters;
DROP POLICY IF EXISTS dyn_scoring_params_select_privileged ON public.dynamic_scoring_parameters;
CREATE POLICY dyn_scoring_params_select_privileged ON public.dynamic_scoring_parameters
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- B6. dynamic_parameter_weights — scoring config (weights); same audience as B5.
DROP POLICY IF EXISTS dyn_param_weights_read_authenticated ON public.dynamic_parameter_weights;
DROP POLICY IF EXISTS dyn_param_weights_select_privileged ON public.dynamic_parameter_weights;
CREATE POLICY dyn_param_weights_select_privileged ON public.dynamic_parameter_weights
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));


-- =====================================================================
-- SECTION C — ⚠️ UNSURE (intended audience NOT determinable from code).
--             DO NOT enable blindly. Candidate policies are COMMENTED OUT;
--             a human must confirm the audience first, then uncomment.
-- =====================================================================

-- ⚠️ C1. employee_profiles  (live: ep_select_auth USING (true))
--    Looks like an intentional internal directory (department, bio,
--    direct_manager). Only the admin route (/users/$userId, requireAdmin)
--    reads it in the UI, BUT ep_write_own lets a user write their OWN row —
--    implying self-read is expected. Mild PII. Human call: keep as directory,
--    or tighten to own + admin/manager.
-- DROP POLICY IF EXISTS ep_select_auth ON public.employee_profiles;
-- CREATE POLICY ep_select_own_or_staff ON public.employee_profiles
--   FOR SELECT TO authenticated
--   USING (user_id = auth.uid()
--          OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- ⚠️ C2. pricing_board_settings  (live: pbs_select_auth USING (true))
--    The pricing "board" has a request-based membership model
--    (BoardAccessRequestsCard) that may include roles beyond admin/manager/
--    accountant; a flat role restriction could lock out legitimate members.
-- DROP POLICY IF EXISTS pbs_select_auth ON public.pricing_board_settings;
-- CREATE POLICY pbs_select_privileged ON public.pricing_board_settings
--   FOR SELECT TO authenticated
--   USING (public.has_any_role(auth.uid(),
--          ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- ⚠️ C3. shop_settings  (live: shop_settings_read_authed USING (true))
--    Classic global display-config table. Confirmed readers are privileged
--    (pricing sale-lists, accounting, admin, didar), but high breakage risk if
--    it is ever loaded in a shared provider/layout. Confirm it is NOT needed
--    app-wide before applying.
-- DROP POLICY IF EXISTS shop_settings_read_authed ON public.shop_settings;
-- CREATE POLICY shop_settings_select_privileged ON public.shop_settings
--   FOR SELECT TO authenticated
--   USING (public.has_any_role(auth.uid(),
--          ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- ⚠️ C4. currency_rate_fetches  (live: crf_read USING (true))
--    Currency-rate fetch logs. Only /pricing/currency-rates reads it
--    (pricing = admin/manager/accountant). Low sensitivity (exchange rates are
--    not secret), but if the intent is pricing-only it should be tightened.
--    Confirm no lower role needs the fetch history before applying.
-- DROP POLICY IF EXISTS crf_read ON public.currency_rate_fetches;
-- CREATE POLICY crf_select_privileged ON public.currency_rate_fetches
--   FOR SELECT TO authenticated
--   USING (public.has_any_role(auth.uid(),
--          ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- ⚠️ C5. promotion_nomination_policy  (live: promo_policy_select_authed USING (true))
--    Promotion-nomination policy config. NO direct frontend .from() reader was
--    found — likely consumed by a SECURITY DEFINER RPC or the promotion flow.
--    If sales must read the policy to see nomination rules, keep open; if it is
--    only enforced server-side, tighten. Confirm the reader before applying.
-- DROP POLICY IF EXISTS promo_policy_select_authed ON public.promotion_nomination_policy;
-- CREATE POLICY promo_policy_select_privileged ON public.promotion_nomination_policy
--   FOR SELECT TO authenticated
--   USING (public.has_any_role(auth.uid(),
--          ARRAY['admin'::app_role, 'manager'::app_role]));


-- =====================================================================
-- KEEP: 23 REFERENCE / catalog / RBAC / broadcast tables — deliberately LEFT
--       permissive because lower roles MUST read them at runtime (restricting
--       them breaks the app). NOT changed by this migration:
--
--   Catalog / product:      brands, categories, category_product_attributes,
--                           product_attributes, product_attribute_groups,
--                           product_images, product_recommendation_overrides
--   Pricing / sales ref:    currencies, sale_price_types, payment_terms,
--                           waybill_custom_fields (sales create waybills),
--                           marketing_channels (sales promotion nomination)
--   RBAC:                   custom_roles, role_permissions (read by every user
--                           via the permissions cache — critical)
--   Gamification ref:       employee_leagues, league_seasons, gamification_kpis
--   Daily-mood content:     daily_mood_hafez_poems, daily_mood_questions,
--                           daily_mood_scenarios
--   Forms/validation:       validation_rules
--   Intentional broadcast:  dashboard_ticker_events (public dashboard ticker),
--                           sales_reminders (broadcast to all sales staff)
-- =====================================================================
