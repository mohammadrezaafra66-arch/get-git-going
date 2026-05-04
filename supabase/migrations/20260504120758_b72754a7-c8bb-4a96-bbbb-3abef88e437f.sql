
CREATE TABLE IF NOT EXISTS public.product_attribute_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_fa text NOT NULL,
  value_type text NOT NULL DEFAULT 'select' CHECK (value_type IN ('select','text','number')),
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pag_active ON public.product_attribute_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_pag_sort ON public.product_attribute_groups(sort_order);

DROP TRIGGER IF EXISTS trg_pag_updated_at ON public.product_attribute_groups;
CREATE TRIGGER trg_pag_updated_at
BEFORE UPDATE ON public.product_attribute_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_attribute_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_attribute_groups' AND policyname='pag_select') THEN
    CREATE POLICY pag_select ON public.product_attribute_groups
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_attribute_groups' AND policyname='pag_insert') THEN
    CREATE POLICY pag_insert ON public.product_attribute_groups
      FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_attribute_groups' AND policyname='pag_update') THEN
    CREATE POLICY pag_update ON public.product_attribute_groups
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_attribute_groups' AND policyname='pag_delete') THEN
    CREATE POLICY pag_delete ON public.product_attribute_groups
      FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND is_system = false);
  END IF;
END $$;

INSERT INTO public.product_attribute_groups (key, label_fa, value_type, is_system, sort_order)
VALUES
  ('brand',    'برند',       'select', true,  10),
  ('category', 'دسته‌بندی',   'select', true,  20),
  ('color',    'رنگ',        'select', false, 30),
  ('capacity', 'ظرفیت',      'select', false, 40),
  ('model',    'مدل',        'select', false, 50)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.product_attributes
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.product_attribute_groups(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_product_attributes_group ON public.product_attributes(group_id);

UPDATE public.product_attributes pa
SET group_id = g.id
FROM public.product_attribute_groups g
WHERE pa.group_id IS NULL
  AND g.key = pa.type::text;
