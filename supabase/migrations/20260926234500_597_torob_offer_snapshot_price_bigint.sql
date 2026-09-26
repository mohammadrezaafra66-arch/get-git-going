-- 597: scraped Torob prices can exceed integer (scraper bound 50e9).
-- Does not change any pricing math or existing product price values.

ALTER TABLE public.torob_offer_snapshots
  ALTER COLUMN price_toman TYPE bigint;
