-- 1) Helper: dynamic permission check used inside RLS policies
CREATE OR REPLACE FUNCTION public.has_dynamic_permission(
  _user_id uuid,
  _module text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _col text;
  _matched boolean;
  _exists boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin shortcut
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) THEN
    RETURN true;
  END IF;

  _col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'create' THEN 'can_create'
    WHEN 'update' THEN 'can_update'
    WHEN 'delete' THEN 'can_delete'
    WHEN 'approve' THEN 'can_approve'
    WHEN 'export' THEN 'can_export'
    WHEN 'view_sensitive' THEN 'can_view_sensitive'
    ELSE NULL
  END;

  IF _col IS NULL THEN
    RETURN false;
  END IF;

  -- Check if any dynamic row exists for this user's roles + module
  EXECUTE format($f$
    SELECT
      EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.user_roles ur
          ON ur.role::text = rp.role_name
        WHERE ur.user_id = $1
          AND rp.module = $2
      ),
      COALESCE(bool_or(rp.%I), false)
    FROM public.role_permissions rp
    JOIN public.user_roles ur
      ON ur.role::text = rp.role_name
    WHERE ur.user_id = $1
      AND rp.module = $2
  $f$, _col)
  INTO _exists, _matched
  USING _user_id, _module;

  IF _exists THEN
    RETURN _matched;
  END IF;

  -- Fallback: sensible defaults based on legacy static matrix
  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::app_role[]);
  ELSIF _action IN ('create','update') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]);
  ELSIF _action = 'delete' THEN
    RETURN public.has_role(_user_id, 'admin'::app_role);
  ELSIF _action IN ('approve','export') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::app_role[]);
  ELSIF _action = 'view_sensitive' THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::app_role[]);
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_dynamic_permission(uuid, text, text) TO authenticated, anon;

-- 2) PRODUCTS — augment policies to consult dynamic matrix
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='all authenticated read products') THEN
    DROP POLICY "all authenticated read products" ON public.products;
  END IF;
END $$;

CREATE POLICY "products_select_dynamic"
ON public.products FOR SELECT
TO authenticated
USING (
  auth.role() = 'authenticated'
  AND public.has_dynamic_permission(auth.uid(), 'products', 'view')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='manager admin write products') THEN
    DROP POLICY "manager admin write products" ON public.products;
  END IF;
END $$;

CREATE POLICY "products_insert_dynamic"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (public.has_dynamic_permission(auth.uid(), 'products', 'create'));

CREATE POLICY "products_update_dynamic"
ON public.products FOR UPDATE
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'products', 'update'))
WITH CHECK (public.has_dynamic_permission(auth.uid(), 'products', 'update'));

CREATE POLICY "products_delete_dynamic"
ON public.products FOR DELETE
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'products', 'delete'));

-- 3) SUPPLIERS — read requires dynamic suppliers.view (or sensitive)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppliers') THEN
    -- drop common legacy policy names if present
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' AND policyname='suppliers_read_privileged') THEN
      DROP POLICY "suppliers_read_privileged" ON public.suppliers;
    END IF;

    EXECUTE 'CREATE POLICY "suppliers_select_dynamic" ON public.suppliers FOR SELECT TO authenticated USING (public.has_dynamic_permission(auth.uid(), ''suppliers'', ''view''))';
  END IF;
END $$;

-- 4) PRICING_RULES — read tightened to dynamic pricing.view
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pricing_rules' AND policyname='all authenticated read pricing_rules') THEN
    DROP POLICY "all authenticated read pricing_rules" ON public.pricing_rules;
  END IF;
END $$;

CREATE POLICY "pricing_rules_select_dynamic"
ON public.pricing_rules FOR SELECT
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'pricing', 'view'));

-- 5) INVOICES — read requires dynamic invoices.view
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoices' AND policyname='all authenticated read invoices') THEN
    DROP POLICY "all authenticated read invoices" ON public.invoices;
  END IF;
END $$;

CREATE POLICY "invoices_select_dynamic"
ON public.invoices FOR SELECT
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'invoices', 'view'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_items' AND policyname='all authenticated read invoice_items') THEN
    DROP POLICY "all authenticated read invoice_items" ON public.invoice_items;
  END IF;
END $$;

CREATE POLICY "invoice_items_select_dynamic"
ON public.invoice_items FOR SELECT
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'invoices', 'view'));

-- 6) CUSTOMER_CREDIT_PROFILE — read requires dynamic sales.view_sensitive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_credit_profile' AND policyname='ccp_read_authed') THEN
    DROP POLICY "ccp_read_authed" ON public.customer_credit_profile;
  END IF;
END $$;

CREATE POLICY "ccp_select_dynamic_sensitive"
ON public.customer_credit_profile FOR SELECT
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'sales', 'view_sensitive'));

-- 7) PRICE_CALCULATION_SNAPSHOTS — read requires dynamic pricing.view_sensitive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='price_calculation_snapshots' AND policyname='snapshots_read') THEN
    DROP POLICY "snapshots_read" ON public.price_calculation_snapshots;
  END IF;
END $$;

CREATE POLICY "snapshots_select_dynamic_sensitive"
ON public.price_calculation_snapshots FOR SELECT
TO authenticated
USING (public.has_dynamic_permission(auth.uid(), 'pricing', 'view_sensitive'));

-- 8) PURCHASE_PRICES (if table exists) — sensitive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_prices') THEN
    -- drop likely existing read policies, then add dynamic one
    EXECUTE (
      SELECT string_agg(format('DROP POLICY %I ON public.purchase_prices;', policyname), ' ')
      FROM pg_policies
      WHERE schemaname='public' AND tablename='purchase_prices' AND cmd='SELECT'
    );
    EXECUTE 'CREATE POLICY "purchase_prices_select_dynamic_sensitive" ON public.purchase_prices FOR SELECT TO authenticated USING (public.has_dynamic_permission(auth.uid(), ''pricing'', ''view_sensitive''))';
  END IF;
END $$;

-- 9) PRODUCT_SALE_PRICE_HISTORY (if table exists) — sensitive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='product_sale_price_history') THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY %I ON public.product_sale_price_history;', policyname), ' ')
      FROM pg_policies
      WHERE schemaname='public' AND tablename='product_sale_price_history' AND cmd='SELECT'
    );
    EXECUTE 'CREATE POLICY "psph_select_dynamic_sensitive" ON public.product_sale_price_history FOR SELECT TO authenticated USING (public.has_dynamic_permission(auth.uid(), ''pricing'', ''view_sensitive''))';
  END IF;
END $$;