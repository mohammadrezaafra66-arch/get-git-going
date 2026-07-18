-- The "_public" sale-price view is the intentional safe read surface:
-- it exposes ONLY non-sensitive columns (no margin_amount, no purchase_price_toman,
-- no input_purchase_price, no shipping_cost, no currency_rate, no computed_by).
--
-- Make it a security-definer view so every authenticated user (including `viewer`,
-- who has pricing.can_view = false) can read sale prices, while the base table
-- public.product_computed_prices stays RLS-locked and keeps margins protected.
--
-- anon MUST NOT be able to read this: the anon key ships in the public frontend bundle.
ALTER VIEW public.product_computed_prices_public SET (security_invoker = false);

REVOKE ALL ON public.product_computed_prices_public FROM anon;
GRANT SELECT ON public.product_computed_prices_public TO authenticated;
