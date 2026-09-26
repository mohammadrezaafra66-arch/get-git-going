-- Where sale prices actually live. ASCII.
SET client_encoding TO 'UTF8';

SELECT count(*) AS pcp_n FROM public.product_computed_prices;

SELECT spt.code, count(*) AS n
FROM public.product_computed_prices pcp
JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
GROUP BY spt.code
ORDER BY n DESC;

SELECT count(*) AS active_with_pcp_cash
FROM public.products p
WHERE p.is_active
  AND EXISTS (
    SELECT 1
    FROM public.product_computed_prices pcp
    JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
    WHERE pcp.product_id = p.id
      AND spt.code = 'cash_price'
      AND COALESCE(pcp.rounded_sale_price, pcp.final_sale_price, 0) > 0
  );

SELECT pg_get_viewdef('public.product_computed_prices_public'::regclass, true) AS viewdef;
