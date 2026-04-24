-- Add missing performance indexes per Phase 2.1 spec
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers (name);
CREATE INDEX IF NOT EXISTS currency_rates_currency_idx ON public.currency_rates (currency);
CREATE INDEX IF NOT EXISTS currency_rates_effective_idx ON public.currency_rates (currency, effective_at DESC);
CREATE INDEX IF NOT EXISTS shipping_rules_priority_idx ON public.shipping_cost_rules (priority);
CREATE INDEX IF NOT EXISTS shipping_rules_product_type_idx ON public.shipping_cost_rules (product_type);
CREATE INDEX IF NOT EXISTS purchase_prices_product_idx ON public.purchase_prices (product_id);
CREATE INDEX IF NOT EXISTS purchase_prices_effective_idx ON public.purchase_prices (product_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS snapshots_product_idx ON public.price_calculation_snapshots (product_id);
CREATE INDEX IF NOT EXISTS snapshots_time_idx ON public.price_calculation_snapshots (calculated_at DESC);
CREATE INDEX IF NOT EXISTS sale_history_product_idx ON public.product_sale_price_history (product_id);
CREATE INDEX IF NOT EXISTS sale_history_time_idx ON public.product_sale_price_history (created_at DESC);