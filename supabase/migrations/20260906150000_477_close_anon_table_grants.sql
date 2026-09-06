SET client_encoding='UTF8';

-- 477 - the table half of the proacl sweep. `anon` loses every WRITE privilege on 202 tables
--       and SELECT on 188 of the 199 it could read. 11 tables keep SELECT, and the list of 11
--       is DERIVED four different ways rather than chosen.
--
-- ASCII-ONLY BY DESIGN. This file changes no policy, no body, and no data.
--
-- 476 closed the FUNCTION grants. This is the same defect one catalogue over: `anon` was
-- granted table privileges wholesale and nobody ever revoked them.
--
-- ============================================================================
-- 0. WHAT WAS MEASURED, LIVE, ON 2026-09-06 (afrakala-lan-db / database `afrakala`)
-- ============================================================================
--
--   tables in schema public                                              223
--   ... anon holds ALL SEVEN privileges (S,I,U,D,T,R,G)                  198
--   ... anon holds every privilege EXCEPT SELECT                           4   (products,
--                                                                              categories,
--                                                                              sale_lists,
--                                                                              sale_list_items)
--   ... anon holds SELECT only                                             1   (marketing_channels)
--   ... anon holds nothing                                                20
--
--   => anon can write 202 tables and read 199. RLS is enabled on all 223.
--
-- ============================================================================
-- 1. THE HEADLINE, STATED PLAINLY: THIS IS HARDENING, NOT AN INCIDENT
-- ============================================================================
--
-- Every one of the 199 readable tables was probed through PostgREST as a real anonymous
-- caller, with `Prefer: count=exact`, and the result is the single most important measurement
-- in this file:
--
--   191 tables returned `Content-Range: */0`  - the grant is real, RLS returns nothing
--     5 tables returned 42501                 - already closed by a different mechanism (see 5)
--     3 tables returned ACTUAL ROWS           - brands (40), product_images (9),
--                                               profile_field_definitions (4)
--
-- So the SELECT grants are dead weight, not an open door: RLS is holding on all 191. The three
-- that do serve rows are all KEPT by this migration. Nothing an anonymous visitor can read
-- today stops working.
--
-- The same is true of the write half, and it was checked the same way rather than assumed.
-- 76 write policies apply to `anon` (either `TO PUBLIC` or naming anon explicitly). Every one
-- of them was read: each is either `USING (false)` outright, or gated on `uid()` -
-- `uid() = user_id`, `is_hr_manager(uid())`, `has_any_role(uid(), ...)`. For an anonymous
-- caller `uid()` is NULL, so every such comparison is NULL and the policy refuses. There is no
-- table an anonymous caller can currently write. Nothing that works today is being removed.
--
-- That is stated up front because the honest reason to ship this is defence in depth: RLS is
-- the only thing standing between an anonymous caller and 202 writable tables, and one
-- permissive policy written `USING (true)` on any of them turns a dead grant into a live hole.
-- `product_images` is exactly that shape today - `product_images_select TO PUBLIC USING (true)`
-- - which is why it is in the keep list rather than silently closed.
--
-- ============================================================================
-- 2. THE TWO CLASSES ARE NOT SYMMETRIC AND ARE NOT TREATED THE SAME
-- ============================================================================
--
-- WRITES - all 202, no exclusions. The write path in this application is RPC: a SECURITY
-- DEFINER function that checks the caller and then writes. No route, authenticated or not,
-- writes a table directly as `anon`. The one construct that looked like a counter-example was
-- checked and is not one: `publishProductPrices` in src/lib/pricing/publish-prices.ts declares
-- `db: SbClient = supabase` - the BROWSER anon client as its default - and it is reached from
-- the server route /api/public/hooks/process-pricing-queue. But
-- src/lib/pricing/process-recompute-queue.server.ts:102 passes `supabaseAdmin` explicitly, so
-- that path runs as service_role. The anon default only applies to browser calls, where a
-- session makes the caller `authenticated`.
--
-- ONE TABLE IN THE WRITE SET IS ITS OWN SMALL VERSION OF THE 476 STORY.
-- `product_interaction_events` is the only table where anon can INSERT and `authenticated`
-- CANNOT: relacl reads `anon=arwdDxt` against `authenticated=rwdDxt` - anon has the `a`,
-- authenticated does not. That is not an accident of this sweep, it is a half-finished one:
-- src/lib/analytics/product-interactions.functions.ts:17 states in its own header that the
-- grant "is revoked" and moves the write to the server, and line 94 does the insert through
-- `supabaseAdmin`. The revoke reached `authenticated` and never reached `anon` - the same shape
-- as migration 153 revoking PUBLIC but not anon on ai_get_provider_key, which 476 section 1a
-- documents. This file finishes it. No caller is affected: the only writer is service_role.
--
-- SELECT - 188 of 199, because SELECT is the OG-77 trap at table scale and 11 tables are
-- load-bearing. The exclusions are derived, and from FOUR independent sources rather than one:
--
--   (a) BASE TABLES OF VIEWS anon CAN READ. All 7 views `anon` can SELECT are
--       `security_invoker=true`. That matters and it is the opposite of the function case in
--       476: OG-77 records that a normal view checks RELATION access as the view's OWNER, so
--       base tables would NOT need an anon grant. A `security_invoker` view checks them as the
--       CALLER, so they do. Walked recursively (a view may select from a view), this gives
--       9 tables: academy_quiz_questions, currencies, league_settings, payment_terms,
--       presence_logs, pricing_recompute_queue, products, purchase_prices, purchases.
--
--   (b) TABLES REFERENCED BY RLS POLICIES on tables that survive (a) and (c), closed to a
--       FIXPOINT. This is the pg_policy half of the same rule 476 applied to functions, and it
--       is computed iteratively ON THE SURVIVING SET - not on all 199. That distinction is the
--       whole reason this file revokes 188 and not 175: a policy on a table that is itself
--       being closed to anon never runs for anon, so the tables it references need nothing.
--       Run to a fixpoint, (b) added ZERO tables beyond the seed.
--
--   (c) TABLES READ AS anon BY APPLICATION CODE. The catalogue cannot see a PostgREST call, so
--       the import graph of all 27 routes outside the auth-gated `_app` layout was walked
--       transitively - 81 files - and every `.from("...")` recorded with the client it uses.
--       Reachability alone is not enough and was not used as the criterion; each candidate was
--       read to find out whether it executes with no session:
--
--         src/lib/public/get-public-sale-list.ts  runs for anonymous visitors. Reads
--                                                 sale_lists, sale_list_items, products,
--                                                 brands, categories, sale_price_types.
--         src/lib/profile-fields/queries.ts       fetchActiveProfileFields runs unconditionally
--                                                 in register.tsx:83 useQuery -> reads
--                                                 profile_field_definitions while anon.
--         src/lib/auth/session.ts:104,111         profiles / user_roles - NOT anon: the
--                                                 function takes a `user` and filters
--                                                 `.eq("id", user.id)`.
--         src/lib/auth/AuthProvider.tsx:64        heartbeat opens `if (!uid) return;` - NOT anon.
--         src/lib/rbac/dynamic-permissions.ts     loadRolePermissions is called only inside
--                                                 `if (state.user && !state.rolesLoading)` - NOT anon.
--         src/lib/pricing/*                       service_role via supabaseAdmin - see above.
--
--   (d) THE EMPIRICAL ROW SCAN of section 1. This is the source that caught what the other
--       three missed: `product_images` serves 9 rows to an anonymous caller through
--       `product_images_select TO PUBLIC USING (true)`, and NO view, NO policy closure and NO
--       code path in (a)-(c) named it. Three derivations agreed with each other and were all
--       wrong together. It is kept.
--
--   The 11 kept, being the union intersected with what anon can actually read today:
--     academy_quiz_questions, brands, currencies, league_settings, payment_terms,
--     presence_logs, pricing_recompute_queue, product_images, profile_field_definitions,
--     purchase_prices, sale_price_types
--
--   products, categories, purchases, sale_lists and sale_list_items are in the derived keep
--   set but hold NO table-level anon SELECT today, so they are not in the revoke candidate set
--   and this file does not mention them again.
--
-- ============================================================================
-- 3. WHY REVOKING IS SAFE - THE SAME THREE MEASUREMENTS AS 476
-- ============================================================================
--
-- (a) NO CALLER LOSES ACCESS. Every one of the 203 anon-reachable tables carries an EXPLICIT
--     `authenticated=` and an EXPLICIT `service_role=` entry in relacl:
--
--       tables_in_scope           = 203
--       acl_null                  = 0
--       no_explicit_authenticated = 0
--       no_explicit_service_role  = 0
--
-- (b) THERE IS NOTHING TO REVOKE FROM PUBLIC, AND THAT WAS MEASURED, NOT ASSUMED:
--
--       has_bare_PUBLIC_grant = 0
--
--     Not one table in `public` carries a PUBLIC grant. This is the exact opposite of the
--     function case, where 623 of 647 reached anon through a bare `=X` and `REVOKE ... FROM
--     anon` alone would have been a no-op. Here `FROM anon` is sufficient AND complete, so this
--     file does not issue 390 no-op `FROM PUBLIC` statements to look symmetrical with 476.
--
-- (c) NO VIEW BREAKS. The OG-77 rule, re-expressed for tables: for every `security_invoker`
--     view a role can SELECT, that role must be able to SELECT every base table the view
--     reaches. Evaluated over anon, authenticated, service_role and products_api_readonly, the
--     only broken pairs after this migration are the two that were ALREADY broken before it:
--
--       anon | effective_currencies_view | products
--       anon | vw_purchase_float         | purchases
--
--     Both pre-date this file - `products` lost table-level SELECT to migration 388 and keeps
--     only column grants, `purchases` has had none. They are recorded as the baseline in the
--     og103 gate rather than repaired here: repairing them is a visibility decision about
--     outward-facing data, which is an Owner-Gate under the OG-29 precedent, not something a
--     grant sweep gets to switch on as a side effect.
--
-- ============================================================================
-- 4. COLUMN-LEVEL GRANTS, AND WHY `REVOKE ALL` IS FORBIDDEN IN THIS FILE
-- ============================================================================
--
-- `has_table_privilege('anon', 'products', 'SELECT')` is FALSE, and `anon` reads products
-- anyway. Migrations 388 and 390 revoked the table-level grant and replaced it with
-- COLUMN-level grants - products (9 columns), categories (6 columns) - and no table-level
-- catalogue query can see them. A first probe of /rest/v1/products?select=* returned 42501 and
-- looked like proof the public feed was dead; the feed asks for exactly the nine narrowed
-- columns and returns HTTP 200 with real rows.
--
-- Those two are the ONLY column-level anon grants in the schema, and both are SELECT. So:
--
--   * every REVOKE below names its privileges EXPLICITLY. `REVOKE ALL ... FROM anon` is never
--     used, anywhere, even on tables where it would happen to be equivalent today.
--   * `products` and `categories` appear ONLY in the write list. Their column SELECT grants -
--     which are what keeps /api/public/products alive - are never touched.
--
-- ============================================================================
-- 5. FIVE TABLES THAT ALREADY REFUSE anon, AND WHY THIS FILE DID NOT CAUSE IT
-- ============================================================================
--
--   pricing_rules, product_computed_prices, shipping_cost_rules, sales_quote_send_queue,
--   sales_quote_share_logs
--
-- The first three return `42501: permission denied for function has_dynamic_permission`,
-- because their SELECT policies call `has_dynamic_permission(uid(), 'pricing', 'view')` and
-- anon cannot execute it. That looked like collateral damage from 476 and it is NOT:
-- `has_dynamic_permission` does not appear in the pre-476 census of the 647 anon-executable
-- functions, is not among the 318 application functions, is not in 476's list of 142, and its
-- proacl carries no `anon=` entry and no bare `=X`. It was never anon-executable. The check was
-- made because the alternative was shipping a claim that happened to be convenient.
--
-- All five are in the revoke list. For them this file changes only which error an anonymous
-- caller receives, not whether they are refused.
--
-- ============================================================================
-- 6. WHAT THIS FILE DOES NOT DO
-- ============================================================================
--
--   * It does not touch policies, bodies, or data. Grants only.
--   * It does not revoke from `authenticated` or `service_role` anywhere.
--   * It does not repair the public sale-list page. That page is already broken for anonymous
--     visitors: src/lib/public/get-public-sale-list.ts:37 reads `sale_lists`, anon has no grant
--     on it, PostgREST answers 42501, and `if (listErr || !list) return null` turns that into a
--     404. Measured, not inferred. Restoring it means granting anon SELECT on sale_lists and
--     sale_list_items - a new outward-facing disclosure and an Owner-Gate, not a side effect of
--     a security sweep.
--   * It does not close `product_images`. Nine rows of it are readable by anyone on the
--     internet through `product_images_select TO PUBLIC USING (true)`. That may be exactly
--     right for a product catalogue. It is raised as a question, not answered here.
--   * It does not touch the 20 tables anon already cannot reach, or the 2 column-level grants.
--
-- ============================================================================
-- 7. ORDER AND FAILURE MODE
-- ============================================================================
--
-- Grants only, so there is no ordering trap. The write revokes come first and the SELECT
-- revokes second purely so the file reads in the order of section 2; neither depends on the
-- other. If this file is wrong the symptom is 42501 for an ANONYMOUS caller on a public page -
-- the public product feed, the register form's dynamic fields, or a product image. Measurement
-- (a) is what says `authenticated` and `service_role` cannot be affected, section 1's row scan
-- is what says no anonymous read is lost, and the og103 gate re-checks both from the catalogue
-- on every run.

-- ----------------------------------------------------------------------------
-- WRITE PRIVILEGES - all 202 tables anon can currently write.
-- Privileges are named explicitly; SELECT is never included here (see section 4).
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_courses FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_lessons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_quiz_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_quiz_questions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_quizzes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.academy_user_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.achievements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_conversations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_generated_content FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_provider_health FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_providers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_usage_routes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.appeal_reviewers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asan_control_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asan_export_numbers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asan_import_batches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asan_import_person_rows FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asan_import_product_rows FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_artifacts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_checkpoints FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_driver_outputs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_job_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_log_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_modules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_worker_heartbeats FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.automation_workers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bank_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bot_api_key_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bot_api_key_label_access FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bot_api_key_table_access FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bot_api_keys FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.bot_api_usage_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.brands FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.call_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.capital_allocation_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.categories FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.category_product_attributes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.credit_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.credit_score_snapshots FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.credit_scoring_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.currencies FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.currency_rate_fetches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.currency_rates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.currency_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.custom_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customer_credit_balance FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customer_credit_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customer_credit_profile FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.daily_mood_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.daily_mood_hafez_poems FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.daily_mood_questions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.daily_mood_scenarios FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dashboard_ticker_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.delivery_receipt_status_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.delivery_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.didar_activities FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.didar_import_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.document_attachments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.document_numbers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.document_status_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.documents FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dual_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_entity_scores FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_parameter_weights FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_scoring_parameters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_table_cells FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_table_columns FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_table_row_counters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_table_rows FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dynamic_tables FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_achievements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_leagues FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_level_up_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_mission_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_score_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_scores FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_streaks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.external_parties FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.feedback FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.feedback_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.gamification_kpi_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.gamification_kpis FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.gamification_rewards FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inquiries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inquiry_price_cache FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inquiry_replies FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inquiry_status_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inquiry_transfers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.invoice_workflow_stages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.journal_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.journal_lines FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.knowledge_confirmations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.knowledge_document_chunks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.knowledge_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.knowledge_documents_backup_20260722 FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.league_seasons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.league_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_indicators FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_product_match_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_product_matches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_rate_ingestion_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_rate_source_mappings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_rate_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.market_rate_ticks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.message_embeddings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.messenger_attachments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.messenger_group_members FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.messenger_groups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.messenger_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.messenger_read_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.missions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notification_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notification_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_receipt_custom_fields FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_receipt_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_receipt_links FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_terms FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_vouchers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.penalty_appeals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.performance_penalties FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_context_links FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_field_definitions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_field_values FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_identifiers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_merge_candidates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.person_merge_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.persons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.phone_collisions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.presence_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.price_alert_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.price_alert_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.price_calculation_snapshots FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.price_change_reasons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pricing_board_access_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pricing_board_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pricing_board_viewer_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pricing_recompute_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pricing_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_attribute_groups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_attributes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_category_attribute_values FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_computed_prices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_images FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_interaction_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_label_links FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_labels FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_owner_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_recommendation_overrides FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_sale_price_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_sku_counters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_suppliers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_video_chain FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_video_chain_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profile_field_definitions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profile_field_values FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.promotion_nomination_policy FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.promotion_nominations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.purchase_prices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.purchase_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.purchase_request_status_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.recent_purchase_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.role_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sale_list_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sale_list_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sale_lists FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sale_price_types FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_quote_counters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_quote_send_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_quote_share_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_reminders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.score_snapshots FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.settlement_types FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.shipping_cost_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.shop_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.staff_daily_performance_metrics FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.stock_alert_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.stock_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.stock_transfer_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.stock_transfers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.suppliers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.tasks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.validation_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.visitors FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.warehouse_stock FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.warehouses FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.waybill_number_counter FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.workflow_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_dynamic_parameter_weights_backup_142 FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_dynamic_parameter_weights_backup_20260722 FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_knowledge_articles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_price_list_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.zz_retired_price_lists FROM anon;

-- ----------------------------------------------------------------------------
-- SELECT - 188 of the 199. The 11 named in section 2 are NOT here.
-- ----------------------------------------------------------------------------
REVOKE SELECT ON TABLE public.academy_courses FROM anon;
REVOKE SELECT ON TABLE public.academy_lessons FROM anon;
REVOKE SELECT ON TABLE public.academy_quiz_attempts FROM anon;
REVOKE SELECT ON TABLE public.academy_quizzes FROM anon;
REVOKE SELECT ON TABLE public.academy_user_progress FROM anon;
REVOKE SELECT ON TABLE public.achievements FROM anon;
REVOKE SELECT ON TABLE public.ai_conversations FROM anon;
REVOKE SELECT ON TABLE public.ai_generated_content FROM anon;
REVOKE SELECT ON TABLE public.ai_provider_health FROM anon;
REVOKE SELECT ON TABLE public.ai_providers FROM anon;
REVOKE SELECT ON TABLE public.ai_usage_routes FROM anon;
REVOKE SELECT ON TABLE public.appeal_reviewers FROM anon;
REVOKE SELECT ON TABLE public.asan_control_accounts FROM anon;
REVOKE SELECT ON TABLE public.asan_export_numbers FROM anon;
REVOKE SELECT ON TABLE public.asan_import_batches FROM anon;
REVOKE SELECT ON TABLE public.asan_import_person_rows FROM anon;
REVOKE SELECT ON TABLE public.asan_import_product_rows FROM anon;
REVOKE SELECT ON TABLE public.audit_logs FROM anon;
REVOKE SELECT ON TABLE public.automation_artifacts FROM anon;
REVOKE SELECT ON TABLE public.automation_checkpoints FROM anon;
REVOKE SELECT ON TABLE public.automation_driver_outputs FROM anon;
REVOKE SELECT ON TABLE public.automation_job_runs FROM anon;
REVOKE SELECT ON TABLE public.automation_jobs FROM anon;
REVOKE SELECT ON TABLE public.automation_log_events FROM anon;
REVOKE SELECT ON TABLE public.automation_modules FROM anon;
REVOKE SELECT ON TABLE public.automation_worker_heartbeats FROM anon;
REVOKE SELECT ON TABLE public.automation_workers FROM anon;
REVOKE SELECT ON TABLE public.bank_accounts FROM anon;
REVOKE SELECT ON TABLE public.bot_api_key_audit_log FROM anon;
REVOKE SELECT ON TABLE public.bot_api_key_label_access FROM anon;
REVOKE SELECT ON TABLE public.bot_api_key_table_access FROM anon;
REVOKE SELECT ON TABLE public.bot_api_keys FROM anon;
REVOKE SELECT ON TABLE public.bot_api_usage_logs FROM anon;
REVOKE SELECT ON TABLE public.call_logs FROM anon;
REVOKE SELECT ON TABLE public.capital_allocation_ledger FROM anon;
REVOKE SELECT ON TABLE public.category_product_attributes FROM anon;
REVOKE SELECT ON TABLE public.credit_requests FROM anon;
REVOKE SELECT ON TABLE public.credit_score_snapshots FROM anon;
REVOKE SELECT ON TABLE public.credit_scoring_rules FROM anon;
REVOKE SELECT ON TABLE public.currency_rate_fetches FROM anon;
REVOKE SELECT ON TABLE public.currency_rates FROM anon;
REVOKE SELECT ON TABLE public.currency_sources FROM anon;
REVOKE SELECT ON TABLE public.custom_roles FROM anon;
REVOKE SELECT ON TABLE public.customer_credit_balance FROM anon;
REVOKE SELECT ON TABLE public.customer_credit_ledger FROM anon;
REVOKE SELECT ON TABLE public.customer_credit_profile FROM anon;
REVOKE SELECT ON TABLE public.customers FROM anon;
REVOKE SELECT ON TABLE public.daily_mood_entries FROM anon;
REVOKE SELECT ON TABLE public.daily_mood_hafez_poems FROM anon;
REVOKE SELECT ON TABLE public.daily_mood_questions FROM anon;
REVOKE SELECT ON TABLE public.daily_mood_scenarios FROM anon;
REVOKE SELECT ON TABLE public.dashboard_ticker_events FROM anon;
REVOKE SELECT ON TABLE public.delivery_receipt_status_history FROM anon;
REVOKE SELECT ON TABLE public.delivery_receipts FROM anon;
REVOKE SELECT ON TABLE public.didar_activities FROM anon;
REVOKE SELECT ON TABLE public.didar_import_log FROM anon;
REVOKE SELECT ON TABLE public.document_attachments FROM anon;
REVOKE SELECT ON TABLE public.document_numbers FROM anon;
REVOKE SELECT ON TABLE public.document_status_history FROM anon;
REVOKE SELECT ON TABLE public.documents FROM anon;
REVOKE SELECT ON TABLE public.dual_documents FROM anon;
REVOKE SELECT ON TABLE public.dynamic_entity_scores FROM anon;
REVOKE SELECT ON TABLE public.dynamic_parameter_weights FROM anon;
REVOKE SELECT ON TABLE public.dynamic_scoring_parameters FROM anon;
REVOKE SELECT ON TABLE public.dynamic_table_cells FROM anon;
REVOKE SELECT ON TABLE public.dynamic_table_columns FROM anon;
REVOKE SELECT ON TABLE public.dynamic_table_row_counters FROM anon;
REVOKE SELECT ON TABLE public.dynamic_table_rows FROM anon;
REVOKE SELECT ON TABLE public.dynamic_tables FROM anon;
REVOKE SELECT ON TABLE public.employee_achievements FROM anon;
REVOKE SELECT ON TABLE public.employee_leagues FROM anon;
REVOKE SELECT ON TABLE public.employee_level_up_events FROM anon;
REVOKE SELECT ON TABLE public.employee_mission_progress FROM anon;
REVOKE SELECT ON TABLE public.employee_profiles FROM anon;
REVOKE SELECT ON TABLE public.employee_progress FROM anon;
REVOKE SELECT ON TABLE public.employee_score_events FROM anon;
REVOKE SELECT ON TABLE public.employee_scores FROM anon;
REVOKE SELECT ON TABLE public.employee_streaks FROM anon;
REVOKE SELECT ON TABLE public.external_parties FROM anon;
REVOKE SELECT ON TABLE public.feedback FROM anon;
REVOKE SELECT ON TABLE public.feedback_items FROM anon;
REVOKE SELECT ON TABLE public.gamification_kpi_rules FROM anon;
REVOKE SELECT ON TABLE public.gamification_kpis FROM anon;
REVOKE SELECT ON TABLE public.gamification_rewards FROM anon;
REVOKE SELECT ON TABLE public.inquiries FROM anon;
REVOKE SELECT ON TABLE public.inquiry_price_cache FROM anon;
REVOKE SELECT ON TABLE public.inquiry_replies FROM anon;
REVOKE SELECT ON TABLE public.inquiry_status_history FROM anon;
REVOKE SELECT ON TABLE public.inquiry_transfers FROM anon;
REVOKE SELECT ON TABLE public.invoice_workflow_stages FROM anon;
REVOKE SELECT ON TABLE public.journal_entries FROM anon;
REVOKE SELECT ON TABLE public.journal_lines FROM anon;
REVOKE SELECT ON TABLE public.knowledge_confirmations FROM anon;
REVOKE SELECT ON TABLE public.knowledge_document_chunks FROM anon;
REVOKE SELECT ON TABLE public.knowledge_documents FROM anon;
REVOKE SELECT ON TABLE public.knowledge_documents_backup_20260722 FROM anon;
REVOKE SELECT ON TABLE public.league_seasons FROM anon;
REVOKE SELECT ON TABLE public.market_indicators FROM anon;
REVOKE SELECT ON TABLE public.market_product_match_events FROM anon;
REVOKE SELECT ON TABLE public.market_product_matches FROM anon;
REVOKE SELECT ON TABLE public.market_rate_ingestion_runs FROM anon;
REVOKE SELECT ON TABLE public.market_rate_source_mappings FROM anon;
REVOKE SELECT ON TABLE public.market_rate_sources FROM anon;
REVOKE SELECT ON TABLE public.market_rate_ticks FROM anon;
REVOKE SELECT ON TABLE public.marketing_channels FROM anon;
REVOKE SELECT ON TABLE public.message_embeddings FROM anon;
REVOKE SELECT ON TABLE public.messenger_attachments FROM anon;
REVOKE SELECT ON TABLE public.messenger_group_members FROM anon;
REVOKE SELECT ON TABLE public.messenger_groups FROM anon;
REVOKE SELECT ON TABLE public.messenger_messages FROM anon;
REVOKE SELECT ON TABLE public.messenger_read_receipts FROM anon;
REVOKE SELECT ON TABLE public.missions FROM anon;
REVOKE SELECT ON TABLE public.notification_events FROM anon;
REVOKE SELECT ON TABLE public.notification_queue FROM anon;
REVOKE SELECT ON TABLE public.payment_receipt_custom_fields FROM anon;
REVOKE SELECT ON TABLE public.payment_receipt_documents FROM anon;
REVOKE SELECT ON TABLE public.payment_receipt_links FROM anon;
REVOKE SELECT ON TABLE public.payment_receipts FROM anon;
REVOKE SELECT ON TABLE public.payment_vouchers FROM anon;
REVOKE SELECT ON TABLE public.penalty_appeals FROM anon;
REVOKE SELECT ON TABLE public.performance_penalties FROM anon;
REVOKE SELECT ON TABLE public.person_context_links FROM anon;
REVOKE SELECT ON TABLE public.person_field_definitions FROM anon;
REVOKE SELECT ON TABLE public.person_field_values FROM anon;
REVOKE SELECT ON TABLE public.person_identifiers FROM anon;
REVOKE SELECT ON TABLE public.person_merge_candidates FROM anon;
REVOKE SELECT ON TABLE public.person_merge_log FROM anon;
REVOKE SELECT ON TABLE public.persons FROM anon;
REVOKE SELECT ON TABLE public.phone_collisions FROM anon;
REVOKE SELECT ON TABLE public.price_alert_notifications FROM anon;
REVOKE SELECT ON TABLE public.price_alert_rules FROM anon;
REVOKE SELECT ON TABLE public.price_calculation_snapshots FROM anon;
REVOKE SELECT ON TABLE public.price_change_reasons FROM anon;
REVOKE SELECT ON TABLE public.pricing_board_access_requests FROM anon;
REVOKE SELECT ON TABLE public.pricing_board_settings FROM anon;
REVOKE SELECT ON TABLE public.pricing_board_viewer_sessions FROM anon;
REVOKE SELECT ON TABLE public.pricing_rules FROM anon;
REVOKE SELECT ON TABLE public.product_attribute_groups FROM anon;
REVOKE SELECT ON TABLE public.product_attributes FROM anon;
REVOKE SELECT ON TABLE public.product_category_attribute_values FROM anon;
REVOKE SELECT ON TABLE public.product_computed_prices FROM anon;
REVOKE SELECT ON TABLE public.product_interaction_events FROM anon;
REVOKE SELECT ON TABLE public.product_label_links FROM anon;
REVOKE SELECT ON TABLE public.product_labels FROM anon;
REVOKE SELECT ON TABLE public.product_owner_assignments FROM anon;
REVOKE SELECT ON TABLE public.product_recommendation_overrides FROM anon;
REVOKE SELECT ON TABLE public.product_sale_price_history FROM anon;
REVOKE SELECT ON TABLE public.product_sku_counters FROM anon;
REVOKE SELECT ON TABLE public.product_suppliers FROM anon;
REVOKE SELECT ON TABLE public.product_video_chain FROM anon;
REVOKE SELECT ON TABLE public.product_video_chain_events FROM anon;
REVOKE SELECT ON TABLE public.profile_field_values FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.promotion_nomination_policy FROM anon;
REVOKE SELECT ON TABLE public.promotion_nominations FROM anon;
REVOKE SELECT ON TABLE public.purchase_receipts FROM anon;
REVOKE SELECT ON TABLE public.purchase_request_status_history FROM anon;
REVOKE SELECT ON TABLE public.recent_purchase_settings FROM anon;
REVOKE SELECT ON TABLE public.role_permissions FROM anon;
REVOKE SELECT ON TABLE public.sale_list_versions FROM anon;
REVOKE SELECT ON TABLE public.sales_quote_counters FROM anon;
REVOKE SELECT ON TABLE public.sales_quote_send_queue FROM anon;
REVOKE SELECT ON TABLE public.sales_quote_share_logs FROM anon;
REVOKE SELECT ON TABLE public.sales_reminders FROM anon;
REVOKE SELECT ON TABLE public.score_snapshots FROM anon;
REVOKE SELECT ON TABLE public.settlement_types FROM anon;
REVOKE SELECT ON TABLE public.shipping_cost_rules FROM anon;
REVOKE SELECT ON TABLE public.shop_settings FROM anon;
REVOKE SELECT ON TABLE public.staff_daily_performance_metrics FROM anon;
REVOKE SELECT ON TABLE public.stock_alert_requests FROM anon;
REVOKE SELECT ON TABLE public.stock_movements FROM anon;
REVOKE SELECT ON TABLE public.stock_transfer_items FROM anon;
REVOKE SELECT ON TABLE public.stock_transfers FROM anon;
REVOKE SELECT ON TABLE public.suppliers FROM anon;
REVOKE SELECT ON TABLE public.tasks FROM anon;
REVOKE SELECT ON TABLE public.user_roles FROM anon;
REVOKE SELECT ON TABLE public.validation_rules FROM anon;
REVOKE SELECT ON TABLE public.visitors FROM anon;
REVOKE SELECT ON TABLE public.warehouse_stock FROM anon;
REVOKE SELECT ON TABLE public.warehouses FROM anon;
REVOKE SELECT ON TABLE public.waybill_number_counter FROM anon;
REVOKE SELECT ON TABLE public.workflow_settings FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_dynamic_parameter_weights_backup_142 FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_dynamic_parameter_weights_backup_20260722 FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_knowledge_articles FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_messages FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_price_list_items FROM anon;
REVOKE SELECT ON TABLE public.zz_retired_price_lists FROM anon;
