-- Enum for attribute types
DO $$ BEGIN
  CREATE TYPE public.product_attribute_type AS ENUM ('brand', 'category', 'color', 'capacity', 'model');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.product_attribute_type NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique name per type (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS product_attributes_type_name_unique
  ON public.product_attributes (type, lower(name));

CREATE INDEX IF NOT EXISTS product_attributes_type_active_idx
  ON public.product_attributes (type, is_active);

-- Updated-at trigger reuse
CREATE OR REPLACE FUNCTION public.touch_product_attributes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_attributes_updated_at ON public.product_attributes;
CREATE TRIGGER trg_product_attributes_updated_at
BEFORE UPDATE ON public.product_attributes
FOR EACH ROW EXECUTE FUNCTION public.touch_product_attributes_updated_at();

-- RLS
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY product_attributes_read_authed
  ON public.product_attributes
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: admin or manager
CREATE POLICY product_attributes_write_admin_manager
  ON public.product_attributes
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));