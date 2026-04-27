-- Allow anonymous (public) read of published sale lists and their items
-- so that /public/sale-lists/:id can render without authentication.
-- Plus an index to speed up item lookups by sale_list_id.

-- sale_lists: public can read only when published
DROP POLICY IF EXISTS "sale_lists_public_read_published" ON public.sale_lists;
CREATE POLICY "sale_lists_public_read_published"
ON public.sale_lists
FOR SELECT
TO anon
USING (status = 'published');

-- sale_list_items: public can read items whose parent list is published
DROP POLICY IF EXISTS "sale_list_items_public_read_published" ON public.sale_list_items;
CREATE POLICY "sale_list_items_public_read_published"
ON public.sale_list_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.sale_lists sl
    WHERE sl.id = sale_list_items.sale_list_id
      AND sl.status = 'published'
  )
);

-- products / brands / categories: public read (only minimal columns are queried by the app)
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
ON public.products
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS "brands_public_read" ON public.brands;
CREATE POLICY "brands_public_read"
ON public.brands
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read"
ON public.categories
FOR SELECT
TO anon
USING (true);

-- sale_price_types: public read so we can show the price-type title
DROP POLICY IF EXISTS "sale_price_types_public_read" ON public.sale_price_types;
CREATE POLICY "sale_price_types_public_read"
ON public.sale_price_types
FOR SELECT
TO anon
USING (true);

-- Performance index for items lookup
CREATE INDEX IF NOT EXISTS idx_sale_list_items_sale_list_id_sort
  ON public.sale_list_items (sale_list_id, sort_order);