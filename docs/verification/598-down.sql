SET client_encoding TO 'UTF8';
-- Reverse 598 outlier flags.

DROP INDEX IF EXISTS public.idx_torob_offer_snapshots_product_kept;
ALTER TABLE public.torob_offer_snapshots DROP COLUMN IF EXISTS exclude_reason;
ALTER TABLE public.torob_offer_snapshots DROP COLUMN IF EXISTS excluded;
