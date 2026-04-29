
-- 1) Extend write RLS to include accountant
DROP POLICY IF EXISTS "manager admin write brands" ON public.brands;
CREATE POLICY "manage brands admin manager accountant"
  ON public.brands FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS "manager admin write categories" ON public.categories;
CREATE POLICY "manage categories admin manager accountant"
  ON public.categories FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS "change_reasons_write" ON public.price_change_reasons;
CREATE POLICY "manage change_reasons admin manager accountant"
  ON public.price_change_reasons FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- 2) Audit triggers
CREATE OR REPLACE FUNCTION public.audit_brands()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'brands', new.id::text, 'brand_created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'brands', new.id::text, 'brand_status_changed',
        jsonb_build_object('name', new.name, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'brands', new.id::text, 'brand_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_brands ON public.brands;
CREATE TRIGGER trg_audit_brands
  AFTER INSERT OR UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.audit_brands();

CREATE OR REPLACE FUNCTION public.audit_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'categories', new.id::text, 'category_created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'parent_id', new.parent_id, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'categories', new.id::text, 'category_status_changed',
        jsonb_build_object('name', new.name, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'categories', new.id::text, 'category_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_categories ON public.categories;
CREATE TRIGGER trg_audit_categories
  AFTER INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_categories();

CREATE OR REPLACE FUNCTION public.audit_price_change_reasons()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_created',
      jsonb_build_object('title', new.title, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_status_changed',
        jsonb_build_object('title', new.title, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_price_change_reasons ON public.price_change_reasons;
CREATE TRIGGER trg_audit_price_change_reasons
  AFTER INSERT OR UPDATE ON public.price_change_reasons
  FOR EACH ROW EXECUTE FUNCTION public.audit_price_change_reasons();
