-- AFRA-20260517-SECURITY-U01-S03
-- Prerequisite RLS hardening before Persons Core (Phase 2).
-- Removes broad "any authenticated can SELECT" leaks on supplier-sensitive
-- tables and replaces them with role-scoped SELECT policies using existing
-- RBAC helpers (has_any_role, has_dynamic_permission, is_product_owner).
-- No schema change. No data change. Write policies are preserved as-is.

-- ============================================================
-- suppliers
-- ============================================================
DROP POLICY IF EXISTS "all authenticated read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select_authed" ON public.suppliers;

-- Role-scoped SELECT (admin/manager/accountant). The existing
-- "suppliers_select_dynamic" policy (has_dynamic_permission) is preserved
-- as a permissive sibling for users explicitly granted suppliers.view.
CREATE POLICY "suppliers_select_role_scoped"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(
      auth.uid(),
      ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]
    )
  );

-- ============================================================
-- product_suppliers
-- ============================================================
DROP POLICY IF EXISTS "ps_select_authed" ON public.product_suppliers;

CREATE POLICY "ps_select_role_scoped"
  ON public.product_suppliers
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(
      auth.uid(),
      ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]
    )
  );

-- ============================================================
-- purchases
-- ============================================================
DROP POLICY IF EXISTS "all authenticated read purchases" ON public.purchases;

CREATE POLICY "purchases_select_role_scoped"
  ON public.purchases
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(
      auth.uid(),
      ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]
    )
  );

-- ============================================================
-- purchase_prices
-- ============================================================
-- Old policy granted SELECT to 'sales' via OR — that is the leak.
-- Replacement keeps product-owner scoping and admin/manager/accountant only.
-- The existing "purchase_prices_select_dynamic_sensitive" policy
-- (has_dynamic_permission(..., 'pricing', 'view_sensitive')) is preserved.
DROP POLICY IF EXISTS "owners_select_purchase_prices" ON public.purchase_prices;

CREATE POLICY "owners_select_purchase_prices"
  ON public.purchase_prices
  FOR SELECT
  TO authenticated
  USING (
    is_product_owner(auth.uid(), product_id)
    OR has_any_role(
      auth.uid(),
      ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]
    )
  );

-- RLS remains enabled on all four tables (already enabled). No ENABLE/DISABLE
-- statements issued to keep the change minimal and reversible.