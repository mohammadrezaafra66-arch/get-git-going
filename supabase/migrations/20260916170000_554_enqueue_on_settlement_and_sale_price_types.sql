-- =========================================================
-- 554: Enqueue pricing recompute when settlement_types or
-- sale_price_types change (PRICE-RT gap close).
-- publishProductPrices iterates every active type × settlement;
-- without these triggers a catalog change left prices stale
-- until a human pressed batch publish.
-- =========================================================
SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_settlement_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_product_ids uuid[];
  v_reason text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
    v_reason := 'settlement_type_removed';
  ELSE
    r := NEW;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.days IS NOT DISTINCT FROM OLD.days
         AND NEW.code IS NOT DISTINCT FROM OLD.code
      THEN
        RETURN NEW;
      END IF;
    END IF;
    v_reason := CASE
      WHEN TG_OP = 'INSERT' AND NEW.is_active THEN 'settlement_type_activated'
      WHEN TG_OP = 'UPDATE' AND NEW.is_active AND NOT OLD.is_active THEN 'settlement_type_activated'
      WHEN TG_OP = 'UPDATE' AND NOT NEW.is_active AND OLD.is_active THEN 'settlement_type_deactivated'
      ELSE 'settlement_type_changed'
    END;
  END IF;

  SELECT array_agg(p.id)
  INTO v_product_ids
  FROM public.products p
  WHERE p.is_active = true;

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, v_reason, 'settlement_types', r.id, NULL, 110
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trg_enqueue_on_settlement_type_change() IS
  '554: Enqueue all active products when a settlement type changes dimensions that affect publishProductPrices.';

DROP TRIGGER IF EXISTS trg_prq_settlement_types ON public.settlement_types;
CREATE TRIGGER trg_prq_settlement_types
AFTER INSERT OR UPDATE OR DELETE ON public.settlement_types
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_settlement_type_change();

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_sale_price_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_product_ids uuid[];
  v_reason text;
  v_spt uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
    v_reason := 'sale_price_type_removed';
    v_spt := OLD.id;
  ELSE
    r := NEW;
    v_spt := NEW.id;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.max_settlement_days IS NOT DISTINCT FROM OLD.max_settlement_days
         AND NEW.code IS NOT DISTINCT FROM OLD.code
      THEN
        RETURN NEW;
      END IF;
    END IF;
    v_reason := CASE
      WHEN TG_OP = 'INSERT' AND NEW.is_active THEN 'sale_price_type_activated'
      WHEN TG_OP = 'UPDATE' AND NEW.is_active AND NOT OLD.is_active THEN 'sale_price_type_activated'
      WHEN TG_OP = 'UPDATE' AND NOT NEW.is_active AND OLD.is_active THEN 'sale_price_type_deactivated'
      ELSE 'sale_price_type_changed'
    END;
  END IF;

  SELECT array_agg(p.id)
  INTO v_product_ids
  FROM public.products p
  WHERE p.is_active = true;

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, v_reason, 'sale_price_types', r.id, v_spt, 110
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trg_enqueue_on_sale_price_type_change() IS
  '554: Enqueue all active products when a sale price type changes dimensions that affect publishProductPrices.';

DROP TRIGGER IF EXISTS trg_prq_sale_price_types ON public.sale_price_types;
CREATE TRIGGER trg_prq_sale_price_types
AFTER INSERT OR UPDATE OR DELETE ON public.sale_price_types
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_sale_price_type_change();
