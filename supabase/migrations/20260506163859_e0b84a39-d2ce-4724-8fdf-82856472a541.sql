
-- 1) Mark records added automatically vs manually
ALTER TABLE public.product_suppliers
  ADD COLUMN IF NOT EXISTS auto_added boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ps_auto_added
  ON public.product_suppliers (auto_added)
  WHERE auto_added = true;

-- 2) Trigger: when a purchase price is inserted with a supplier,
--    auto-link that supplier to the product (idempotent).
CREATE OR REPLACE FUNCTION public.auto_link_supplier_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_suppliers (product_id, supplier_id, is_primary, auto_added, notes)
  VALUES (NEW.product_id, NEW.supplier_id, false, true, 'افزوده‌شده خودکار از ثبت خرید')
  ON CONFLICT (product_id, supplier_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_supplier_on_purchase ON public.purchase_prices;
CREATE TRIGGER trg_auto_link_supplier_on_purchase
AFTER INSERT ON public.purchase_prices
FOR EACH ROW EXECUTE FUNCTION public.auto_link_supplier_on_purchase();

-- 3) Cleanup function: remove auto-added supplier links if
--    a) last purchase of THIS product from THIS supplier > 100 days ago
--    b) AND no purchase from same supplier for any product of the same brand within 100 days
CREATE OR REPLACE FUNCTION public.cleanup_stale_auto_suppliers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT ps.id, ps.product_id, ps.supplier_id, p.brand_id
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.auto_added = true
  ),
  last_product_purchase AS (
    SELECT c.id,
           MAX(pp.effective_at) AS last_at
    FROM candidates c
    LEFT JOIN public.purchase_prices pp
      ON pp.product_id = c.product_id
     AND pp.supplier_id = c.supplier_id
    GROUP BY c.id
  ),
  to_remove AS (
    SELECT c.id
    FROM candidates c
    JOIN last_product_purchase lpp ON lpp.id = c.id
    WHERE (lpp.last_at IS NULL OR lpp.last_at < now() - INTERVAL '100 days')
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_prices pp2
        JOIN public.products p2 ON p2.id = pp2.product_id
        WHERE pp2.supplier_id = c.supplier_id
          AND p2.brand_id IS NOT DISTINCT FROM c.brand_id
          AND pp2.effective_at >= now() - INTERVAL '100 days'
      )
  )
  DELETE FROM public.product_suppliers ps
  USING to_remove tr
  WHERE ps.id = tr.id;

  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count;
END;
$$;

-- 4) Schedule cleanup daily at 02:00 (server time)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-stale-auto-suppliers');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-stale-auto-suppliers',
  '0 2 * * *',
  $$ SELECT public.cleanup_stale_auto_suppliers(); $$
);
