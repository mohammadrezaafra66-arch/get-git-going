-- Computed price shape. ASCII. No secrets.
SET client_encoding TO 'UTF8';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'product_computed_prices_public'
ORDER BY ordinal_position;

SELECT count(*) AS pcp_public_n FROM public.product_computed_prices_public;

SELECT spt.code, count(*) AS n
FROM public.product_computed_prices_public pcp
JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
GROUP BY spt.code
ORDER BY n DESC;

SELECT count(*) AS any_positive_price_products
FROM (
  SELECT DISTINCT product_id
  FROM public.product_computed_prices_public
  WHERE rounded_sale_price IS NOT NULL AND rounded_sale_price > 0
) s;

SELECT code, is_active
FROM public.sale_price_types
ORDER BY code;

SELECT
  (SELECT count(*) FROM public.products p
    WHERE p.is_active
      AND EXISTS (
        SELECT 1
        FROM public.product_computed_prices_public pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = p.id
          AND spt.code = 'cash_price'
          AND pcp.rounded_sale_price IS NOT NULL
          AND pcp.rounded_sale_price > 0
      )
  ) AS active_with_cash_price;

