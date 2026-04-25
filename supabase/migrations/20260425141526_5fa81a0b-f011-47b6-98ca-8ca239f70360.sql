-- اتصال trigger های audit برای price_calculation_snapshots و product_sale_price_history

DROP TRIGGER IF EXISTS trg_audit_price_snapshots ON public.price_calculation_snapshots;
CREATE TRIGGER trg_audit_price_snapshots
AFTER INSERT ON public.price_calculation_snapshots
FOR EACH ROW EXECUTE FUNCTION public.audit_price_snapshots();

DROP TRIGGER IF EXISTS trg_audit_sale_price_history ON public.product_sale_price_history;
CREATE TRIGGER trg_audit_sale_price_history
AFTER INSERT ON public.product_sale_price_history
FOR EACH ROW EXECUTE FUNCTION public.audit_sale_price_history();

-- اطمینان از وجود trigger های قبلی برای purchase_prices, pricing_rules, currency_rates, shipping, sale_price_types
DROP TRIGGER IF EXISTS trg_audit_purchase_prices ON public.purchase_prices;
CREATE TRIGGER trg_audit_purchase_prices
AFTER INSERT OR UPDATE ON public.purchase_prices
FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_prices();

DROP TRIGGER IF EXISTS trg_audit_pricing_rules ON public.pricing_rules;
CREATE TRIGGER trg_audit_pricing_rules
AFTER INSERT OR UPDATE ON public.pricing_rules
FOR EACH ROW EXECUTE FUNCTION public.audit_pricing_rules();

DROP TRIGGER IF EXISTS trg_audit_currency_rates ON public.currency_rates;
CREATE TRIGGER trg_audit_currency_rates
AFTER INSERT OR UPDATE ON public.currency_rates
FOR EACH ROW EXECUTE FUNCTION public.audit_currency_rates();

DROP TRIGGER IF EXISTS trg_audit_shipping_rules ON public.shipping_cost_rules;
CREATE TRIGGER trg_audit_shipping_rules
AFTER INSERT OR UPDATE ON public.shipping_cost_rules
FOR EACH ROW EXECUTE FUNCTION public.audit_shipping_rules();

DROP TRIGGER IF EXISTS trg_audit_sale_price_types ON public.sale_price_types;
CREATE TRIGGER trg_audit_sale_price_types
AFTER INSERT OR UPDATE ON public.sale_price_types
FOR EACH ROW EXECUTE FUNCTION public.audit_sale_price_types();

-- index کلیدی برای query آخرین قیمت فروش بر اساس (product_id, sale_price_type_id)
CREATE INDEX IF NOT EXISTS idx_sale_history_product_type_created
  ON public.product_sale_price_history(product_id, sale_price_type_id, created_at DESC);

-- index برای snapshot بر اساس (product_id, sale_price_type_id, calculated_at)
CREATE INDEX IF NOT EXISTS idx_snapshots_product_type_calc
  ON public.price_calculation_snapshots(product_id, sale_price_type_id, calculated_at DESC);