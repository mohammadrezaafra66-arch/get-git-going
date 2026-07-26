-- Phase 1 — low-risk data/config activation (items 157, 162, 192 + env role-name fix)
-- Config-only UPDATEs on existing rows. No schema change, no data destruction. Idempotent.
BEGIN;

-- Step 1: fix role-name mismatch. role_permissions seeded 'purchasing_expert'
-- but the app_role enum value is 'purchase_specialist', so has_dynamic_permission's
-- join (ur.role::text = rp.role_name) never matched -> purchase users hit fallback.
UPDATE public.role_permissions
   SET role_name = 'purchase_specialist'
 WHERE role_name = 'purchasing_expert';

-- Step 2: turn on the profit KPIs (item 157). Weights already in-scale with the
-- sales KPIs (total_profit=0.0002 vs total_sales=0.0001; profit_per_talk_minute=0.002
-- vs sales_per_talk_minute=0.001), so we only flip `enabled`.
UPDATE public.gamification_kpis
   SET enabled = true
 WHERE key IN ('total_profit', 'profit_per_talk_minute')
   AND enabled = false;

-- Step 3: calibrate promotion-nomination boost (item 192). Both were 0 -> boost inert.
UPDATE public.promotion_nomination_policy
   SET boost_per_nomination = COALESCE(NULLIF(boost_per_nomination, 0), 5),
       boost_cap_per_product = COALESCE(NULLIF(boost_cap_per_product, 0), 15)
 WHERE user_id IS NULL AND role IS NULL;

COMMIT;
