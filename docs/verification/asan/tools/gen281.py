import subprocess, sys, os
sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"

DENY = {
 "contact and identity": [
   "customers", "suppliers", "external_parties", "visitors", "profiles",
   "person_identifiers", "person_merge_candidates",
 ],
 "sales documents": [
   "sales_quotes", "sales_quote_items", "sales_quote_share_logs", "sale_lists",
   "sale_list_items", "sale_list_versions", "sales_reminders", "inquiries",
   "inquiry_status_history", "inquiry_price_cache", "invoices",
 ],
 "payments and accounting": [
   "payment_receipts", "payment_receipt_documents", "payment_receipt_links",
   "journal_entries", "journal_lines", "bank_accounts",
 ],
 "credit and capital": [
   "customer_credit_balance", "customer_credit_ledger", "customer_credit_profile",
   "credit_requests", "credit_score_snapshots", "credit_scoring_rules",
   "customer_capital_allocations_dynamic", "salesperson_capital_allocations_dynamic",
   "capital_allocation_ledger", "daily_capital_inputs", "daily_capital_settings",
   "daily_capital_snapshots",
 ],
 "purchasing": [
   "purchases", "purchase_items", "purchase_prices", "purchase_requests",
   "purchase_request_status_history", "purchase_request_fulfillments",
   "recent_purchase_settings", "product_suppliers",
 ],
 "pricing and margins": [
   "product_computed_prices", "price_calculation_snapshots", "product_sale_price_history",
   "pricing_rules", "pricing_board_settings", "pricing_board_viewer_sessions",
   "pricing_board_access_requests", "pricing_recompute_queue", "shipping_cost_rules",
   "categories", "dynamic_tables", "dynamic_table_rows", "dynamic_table_columns",
   "dynamic_table_cells",
 ],
 "personal performance": [
   "employee_scores", "employee_score_events", "employee_level_up_events",
   "employee_progress", "staff_daily_performance_metrics", "presence_logs",
   "dynamic_entity_scores", "dynamic_parameter_weights", "dynamic_scoring_parameters",
 ],
 "configuration holding secrets, contact details and margins": [
   "shop_settings",
 ],
 "security and infrastructure": [
   "audit_logs", "bot_api_keys", "bot_api_key_audit_log", "bot_api_key_label_access",
   "bot_api_key_table_access", "bot_api_usage_logs", "user_roles", "custom_roles",
   "role_permissions", "ai_providers", "ai_provider_health", "ai_usage_routes",
   "automation_modules", "knowledge_documents_backup_20260722",
   "dynamic_parameter_weights_backup_142", "dynamic_parameter_weights_backup_20260722",
 ],
 "internal product intelligence": [
   "product_interaction_events", "product_recommendation_overrides",
   "product_owner_assignments", "promotion_nomination_policy",
 ],
}

VIEWS = ["product_computed_prices_public", "publish_recipients_view",
         "v_dynamic_customer_capital_balances", "v_dynamic_salesperson_capital_balances",
         "v_promotion_suggestions", "vw_account_balances", "vw_customer_receivables",
         "vw_supplier_payables"]


def psql(sql):
    return subprocess.run(
        ["docker", "exec", "afrakala-lan-db", "psql", "-U", "postgres", "-d", "afrakala",
         "-A", "-t", "-c", sql], capture_output=True, text=True, encoding="utf-8").stdout.strip()


existing = set(psql("select table_name from information_schema.tables "
                    "where table_schema='public' and table_type='BASE TABLE'").split("\n"))
missing = [t for g in DENY.values() for t in g if t not in existing]
assert not missing, f"not base tables: {missing}"
allv = set(psql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                "where n.nspname='public' and c.relkind='v'").split("\n"))
assert all(v in allv for v in VIEWS), [v for v in VIEWS if v not in allv]
print(f"deny tables={sum(len(g) for g in DENY.values())} views={len(VIEWS)}", file=sys.stderr)

