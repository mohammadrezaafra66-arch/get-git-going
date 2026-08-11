-- =====================================================================
-- Migration: product_view_counts_7d  (Phase I — most-viewed sort)
--
-- Aggregates product_interaction_events over the LAST 7 DAYS, counting ALL
-- event types (no weighting), grouped by product, for a given set of product
-- ids. Used to sort the products list by «پربازدیدترین» server-side; products
-- with no events simply don't appear in the result (the caller places them at
-- the end). SECURITY DEFINER: returns only aggregate counts (no event detail).
--
-- Idempotent (CREATE OR REPLACE). supabase_admin on DB `afrakala`.
-- After applying: docker restart afrakala-lan-rest.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_product_view_counts_7d(p_product_ids uuid[])
RETURNS TABLE(product_id uuid, cnt integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.product_id, COUNT(*)::int AS cnt
  FROM public.product_interaction_events e
  WHERE e.product_id = ANY (p_product_ids)
    AND e.created_at >= now() - interval '7 days'
  GROUP BY e.product_id;
$$;

REVOKE ALL ON FUNCTION public.get_product_view_counts_7d(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_view_counts_7d(uuid[]) TO authenticated;
