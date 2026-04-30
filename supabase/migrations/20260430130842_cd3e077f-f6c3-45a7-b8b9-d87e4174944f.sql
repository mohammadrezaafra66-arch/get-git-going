-- Helper: is the given user an owner of the given product?
CREATE OR REPLACE FUNCTION public.is_product_owner(_user_id uuid, _product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.product_owner_assignments
    WHERE user_id = _user_id AND product_id = _product_id
  )
$$;

-- Allow product owners to update stock_status (and other base fields) of their products.
DROP POLICY IF EXISTS "owners_update_product_stock" ON public.products;
CREATE POLICY "owners_update_product_stock" ON public.products
FOR UPDATE TO authenticated
USING (
  public.is_product_owner(auth.uid(), id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
)
WITH CHECK (
  public.is_product_owner(auth.uid(), id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
);

-- Allow product owners to insert new purchase prices for their products.
DROP POLICY IF EXISTS "owners_insert_purchase_prices" ON public.purchase_prices;
CREATE POLICY "owners_insert_purchase_prices" ON public.purchase_prices
FOR INSERT TO authenticated
WITH CHECK (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
);

-- Allow product owners to update purchase prices for their products (e.g., expire previous active row).
DROP POLICY IF EXISTS "owners_update_purchase_prices" ON public.purchase_prices;
CREATE POLICY "owners_update_purchase_prices" ON public.purchase_prices
FOR UPDATE TO authenticated
USING (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
)
WITH CHECK (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
);

-- Allow product owners to read purchase prices for their products (in case existing SELECT policies don't cover them).
DROP POLICY IF EXISTS "owners_select_purchase_prices" ON public.purchase_prices;
CREATE POLICY "owners_select_purchase_prices" ON public.purchase_prices
FOR SELECT TO authenticated
USING (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::app_role[])
);