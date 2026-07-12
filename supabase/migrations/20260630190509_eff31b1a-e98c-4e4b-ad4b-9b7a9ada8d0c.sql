
-- 1) Add is_system_default flag to pricing_rules
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS is_system_default boolean NOT NULL DEFAULT false;

-- Ensure only ONE active system-default row can exist
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_one_system_default
  ON public.pricing_rules ((1))
  WHERE is_system_default = true;

-- 2) Seed the catch-all fallback rule (only if none exists yet)
INSERT INTO public.pricing_rules (
  name, rule_name, version, is_active, priority,
  conditions, actions,
  product_type, category_id, brand_id,
  min_purchase_price_toman, max_purchase_price_toman,
  settlement_type_id, sale_price_type_id,
  margin_type, margin_value, fixed_margin_value,
  is_system_default
)
SELECT
  'قانون پیش‌فرض سیستم',
  'قانون پیش‌فرض سیستم',
  1, true, 9999,
  '{}'::jsonb, '{}'::jsonb,
  NULL, NULL, NULL,
  NULL, NULL,
  NULL, NULL,
  'percent'::public.margin_type, 15, NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_rules WHERE is_system_default = true
);

-- 3) Seed holding-period settings (idempotent — only insert if missing)
INSERT INTO public.shop_settings (key, value)
SELECT k, v FROM (
  VALUES
    ('holding_tier1_days',        '30'),
    ('holding_tier2_days',        '60'),
    ('holding_tier3_days',        '90'),
    ('holding_tier1_margin_add',  '0'),
    ('holding_tier2_margin_add',  '2'),
    ('holding_tier3_margin_add',  '5'),
    ('holding_tier4_margin_add',  '10')
) AS s(k, v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_settings ss WHERE ss.key = s.k
);
