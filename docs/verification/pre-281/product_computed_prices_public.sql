 SELECT product_computed_prices.id,
    product_computed_prices.product_id,
    product_computed_prices.sale_price_type_id,
    product_computed_prices.pricing_rule_id,
    product_computed_prices.final_sale_price,
    product_computed_prices.rounded_sale_price,
    product_computed_prices.computed_at,
    product_computed_prices.source
   FROM product_computed_prices
  WHERE product_computed_prices.settlement_type_id IS NULL;
