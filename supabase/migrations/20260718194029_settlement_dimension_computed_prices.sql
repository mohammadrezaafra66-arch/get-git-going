-- Phase 1: add settlement dimension to computed prices.
-- Baseline rows keep settlement_type_id = NULL so every existing consumer
-- that filters `settlement_type_id IS NULL` behaves exactly as before.

ALTER TABLE public.product_computed_prices
  ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;

ALTER TABLE public.product_computed_prices
  DROP CONSTRAINT IF EXISTS product_computed_prices_settlement_fkey;
ALTER TABLE public.product_computed_prices
  ADD CONSTRAINT product_computed_prices_settlement_fkey
  FOREIGN KEY (settlement_type_id) REFERENCES public.settlement_types(id) ON DELETE CASCADE;

-- Replace the 2-column unique with a 3-column one.
-- NULLS NOT DISTINCT (PG15+) makes the baseline NULL row unique too.
ALTER TABLE public.product_computed_prices
  DROP CONSTRAINT IF EXISTS product_computed_prices_product_id_sale_price_type_id_key;

DROP INDEX IF EXISTS public.uq_pcp_product_saletype_settlement;
CREATE UNIQUE INDEX uq_pcp_product_saletype_settlement
  ON public.product_computed_prices (product_id, sale_price_type_id, settlement_type_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_pcp_settlement
  ON public.product_computed_prices (settlement_type_id);

-- Same dimension on price history so previous_price is per settlement.
ALTER TABLE public.product_sale_price_history
  ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_psph_settlement
  ON public.product_sale_price_history (product_id, sale_price_type_id, settlement_type_id, created_at DESC);

-- NOTE: after applying on the server, regenerate types.ts (or patch it manually).
