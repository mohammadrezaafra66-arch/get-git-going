SET client_encoding TO 'UTF8';
-- Reverse 597. Fails if any price_toman is outside integer range.

ALTER TABLE public.torob_offer_snapshots
  ALTER COLUMN price_toman TYPE integer;