PRE = os.path.join(ROOT, "docs/verification/pre-281")

FN = """CREATE OR REPLACE FUNCTION public.is_viewer_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- True only when `viewer` is the user's *sole* role. Roles are additive everywhere else in
  -- this system (has_any_role grants if any role qualifies); restricting on "holds viewer"
  -- would be the one place where gaining a role removes access, and it would blind the
  -- owner's own account, which holds viewer alongside admin/manager/sales/accountant.
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = _user_id AND ur.role = 'viewer')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = _user_id AND ur.role <> 'viewer');
$fn$;

REVOKE ALL ON FUNCTION public.is_viewer_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_viewer_only(uuid) TO authenticated, anon, service_role;"""

parts = ["""-- 281: restrict the `viewer` role.
--
-- A viewer-only account could read 146 of 234 relations before this migration, including
-- phone numbers, addresses, sales quotes, payment receipts, credit balances, purchase and
-- computed prices, the audit log and the privilege map itself. Measured, not assumed: a real
-- JWT was minted and every relation requested through PostgREST.
--   enumeration and reasoning: docs/asan/viewer-restriction-plan.md
--   raw measurement:           docs/verification/asan/viewer-probe-before.json
--   rollback:                  docs/verification/281-down.sql
--
-- Method: one RESTRICTIVE policy per denied table. RESTRICTIVE is AND-ed with the existing
-- permissive policies, so this can only subtract, and only for users whose sole role is
-- `viewer`. No existing policy is rewritten.
SET client_encoding='UTF8';

""" + FN + "\n"]

for group, tables in DENY.items():
    parts.append(f"\n-- {group} ({len(tables)} tables)")
    for t in sorted(tables):
        parts.append(
            f"DROP POLICY IF EXISTS viewer_restricted ON public.{t};\n"
            f"CREATE POLICY viewer_restricted ON public.{t} AS RESTRICTIVE FOR ALL TO authenticated\n"
            f"  USING (NOT public.is_viewer_only(auth.uid()))\n"
            f"  WITH CHECK (NOT public.is_viewer_only(auth.uid()));")

parts.append("""
-- Four 2026-07-22 backup tables were created with row level security never enabled at all, so
-- no policy on them -- restrictive or otherwise -- had any effect and every authenticated user
-- could read them whole. payment_receipts_backup_20260722 is a copy of the receipts ledger and
-- knowledge_documents_backup_20260722 is the only surviving copy of 42 documents. RLS is
-- switched on and each gets an admin-only read policy, which is what a repair snapshot needs.
-- service_role bypasses RLS, so server-side code is unaffected.""")
for t in ["dynamic_parameter_weights_backup_142", "dynamic_parameter_weights_backup_20260722",
          "knowledge_documents_backup_20260722", "payment_receipts_backup_20260722"]:
    parts.append(
        f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;\n"
        f"DROP POLICY IF EXISTS {t}_admin_read ON public.{t};\n"
        f"CREATE POLICY {t}_admin_read ON public.{t} FOR SELECT TO authenticated\n"
        f"  USING (public.has_role(auth.uid(), 'admin'));")

parts.append("""
-- Views carry no RLS of their own, and these eight run with their owner's rights. Each is
-- re-created as its own unchanged definition wrapped in one guard, so the inner SQL and the
-- column list are untouched. Live definitions: docs/verification/pre-281/.""")
for v in VIEWS:
    defn = open(os.path.join(PRE, f"{v}.sql"), encoding="utf-8-sig").read().replace("\r\n", "\n").strip().rstrip(";")
    assert defn, v
    inner = "\n".join("    " + l for l in defn.split("\n"))
    parts.append(
        f"CREATE OR REPLACE VIEW public.{v} AS\n"
        f"  SELECT * FROM (\n{inner}\n  ) src\n"
        f"  WHERE NOT public.is_viewer_only(auth.uid());")

