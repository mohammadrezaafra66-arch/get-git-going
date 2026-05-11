-- =========================================================
-- PRICE-RT.1: Pricing recompute queue + dependency triggers
-- Enqueue-only. Worker/cron will be added in a later phase.
-- =========================================================

-- 1) Queue table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_recompute_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reason text NOT NULL,
  source_table text NULL,
  source_id uuid NULL,
  sale_price_type_id uuid NULL REFERENCES public.sale_price_types(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  processed_at timestamptz NULL,
  error text NULL,
  created_by uuid NULL,
  CONSTRAINT pricing_recompute_queue_status_check
    CHECK (status IN ('pending','processing','done','failed','cancelled'))
);

COMMENT ON TABLE public.pricing_recompute_queue IS
  'PRICE-RT: Queue of products needing price recomputation. Triggers only enqueue; a worker (next phase) drains and calls publishProductPrices. Manual recompute UI remains for maintenance/import/recovery.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prq_pending_pri_eq
  ON public.pricing_recompute_queue (status, priority, enqueued_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_prq_product
  ON public.pricing_recompute_queue (product_id);

CREATE INDEX IF NOT EXISTS idx_prq_reason
  ON public.pricing_recompute_queue (reason);

CREATE INDEX IF NOT EXISTS idx_prq_source
  ON public.pricing_recompute_queue (source_table, source_id);

-- Prevent duplicate pending/processing rows for same product+reason+source
CREATE UNIQUE INDEX IF NOT EXISTS uq_prq_pending_dedupe
  ON public.pricing_recompute_queue (
    product_id,
    reason,
    COALESCE(source_table, ''),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sale_price_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('pending','processing');

-- 2) RLS ---------------------------------------------------------
ALTER TABLE public.pricing_recompute_queue ENABLE ROW LEVEL SECURITY;

-- Read access for admin/manager/accountant
CREATE POLICY "prq_read_admin_manager_accountant"
  ON public.pricing_recompute_queue
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- No INSERT/UPDATE/DELETE policies → RLS denies. Only SECURITY DEFINER functions / triggers can write.

-- 3) Helper function: enqueue --------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_pricing_recompute(
  _product_ids uuid[],
  _reason text,
  _source_table text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _sale_price_type_id uuid DEFAULT NULL,
  _priority integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF _product_ids IS NULL OR array_length(_product_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.pricing_recompute_queue (
    product_id, reason, source_table, source_id, sale_price_type_id, priority, status
  )
  SELECT DISTINCT pid, _reason, _source_table, _source_id, _sale_price_type_id, _priority, 'pending'
  FROM unnest(_product_ids) AS pid
  WHERE pid IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION public.enqueue_pricing_recompute(uuid[], text, text, uuid, uuid, integer) IS
  'PRICE-RT: Idempotent enqueue helper. Never recomputes prices itself.';

REVOKE ALL ON FUNCTION public.enqueue_pricing_recompute(uuid[], text, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

-- 4) Dependency views --------------------------------------------
-- Latest active purchase price per product
CREATE OR REPLACE VIEW public.v_latest_active_purchase_prices AS
SELECT DISTINCT ON (pp.product_id)
  pp.product_id,
  pp.id AS purchase_price_id,
  pp.currency,
  pp.purchase_price,
  pp.effective_at,
  pp.expires_at
FROM public.purchase_prices pp
WHERE pp.is_active = true
  AND pp.effective_at <= now()
  AND (pp.expires_at IS NULL OR pp.expires_at > now())
ORDER BY pp.product_id, pp.effective_at DESC, pp.created_at DESC;

COMMENT ON VIEW public.v_latest_active_purchase_prices IS
  'PRICE-RT: Latest active purchase price per product (used to map currency changes to affected products).';

-- 5) Trigger: currency_rates -------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enqueue_on_currency_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
  v_reason text;
  v_product_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_currency := NEW.currency;
    v_reason := CASE WHEN NEW.is_active THEN 'currency_rate_activated' ELSE 'currency_rate_changed' END;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only react to meaningful changes
    IF NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.rate_to_toman IS NOT DISTINCT FROM OLD.rate_to_toman
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.effective_at IS NOT DISTINCT FROM OLD.effective_at
    THEN
      RETURN NEW;
    END IF;
    v_currency := NEW.currency;
    v_reason := CASE
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'currency_rate_activated'
      ELSE 'currency_rate_changed'
    END;
  ELSE
    RETURN NEW;
  END IF;

  SELECT array_agg(product_id)
  INTO v_product_ids
  FROM public.v_latest_active_purchase_prices
  WHERE currency::text = v_currency;

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, v_reason, 'currency_rates', NEW.id, NULL, 100
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prq_currency_rates ON public.currency_rates;
CREATE TRIGGER trg_prq_currency_rates
AFTER INSERT OR UPDATE ON public.currency_rates
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_currency_rate_change();

-- 6) Trigger: purchase_prices ------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enqueue_on_purchase_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
  v_pid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pid := NEW.product_id;
    v_reason := CASE WHEN NEW.is_active THEN 'purchase_price_activated' ELSE 'purchase_price_changed' END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_price IS NOT DISTINCT FROM OLD.purchase_price
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.effective_at IS NOT DISTINCT FROM OLD.effective_at
       AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
    THEN
      RETURN NEW;
    END IF;
    v_pid := NEW.product_id;
    v_reason := CASE
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'purchase_price_activated'
      WHEN NOT NEW.is_active AND OLD.is_active THEN 'purchase_price_deactivated'
      ELSE 'purchase_price_changed'
    END;
  ELSIF TG_OP = 'DELETE' THEN
    v_pid := OLD.product_id;
    v_reason := 'purchase_price_deactivated';
  END IF;

  IF v_pid IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      ARRAY[v_pid], v_reason, 'purchase_prices',
      COALESCE(NEW.id, OLD.id), NULL, 90
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prq_purchase_prices ON public.purchase_prices;
CREATE TRIGGER trg_prq_purchase_prices
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_prices
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_purchase_price_change();

