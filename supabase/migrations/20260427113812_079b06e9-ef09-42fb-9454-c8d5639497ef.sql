CREATE TABLE public.sale_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  terms_text text,
  sale_price_type_id uuid NOT NULL REFERENCES public.sale_price_types(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_lists_created_by ON public.sale_lists(created_by);
CREATE INDEX idx_sale_lists_status ON public.sale_lists(status);
CREATE INDEX idx_sale_lists_created_at ON public.sale_lists(created_at DESC);

CREATE TABLE public.sale_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_list_id uuid NOT NULL REFERENCES public.sale_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  current_price numeric(18,2) NOT NULL,
  previous_price numeric(18,2),
  change_amount numeric(18,2),
  change_percent numeric(8,2),
  stock_status text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_list_items_list ON public.sale_list_items(sale_list_id);
CREATE INDEX idx_sale_list_items_product ON public.sale_list_items(product_id);

CREATE TABLE public.sale_list_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_list_id uuid NOT NULL REFERENCES public.sale_lists(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot_data jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_list_versions_list ON public.sale_list_versions(sale_list_id);
CREATE INDEX idx_sale_list_versions_num ON public.sale_list_versions(sale_list_id, version_number);

CREATE TRIGGER trg_sale_lists_updated_at
  BEFORE UPDATE ON public.sale_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sale_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_list_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_lists_select_published_or_privileged"
  ON public.sale_lists FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE POLICY "sale_lists_insert_privileged"
  ON public.sale_lists FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) AND created_by = auth.uid());

CREATE POLICY "sale_lists_update_privileged"
  ON public.sale_lists FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE POLICY "sale_lists_delete_admin"
  ON public.sale_lists FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sale_list_items_select_via_parent"
  ON public.sale_list_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_lists sl WHERE sl.id = sale_list_items.sale_list_id
    AND (sl.status = 'published' OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))));

CREATE POLICY "sale_list_items_write_privileged"
  ON public.sale_list_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE POLICY "sale_list_versions_select_via_parent"
  ON public.sale_list_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_lists sl WHERE sl.id = sale_list_versions.sale_list_id
    AND (sl.status = 'published' OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))));

CREATE POLICY "sale_list_versions_write_privileged"
  ON public.sale_list_versions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE OR REPLACE FUNCTION public.audit_sale_lists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sale_lists', new.id::text, 'sale_list_created',
            jsonb_build_object('name', new.name, 'sale_price_type_id', new.sale_price_type_id, 'created_by', new.created_by));
    RETURN new;
  END IF;
  RETURN null;
END;
$$;

CREATE TRIGGER sale_lists_audit
  AFTER INSERT ON public.sale_lists
  FOR EACH ROW EXECUTE FUNCTION public.audit_sale_lists();
