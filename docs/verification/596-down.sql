SET client_encoding TO 'UTF8';
-- Reverse 596. Does not restore price values (none were changed).

DROP TRIGGER IF EXISTS trg_torob_ops_findings_status_guard ON public.torob_ops_findings;
DROP FUNCTION IF EXISTS public.torob_ops_findings_status_guard();
DROP TRIGGER IF EXISTS trg_torob_ops_guard_auto_report ON public.torob_ops_settings;
DROP FUNCTION IF EXISTS public.torob_ops_guard_auto_report();
DROP FUNCTION IF EXISTS public.notify_torob_eye(uuid, text, text, uuid, text);

DROP TABLE IF EXISTS public.torob_link_assignments;
DROP TABLE IF EXISTS public.torob_offer_snapshots;
DROP TABLE IF EXISTS public.torob_eye_runs;

ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_enabled;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_delay_min_seconds;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_delay_max_seconds;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_cycle_hours;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_window_start_hour;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_window_end_hour;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_backoff_min_seconds;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_backoff_max_seconds;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_block_alert_hours;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_link_discovery_enabled;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_bait_page_cap;
ALTER TABLE public.torob_ops_settings DROP COLUMN IF EXISTS eye_owner_user_id;

-- Restore pre-596 view predicate (uid + viewer). Same SELECT / settlement filter.
CREATE OR REPLACE VIEW public.product_computed_prices_public
WITH (security_invoker = true) AS
SELECT src.id,
       src.product_id,
       src.sale_price_type_id,
       src.pricing_rule_id,
       src.final_sale_price,
       src.rounded_sale_price,
       src.computed_at,
       src.source
  FROM (
    SELECT product_computed_prices.id,
           product_computed_prices.product_id,
           product_computed_prices.sale_price_type_id,
           product_computed_prices.pricing_rule_id,
           product_computed_prices.final_sale_price,
           product_computed_prices.rounded_sale_price,
           product_computed_prices.computed_at,
           product_computed_prices.source
      FROM public.product_computed_prices
     WHERE product_computed_prices.settlement_type_id IS NULL
  ) src
 WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());
