SET client_encoding='UTF8';

-- 467 - the three credit-scoring tables stop handing every row to `sales`.
--
-- ASCII-ONLY BY DESIGN. This file adds no user-facing string at all: it replaces three RLS
-- policy expressions and nothing else. No function is created or replaced, so no default
-- grant is disturbed and no REVOKE belongs in this file.
--
-- ============================================================================
-- 1. WHAT IS OPEN, measured live 2026-09-06 on afrakala-lan-db / database `afrakala`
-- ============================================================================
--
--   SELECT tablename,policyname,permissive,cmd,coalesce(qual,'-'),array_to_string(roles,',')
--   FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('dynamic_entity_scores','dynamic_scoring_parameters',
--                       'dynamic_parameter_weights');
--
--   dynamic_entity_scores      | dyn_scores_read_authenticated         | PERMISSIVE | SELECT | true | authenticated
--   dynamic_scoring_parameters | dyn_scoring_params_read_authenticated | PERMISSIVE | SELECT | true | authenticated
--   dynamic_parameter_weights  | dyn_param_weights_read_authenticated  | PERMISSIVE | SELECT | true | authenticated
--
-- `qual = true` means every authenticated role. The only other policy on the read path is
-- `viewer_restricted`, and it is RESTRICTIVE:
--
--   viewer_restricted | RESTRICTIVE | ALL | (NOT is_viewer_only(auth.uid()))
--
-- RESTRICTIVE clauses are AND-ed, so that policy SUBTRACTS access and grants none. Its helper
-- is true only when `viewer` is the caller's SOLE role (read from pg_proc.prosrc, not called):
--
--   SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id=_user_id AND role =  'viewer')
--      AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=_user_id AND role <> 'viewer');
--
-- So a pure `viewer` was already refused, and `sales`, `accountant`, `manager`,
-- `purchase_specialist` and `site` all passed `NOT is_viewer_only()` and then matched
-- `qual = true`. Measured with a simulated JWT inside BEGIN..ROLLBACK, rows visible per role
-- (dynamic_entity_scores | dynamic_scoring_parameters | dynamic_parameter_weights):
--
--   BEFORE   sales 150|16|16   accountant 150|16|16   manager 150|16|16
--            admin 150|16|16   viewer 0|0|0
--
-- 150 score rows cover 11 customers and 9 salespeople, each row carrying raw_score,
-- actual_value, is_clipped, scored_by and period_month. A salesperson could read every
-- colleague's scoring row and every customer's, through the page OR through a bare
-- GET /rest/v1/dynamic_entity_scores with their own session token. Gating the routes hides
-- the page and does NOT close the PostgREST path; this file is the half that does.
--
-- ============================================================================
-- 2. WHY `admin, manager, accountant` AND NOT SOME OTHER SET
-- ============================================================================
--
-- The audience is read off the four routes that render this data, not guessed. Measured
-- 2026-09-06 by reading each route file:
--
--   src/routes/_app.sales.credit-rules.tsx:32                  requireAnyRole(admin, accountant)
--   src/routes/_app.sales_.customers_.$customerId.credit.tsx:24
--                                                              requireAnyRole(admin, manager, accountant)
--   src/routes/_app.accounting.salesperson-scoring.tsx:26       requireAnyRole(admin, accountant)
--   src/routes/_app.users.$userId.tsx:18                        requireAdmin()
--
--   union = admin, manager, accountant
--
-- No route intends `sales` to see it. The only readers in src/ are
-- src/hooks/credit/useDynamicScoring.ts and src/components/credit/DynamicScoringSection.tsx,
-- and both are mounted solely by those four routes. A third file,
-- src/components/credit/CreditZeroReasonPanel.tsx, imports only a TYPE from the hook and is
-- rendered from inside DynamicScoringSection at line 354 - it issues no query of its own.
-- There is no `credit`, `scoring` or `capital` module in role_permissions - checked, the
-- module list contains none - so these hardcoded route lists ARE the authority.
--
-- ============================================================================
-- 3. THE OTHER READERS, checked one at a time before narrowing anything
-- ============================================================================
--
--   SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND prosrc ~* '(dynamic_entity_scores|dynamic_scoring_parameters
--                                            |dynamic_parameter_weights)';
--
--   calculate_dynamic_score             | INVOKER | anon=t authenticated=t
--   compute_normalized_raw_score        | INVOKER | trigger fn (trg_a_compute_raw_score)
--   resolve_score_period                | INVOKER | anon=f authenticated=t
--   create_dynamic_scoring_parameter_v2 | DEFINER
--   upsert_dynamic_parameter_weight     | DEFINER
--
-- The two DEFINER functions are unaffected: a DEFINER body reads with the definer's identity,
-- and these tables are owned by supabase_admin with relforcerowsecurity = f, so RLS does not
-- apply to them at all. Confirmed per caller rather than assumed.
--
-- The three INVOKER functions DO see the caller's RLS, so each was traced:
--
--   * calculate_dynamic_score is called from src/hooks/credit/useDynamicScoring.ts:182 - the
--     hook mounted only by the four routes above. After this migration an admin/manager/
--     accountant caller still gets its full breakdown; a `sales` caller gets an empty
--     breakdown and a zero weighted_score instead of live figures. That is the intended
--     outcome, not a regression: `sales` was never an intended audience.
--     Its three DEFINER callers - calculate_customer_realtime_credit,
--     recompute_dynamic_capital_setting, run_daily_capital_allocation - are unaffected,
--     because an INVOKER function nested inside a DEFINER function runs with the DEFINER's
--     identity, not the original caller's.
--
--   * compute_normalized_raw_score is the BEFORE INSERT OR UPDATE trigger on
--     dynamic_entity_scores. It reads dynamic_scoring_parameters for min/max/direction and
--     RAISES if it comes back empty. Writes to dynamic_entity_scores are already restricted
--     to admin/accountant by dyn_scores_write_admin_accountant, and `accountant` has NO
--     write policy on dynamic_scoring_parameters (that one is admin/manager) - so an
--     accountant's ability to run this trigger depends ENTIRELY on the SELECT policy this
--     file rewrites. Keeping `accountant` in the new expression is therefore load-bearing:
--     dropping it would break score entry for accountants with the parameter min/max error.
--
--   * resolve_score_period reads dynamic_entity_scores only, and is reached from
--     calculate_dynamic_score - same audience, same conclusion.
--
-- No view or materialized view reads any of the three tables (pg_get_viewdef scan: empty).
--
-- ============================================================================
-- 4. WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ============================================================================
--
-- * The three WRITE policies are NOT touched. Quoted from pg_policies before the change:
--     dyn_scores_write_admin_accountant | PERMISSIVE | ALL |
--       (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
--     dyn_scoring_params_admin_write    | PERMISSIVE | ALL |
--       (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
--     dyn_param_weights_admin_write     | PERMISSIVE | ALL |
--       (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
--   They are FOR ALL, so they also contribute SELECT for their own roles; the new read
--   policy is a superset of them for those roles, so nothing narrows for a writer.
--
-- * `viewer_restricted` is NOT touched. It is RESTRICTIVE and still AND-ed on top, so a pure
--   viewer stays refused even though the new expression would not admit them anyway.
--
-- * Table-level GRANTs are NOT touched. `anon` holds arwdDxt on all three but matches no
--   PERMISSIVE policy, so it reads nothing - before or after.
--
-- * No route file is changed here. Gating the routes is Group B's row; this is the database
--   half, and it is the half that holds when someone calls PostgREST directly.
--
-- DROP POLICY + CREATE POLICY is the correct shape - a policy cannot be replaced in place.
-- This is not the CLAUDE.md rule-3 ban, which is on DROP TABLE / TRUNCATE / DELETE against
-- data. No row is read, written or removed by this file.
--
-- ============================================================================
-- 5. WHAT BREAKS IF THIS IS WRONG
-- ============================================================================
--
-- If the role list is too narrow, the customer-credit page, the credit rulebook page and the
-- salesperson-scoring page go blank for whoever was dropped, and - worse and less visibly -
-- score ENTRY starts failing for accountants through the trigger described in section 3.
-- If it is too wide, the leak this file exists to close stays open. The expression below is
-- the exact union of the four routes' own guards; it should follow a route guard changing,
-- never the other way round.
--
-- `has_any_role(uuid, text[])` is used with an explicit ::text[] cast because user_roles.role
-- is TEXT and the bare-literal form is ambiguous against the app_role overload. The same
-- expression refuses an unauthenticated caller for free: has_any_role(NULL, ...) is false,
-- because its body is an EXISTS, which is never NULL. Five live policies already use exactly
-- this shape (sale_lists, sale_list_items, daily_capital_snapshots).

-- ============================================================================
-- dynamic_entity_scores
-- ============================================================================
DROP POLICY IF EXISTS dyn_scores_read_authenticated ON public.dynamic_entity_scores;
CREATE POLICY dyn_scores_read_authenticated
  ON public.dynamic_entity_scores
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
  );

-- ============================================================================
-- dynamic_scoring_parameters
-- ============================================================================
DROP POLICY IF EXISTS dyn_scoring_params_read_authenticated ON public.dynamic_scoring_parameters;
CREATE POLICY dyn_scoring_params_read_authenticated
  ON public.dynamic_scoring_parameters
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
  );

-- ============================================================================
-- dynamic_parameter_weights
-- ============================================================================
DROP POLICY IF EXISTS dyn_param_weights_read_authenticated ON public.dynamic_parameter_weights;
CREATE POLICY dyn_param_weights_read_authenticated
  ON public.dynamic_parameter_weights
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
  );
