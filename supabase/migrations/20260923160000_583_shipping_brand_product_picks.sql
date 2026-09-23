SET client_encoding = 'UTF8';

-- 583 — brand-scoped shipping rules with a product pick-list,
-- and enqueue only those products (not every SKU of the brand).

CREATE TABLE IF NOT EXISTS public.shipping_cost_rule_products (
  rule_id uuid NOT NULL REFERENCES public.shipping_cost_rules(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rule_products_product
  ON public.shipping_cost_rule_products (product_id);

COMMENT ON TABLE public.shipping_cost_rule_products IS
  'Products selected on a brand-scoped shipping rule. The rule amount applies only to these rows.';

ALTER TABLE public.shipping_cost_rule_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_rule_products_read ON public.shipping_cost_rule_products;
CREATE POLICY shipping_rule_products_read ON public.shipping_cost_rule_products
  FOR SELECT TO public
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]));

DROP POLICY IF EXISTS shipping_rule_products_write ON public.shipping_cost_rule_products;
CREATE POLICY shipping_rule_products_write ON public.shipping_cost_rule_products
  FOR ALL TO public
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_cost_rule_products TO authenticated;
REVOKE ALL ON public.shipping_cost_rule_products FROM anon;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_shipping_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_product_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.cost_type IS NOT DISTINCT FROM OLD.cost_type
         AND NEW.cost_value IS NOT DISTINCT FROM OLD.cost_value
         AND NEW.cost_currency IS NOT DISTINCT FROM OLD.cost_currency
         AND NEW.product_type IS NOT DISTINCT FROM OLD.product_type
         AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
         AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id
         AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
         AND NEW.priority IS NOT DISTINCT FROM OLD.priority
         AND NEW.min_purchase_price IS NOT DISTINCT FROM OLD.min_purchase_price
         AND NEW.max_purchase_price IS NOT DISTINCT FROM OLD.max_purchase_price
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(product_id)
      INTO v_product_ids
      FROM public.shipping_cost_rule_products
     WHERE rule_id = r.id;
  ELSE
    SELECT array_agg(product_id)
      INTO v_product_ids
      FROM public.shipping_cost_rule_products
     WHERE rule_id = r.id;
  END IF;

  IF r.product_id IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      ARRAY[r.product_id], 'shipping_rule_changed', 'shipping_cost_rules',
      r.id, NULL, 110
    );
  ELSIF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, 'shipping_rule_changed', 'shipping_cost_rules',
      r.id, NULL, 110
    );
  ELSIF r.brand_id IS NOT NULL AND r.category_id IS NULL AND r.product_id IS NULL THEN
    -- Brand + pick-list: products land in shipping_cost_rule_products; enqueue there.
    RETURN COALESCE(NEW, OLD);
  ELSE
    SELECT array_agg(p.id)
    INTO v_product_ids
    FROM public.products p
    WHERE p.is_active = true
      AND (r.product_type IS NULL OR p.product_type = r.product_type)
      AND (r.category_id IS NULL OR p.category_id = r.category_id)
      AND (r.brand_id IS NULL OR p.brand_id = r.brand_id);

    IF v_product_ids IS NOT NULL THEN
      PERFORM public.enqueue_pricing_recompute(
        v_product_ids, 'shipping_rule_changed', 'shipping_cost_rules',
        r.id, NULL, 110
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_shipping_rule_product_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rule uuid;
  _pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _rule := OLD.rule_id;
    _pid := OLD.product_id;
  ELSE
    _rule := NEW.rule_id;
    _pid := NEW.product_id;
  END IF;

  PERFORM public.enqueue_pricing_recompute(
    ARRAY[_pid], 'shipping_rule_changed', 'shipping_cost_rules',
    _rule, NULL, 110
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prq_shipping_rules ON public.shipping_cost_rules;
CREATE TRIGGER trg_prq_shipping_rules
AFTER INSERT OR UPDATE ON public.shipping_cost_rules
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_shipping_rule_change();

DROP TRIGGER IF EXISTS trg_prq_shipping_rules_del ON public.shipping_cost_rules;
CREATE TRIGGER trg_prq_shipping_rules_del
BEFORE DELETE ON public.shipping_cost_rules
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_shipping_rule_change();

DROP TRIGGER IF EXISTS trg_prq_shipping_rule_products ON public.shipping_cost_rule_products;
CREATE TRIGGER trg_prq_shipping_rule_products
AFTER INSERT OR DELETE ON public.shipping_cost_rule_products
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_shipping_rule_product_change();

INSERT INTO supabase_migrations.schema_migrations (version, inserted_at)
SELECT '20260923160000', now()
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923160000'
 );
