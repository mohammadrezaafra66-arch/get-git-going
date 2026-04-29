-- 1) New columns
ALTER TABLE public.shipping_cost_rules
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill sort_order from existing priority for continuity
UPDATE public.shipping_cost_rules SET sort_order = priority WHERE sort_order = 0 AND priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_rules_product ON public.shipping_cost_rules(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rules_brand   ON public.shipping_cost_rules(brand_id)   WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rules_category ON public.shipping_cost_rules(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rules_sort_order ON public.shipping_cost_rules(sort_order);

-- 2) RLS: allow accountant to manage shipping rules
DROP POLICY IF EXISTS "shipping_rules_write" ON public.shipping_cost_rules;
CREATE POLICY "shipping_rules_write"
  ON public.shipping_cost_rules
  FOR ALL
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- 3) Extend audit trigger to cover DELETE and status change
CREATE OR REPLACE FUNCTION public.audit_shipping_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_created',
      jsonb_build_object('title', new.title, 'cost_type', new.cost_type, 'cost_value', new.cost_value));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_status_changed',
        jsonb_build_object('old_is_active', old.is_active, 'new_is_active', new.is_active));
    END IF;
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_updated',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    RETURN new;
  ELSIF (tg_op = 'DELETE') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', old.id::text, 'shipping_cost_rule_deleted',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at'));
    RETURN old;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_shipping_rules ON public.shipping_cost_rules;
CREATE TRIGGER trg_audit_shipping_rules
AFTER INSERT OR UPDATE OR DELETE ON public.shipping_cost_rules
FOR EACH ROW EXECUTE FUNCTION public.audit_shipping_rules();