parts.append("""
-- Layer 2: module gating. `warehouse` had no viewer row at all, and
-- has_dynamic_permission's fallback GRANTS 'view' to viewer when a module has no row
-- (rule 2.5), so absence was permission. Seeding it also completes viewer coverage to all
-- 20 modules, which closes the fallback for this role for good.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT 'viewer', 'warehouse', false, false, false, false, false, false, false
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions
                    WHERE role_name = 'viewer' AND module = 'warehouse');

UPDATE public.role_permissions
   SET can_view = false, can_create = false, can_update = false, can_delete = false,
       can_approve = false, can_export = false, can_view_sensitive = false, updated_at = now()
 WHERE role_name = 'viewer'
   AND module IN ('invoices', 'sales', 'purchases', 'price-lists', 'data-tables');

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'viewer_restricted' AND permissive = 'RESTRICTIVE';
  IF n <> 88 THEN RAISE EXCEPTION 'expected 88 restrictive viewer policies, found %', n; END IF;

  SELECT count(*) INTO n FROM public.role_permissions WHERE role_name = 'viewer';
  IF n <> 20 THEN RAISE EXCEPTION 'viewer must have a row for all 20 modules, found %', n; END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE role_name = 'viewer' AND can_view AND module IN
     ('invoices','sales','purchases','price-lists','data-tables','warehouse');
  IF n <> 0 THEN RAISE EXCEPTION 'restricted modules still viewable: %', n; END IF;

  -- the owner's account holds viewer alongside four other roles and must stay unrestricted
  IF public.is_viewer_only('1a15e8c6-3a83-49c2-9531-db9046d30968'::uuid) THEN
    RAISE EXCEPTION 'a multi-role account was classified as viewer-only';
  END IF;
  IF NOT public.is_viewer_only('20303d30-ab9d-4fc6-be96-ec5db1dcb647'::uuid) THEN
    RAISE EXCEPTION 'the viewer-only test account was not classified as viewer-only';
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public still have RLS disabled', n; END IF;
END
$chk$;""")

open(os.path.join(ROOT, "supabase/migrations/20260805013000_281_restrict_viewer_role.sql"),
     "w", encoding="utf-8", newline="\n").write("\n".join(parts) + "\n")

# ---------------- down ----------------
dparts = ["""-- Down script for migration 281. No BEGIN/COMMIT: the caller owns the transaction.
-- Drops the restrictive policies, restores the eight views to their pre-281 definitions and
-- puts the viewer's module flags back. The seeded viewer/warehouse row is left in place: it
-- is a row that should always have existed, and removing it would re-open the
-- has_dynamic_permission fallback.
SET client_encoding='UTF8';
"""]
for group, tables in DENY.items():
    for t in sorted(tables):
        dparts.append(f"DROP POLICY IF EXISTS viewer_restricted ON public.{t};")
for v in VIEWS:
    defn = open(os.path.join(PRE, f"{v}.sql"), encoding="utf-8-sig").read().replace("\r\n", "\n").strip().rstrip(";")
    dparts.append(f"\nCREATE OR REPLACE VIEW public.{v} AS\n{defn};")
for t in ["dynamic_parameter_weights_backup_142", "dynamic_parameter_weights_backup_20260722",
          "knowledge_documents_backup_20260722", "payment_receipts_backup_20260722"]:
    dparts.append(f"DROP POLICY IF EXISTS {t}_admin_read ON public.{t};\n"
                  f"ALTER TABLE public.{t} DISABLE ROW LEVEL SECURITY;")
dparts.append("""
UPDATE public.role_permissions
   SET can_view = true, updated_at = now()
 WHERE role_name = 'viewer'
   AND module IN ('invoices', 'sales', 'purchases', 'price-lists', 'data-tables');

DROP FUNCTION IF EXISTS public.is_viewer_only(uuid);""")

open(os.path.join(ROOT, "docs/verification/281-down.sql"), "w", encoding="utf-8", newline="\n").write("\n".join(dparts) + "\n")
print("written", file=sys.stderr)
