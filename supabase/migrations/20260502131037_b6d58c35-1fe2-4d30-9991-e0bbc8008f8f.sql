CREATE TABLE IF NOT EXISTS public.category_product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  label_fa text NOT NULL,
  input_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  use_in_product_name boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  help_text text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpa_input_type_chk CHECK (input_type IN ('text','number','select','boolean','date')),
  CONSTRAINT cpa_attribute_key_chk CHECK (attribute_key ~ '^[a-z0-9_]+$' AND char_length(attribute_key) BETWEEN 1 AND 60),
  CONSTRAINT cpa_label_fa_len_chk CHECK (char_length(label_fa) BETWEEN 1 AND 120),
  CONSTRAINT cpa_help_text_len_chk CHECK (help_text IS NULL OR char_length(help_text) <= 500),
  CONSTRAINT cpa_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT cpa_options_is_array_chk CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT cpa_unique_category_key UNIQUE (category_id, attribute_key)
);

CREATE INDEX IF NOT EXISTS cpa_category_active_idx
  ON public.category_product_attributes (category_id, is_active, sort_order);

ALTER TABLE public.category_product_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpa_read_authed" ON public.category_product_attributes;
CREATE POLICY "cpa_read_authed"
  ON public.category_product_attributes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cpa_write_admin_manager" ON public.category_product_attributes;
CREATE POLICY "cpa_write_admin_manager"
  ON public.category_product_attributes
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE OR REPLACE FUNCTION public.touch_category_product_attributes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpa_updated_at ON public.category_product_attributes;
CREATE TRIGGER trg_cpa_updated_at
  BEFORE UPDATE ON public.category_product_attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_category_product_attributes_updated_at();