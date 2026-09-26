SET client_encoding TO 'UTF8';
SELECT current_user;
SELECT count(*) AS public_view_n FROM public.product_computed_prices_public;
SELECT count(*) AS cash_price_products
FROM public.product_computed_prices_public pcp
JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
WHERE spt.code = 'cash_price'
  AND pcp.rounded_sale_price IS NOT NULL
  AND pcp.rounded_sale_price > 0;
