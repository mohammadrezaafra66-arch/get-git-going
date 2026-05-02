CREATE TABLE IF NOT EXISTS public.product_category_attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_attribute_id uuid NOT NULL REFERENCES public.category_product_attributes(id) ON DELETE CASCADE,
  value text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcav_value_len_chk CHECK (value IS NULL OR char_length(value) <= 500),
  CONSTRAINT pcav_unique_product_attr UNIQUE (product_id, category_attribute_id)
);

CREATE INDEX IF NOT EXISTS pcav_product_idx ON public.product_category_attribute_values (product_id);
CREATE INDEX IF NOT EXISTS pcav_attr_idx ON public.product_category_attribute_values (category_attribute_id);

ALTER TABLE public.product_category_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcav_select_dynamic" ON public.product_category_attribute_values;
CREATE POLICY "pcav_select_dynamic"
  ON public.product_category_attribute_values
  FOR SELECT
  TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'products'::text, 'view'::text));

DROP POLICY IF EXISTS "pcav_insert_dynamic" ON public.product_category_attribute_values;
CREATE POLICY "pcav_insert_dynamic"
  ON public.product_category_attribute_values
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'products'::text, 'create'::text)
           OR public.has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));

DROP POLICY IF EXISTS "pcav_update_dynamic" ON public.product_category_attribute_values;
CREATE POLICY "pcav_update_dynamic"
  ON public.product_category_attribute_values
  FOR UPDATE
  TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));

DROP POLICY IF EXISTS "pcav_delete_dynamic" ON public.product_category_attribute_values;
CREATE POLICY "pcav_delete_dynamic"
  ON public.product_category_attribute_values
  FOR DELETE
  TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));

CREATE OR REPLACE FUNCTION public.touch_pcav_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcav_updated_at ON public.product_category_attribute_values;
CREATE TRIGGER trg_pcav_updated_at
  BEFORE UPDATE ON public.product_category_attribute_values
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pcav_updated_at();