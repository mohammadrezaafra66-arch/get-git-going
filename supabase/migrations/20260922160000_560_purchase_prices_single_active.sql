-- 560: one active purchase_prices row per product
-- Root cause (prod 2026-09-22 AFK-2026-00104): workbench only expired previousPriceId,
-- older is_active=true rows remained; queue recompute then picked a stale 37.5M base
-- and overwrote sale from 42.6M → 38.1M.
SET client_encoding = 'UTF8';

-- 1) Cleanup: keep newest active per product (effective_at, then created_at)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY product_id
      ORDER BY effective_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.purchase_prices
  WHERE is_active IS TRUE
)
UPDATE public.purchase_prices pp
SET
  is_active = false,
  expires_at = COALESCE(pp.expires_at, now())
FROM ranked r
WHERE pp.id = r.id
  AND r.rn > 1;

-- 2) Hard invariant
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_prices_one_active_per_product
  ON public.purchase_prices (product_id)
  WHERE is_active IS TRUE;

-- 3) BEFORE trigger: activating a row expires every other active sibling
CREATE OR REPLACE FUNCTION public.trg_purchase_prices_single_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS TRUE THEN
    UPDATE public.purchase_prices
    SET
      is_active = false,
      expires_at = COALESCE(expires_at, now())
    WHERE product_id = NEW.product_id
      AND is_active IS TRUE
      AND id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_prices_single_active ON public.purchase_prices;
CREATE TRIGGER trg_purchase_prices_single_active
  BEFORE INSERT OR UPDATE OF is_active, product_id
  ON public.purchase_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_prices_single_active();

COMMENT ON FUNCTION public.trg_purchase_prices_single_active() IS
  'Ensures at most one is_active=true purchase_prices row per product (560).';
