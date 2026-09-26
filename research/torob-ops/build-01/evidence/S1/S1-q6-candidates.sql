SET client_encoding TO 'UTF8';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='products'
  AND column_name IN ('id','name','brand_id','torob_url','is_active');

WITH priced AS (
  SELECT DISTINCT ON (p.id)
         p.id,
         p.torob_url,
         pcp.rounded_sale_price
    FROM public.products p
    JOIN public.product_computed_prices_public pcp ON pcp.product_id = p.id
    JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
   WHERE p.is_active
     AND spt.code = 'cash_price'
     AND pcp.rounded_sale_price IS NOT NULL
     AND pcp.rounded_sale_price > 0
   ORDER BY p.id, pcp.computed_at DESC
)
SELECT
  count(*) AS priced_n,
  count(*) FILTER (WHERE torob_url IS NOT NULL AND btrim(torob_url) <> '') AS priced_with_url
FROM priced;