-- 7) Trigger: pricing_rules --------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enqueue_on_pricing_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_product_ids uuid[];
BEGIN
  -- Use the relevant row (NEW for I/U, OLD for D)
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    -- Skip pure no-op updates
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.product_type IS NOT DISTINCT FROM OLD.product_type
         AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
         AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id
         AND NEW.sale_price_type_id IS NOT DISTINCT FROM OLD.sale_price_type_id
         AND NEW.settlement_type_id IS NOT DISTINCT FROM OLD.settlement_type_id
         AND NEW.margin_type IS NOT DISTINCT FROM OLD.margin_type
         AND NEW.margin_value IS NOT DISTINCT FROM OLD.margin_value
         AND NEW.fixed_margin_value IS NOT DISTINCT FROM OLD.fixed_margin_value
         AND NEW.priority IS NOT DISTINCT FROM OLD.priority
         AND NEW.min_purchase_price_toman IS NOT DISTINCT FROM OLD.min_purchase_price_toman
         AND NEW.max_purchase_price_toman IS NOT DISTINCT FROM OLD.max_purchase_price_toman
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Conservative: enqueue active products that match visible scope.
  -- If no scope is set, enqueue all active products.
  SELECT array_agg(p.id)
  INTO v_product_ids
  FROM public.products p
  WHERE p.is_active = true
    AND (r.product_type IS NULL OR p.product_type = r.product_type)
    AND (r.category_id IS NULL OR p.category_id = r.category_id)
    AND (r.brand_id IS NULL OR p.brand_id = r.brand_id);

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, 'pricing_rule_changed', 'pricing_rules',
      r.id, r.sale_price_type_id, 110
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prq_pricing_rules ON public.pricing_rules;
CREATE TRIGGER trg_prq_pricing_rules
AFTER INSERT OR UPDATE OR DELETE ON public.pricing_rules
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_pricing_rule_change();

-- 8) Trigger: shipping_cost_rules --------------------------------
CREATE OR REPLACE FUNCTION public.trg_enqueue_on_shipping_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_product_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.cost_type IS NOT DISTINCT FROM OLD.cost_type
         AND NEW.cost_value IS NOT DISTINCT FROM OLD.cost_value
         AND NEW.cost_currency IS NOT DISTINCT FROM OLD.cost_currency
         AND NEW.product_type IS NOT DISTINCT FROM OLD.product_type
         AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
         AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id
         AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
         AND NEW.priority IS NOT DISTINCT FROM OLD.priority
         AND NEW.min_purchase_price IS NOT DISTINCT FROM OLD.min_purchase_price
         AND NEW.max_purchase_price IS NOT DISTINCT FROM OLD.max_purchase_price
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF r.product_id IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      ARRAY[r.product_id], 'shipping_rule_changed', 'shipping_cost_rules',
      r.id, NULL, 110
    );
  ELSE
    SELECT array_agg(p.id)
    INTO v_product_ids
    FROM public.products p
    WHERE p.is_active = true
      AND (r.product_type IS NULL OR p.product_type = r.product_type)
      AND (r.category_id IS NULL OR p.category_id = r.category_id)
      AND (r.brand_id IS NULL OR p.brand_id = r.brand_id);

    IF v_product_ids IS NOT NULL THEN
      PERFORM public.enqueue_pricing_recompute(
        v_product_ids, 'shipping_rule_changed', 'shipping_cost_rules',
        r.id, NULL, 110
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prq_shipping_rules ON public.shipping_cost_rules;
CREATE TRIGGER trg_prq_shipping_rules
AFTER INSERT OR UPDATE OR DELETE ON public.shipping_cost_rules
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_on_shipping_rule_change();

-- 9) Summary view ------------------------------------------------
CREATE OR REPLACE VIEW public.v_pricing_recompute_queue_summary AS
SELECT
  count(*) FILTER (WHERE status = 'pending')    AS pending_count,
  count(*) FILTER (WHERE status = 'processing') AS processing_count,
  count(*) FILTER (WHERE status = 'failed')     AS failed_count,
  count(*) FILTER (WHERE status = 'done')       AS done_count,
  min(enqueued_at) FILTER (WHERE status = 'pending') AS oldest_pending_at,
  (SELECT error FROM public.pricing_recompute_queue
    WHERE status = 'failed' AND error IS NOT NULL
    ORDER BY processed_at DESC NULLS LAST LIMIT 1) AS latest_error
FROM public.pricing_recompute_queue;

COMMENT ON VIEW public.v_pricing_recompute_queue_summary IS
  'PRICE-RT: Lightweight monitoring view for the recompute queue.';
