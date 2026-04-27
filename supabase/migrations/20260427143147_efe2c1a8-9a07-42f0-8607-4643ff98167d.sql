
-- Ensure helper exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 5.1 Extend suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'medium';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_trust_level_check') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_trust_level_check CHECK (trust_level IN ('low','medium','high'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_status_check') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_status_check CHECK (status IN ('pending','active','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON public.suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_trust ON public.suppliers(trust_level);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON public.suppliers(created_by);

-- 5.2 product_suppliers
CREATE TABLE IF NOT EXISTS public.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_ps_product ON public.product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS idx_ps_supplier ON public.product_suppliers(supplier_id);

-- 5.3 RLS suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_select_authed ON public.suppliers;
DROP POLICY IF EXISTS suppliers_insert_authed ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update_privileged ON public.suppliers;
DROP POLICY IF EXISTS suppliers_delete_privileged ON public.suppliers;

CREATE POLICY suppliers_select_authed ON public.suppliers
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY suppliers_insert_authed ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY suppliers_update_privileged ON public.suppliers
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

CREATE POLICY suppliers_delete_privileged ON public.suppliers
  FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

-- 5.4 RLS product_suppliers
ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ps_select_authed ON public.product_suppliers;
DROP POLICY IF EXISTS ps_write_privileged ON public.product_suppliers;

CREATE POLICY ps_select_authed ON public.product_suppliers
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY ps_write_privileged ON public.product_suppliers
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

-- updated_at trigger
DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5.5 Audit triggers for suppliers
CREATE OR REPLACE FUNCTION public.audit_suppliers_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'supplier_created', 'supplier', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'name', NEW.name, 'contact_name', NEW.contact_name, 'phone', NEW.phone,
      'city', NEW.city, 'trust_level', NEW.trust_level, 'status', NEW.status
    )
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_suppliers_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('supplier_status_changed', 'supplier', NEW.id::text, auth.uid(),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN v_diff := v_diff || jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', NEW.name)); END IF;
  IF NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN v_diff := v_diff || jsonb_build_object('contact_name', jsonb_build_object('old', OLD.contact_name, 'new', NEW.contact_name)); END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN v_diff := v_diff || jsonb_build_object('phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone)); END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN v_diff := v_diff || jsonb_build_object('city', jsonb_build_object('old', OLD.city, 'new', NEW.city)); END IF;
  IF NEW.trust_level IS DISTINCT FROM OLD.trust_level THEN v_diff := v_diff || jsonb_build_object('trust_level', jsonb_build_object('old', OLD.trust_level, 'new', NEW.trust_level)); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN v_diff := v_diff || jsonb_build_object('notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes)); END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('supplier_updated', 'supplier', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS suppliers_audit_insert ON public.suppliers;
CREATE TRIGGER suppliers_audit_insert
  AFTER INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_suppliers_insert();

DROP TRIGGER IF EXISTS suppliers_audit_update ON public.suppliers;
CREATE TRIGGER suppliers_audit_update
  AFTER UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_suppliers_update();

-- 5.6 Audit triggers for product_suppliers
CREATE OR REPLACE FUNCTION public.audit_product_suppliers_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES ('product_supplier_linked', 'product_supplier', NEW.id::text, auth.uid(),
    jsonb_build_object('product_id', NEW.product_id, 'supplier_id', NEW.supplier_id));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_product_suppliers_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES ('product_supplier_unlinked', 'product_supplier', OLD.id::text, auth.uid(),
    jsonb_build_object('product_id', OLD.product_id, 'supplier_id', OLD.supplier_id));
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS product_suppliers_audit_insert ON public.product_suppliers;
CREATE TRIGGER product_suppliers_audit_insert
  AFTER INSERT ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_product_suppliers_insert();

DROP TRIGGER IF EXISTS product_suppliers_audit_delete ON public.product_suppliers;
CREATE TRIGGER product_suppliers_audit_delete
  AFTER DELETE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_product_suppliers_delete();
