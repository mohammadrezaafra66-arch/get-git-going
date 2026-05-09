-- Add category scoping to product_attributes (model values are category-scoped)
ALTER TABLE public.product_attributes
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_attributes_type_category_name
  ON public.product_attributes (type, category_id, name);

-- Prevent duplicate model names within the same category (case/space-insensitive)
-- Existing rows with category_id = NULL are NOT affected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_attributes_model_per_category
  ON public.product_attributes (category_id, lower(btrim(name)))
  WHERE type = 'model' AND category_id IS NOT NULL;

-- Helper RPC: find or create a model attribute scoped to a category.
-- Returns the existing row if one with the same normalized name in the same
-- category exists, otherwise inserts a new one. Never deletes or mutates
-- existing rows.
CREATE OR REPLACE FUNCTION public.find_or_create_model(
  p_name text,
  p_category_id uuid
)
RETURNS TABLE (id uuid, name text, category_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id uuid;
  v_name text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_required';
  END IF;

  -- Permission: only authenticated users with products.create may invoke
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_norm := lower(btrim(p_name));

  -- Look for existing in same category
  SELECT pa.id, pa.name INTO v_id, v_name
  FROM public.product_attributes pa
  WHERE pa.type = 'model'
    AND pa.category_id = p_category_id
    AND lower(btrim(pa.name)) = v_norm
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_name, p_category_id;
    RETURN;
  END IF;

  -- Insert new
  INSERT INTO public.product_attributes (type, name, category_id, is_active, created_by)
  VALUES ('model', btrim(p_name), p_category_id, true, auth.uid())
  RETURNING product_attributes.id, product_attributes.name INTO v_id, v_name;

  RETURN QUERY SELECT v_id, v_name, p_category_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_model(text, uuid) TO authenticated;