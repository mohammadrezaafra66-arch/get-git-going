SET client_encoding TO 'UTF8';

-- ============================================================================
-- 598 — Torob Eye price outliers
-- Store every parsed seller price. Flag non-positive, placeholder, or
-- outside 0.3x–3x of the product median. Flagged rows stay in the table
-- and are never used for observatory min/avg/max, findings, or alerts.
-- Reverse: docs/verification/598-down.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.torob_offer_snapshots
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
ALTER TABLE public.torob_offer_snapshots
  ADD COLUMN IF NOT EXISTS exclude_reason text;

COMMENT ON COLUMN public.torob_offer_snapshots.excluded IS
  'True when price_toman is non-positive, a placeholder, or outside 0.3x-3x of the product median Torob price.';
COMMENT ON COLUMN public.torob_offer_snapshots.exclude_reason IS
  'non_positive | placeholder | below_median_band | above_median_band';

CREATE INDEX IF NOT EXISTS idx_torob_offer_snapshots_product_kept
  ON public.torob_offer_snapshots (product_id, fetched_at DESC)
  WHERE excluded IS NOT TRUE;
