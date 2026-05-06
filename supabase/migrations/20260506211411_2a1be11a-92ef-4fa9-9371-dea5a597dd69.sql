
-- Phase 20.2: Customer capital allocations (model + RPCs)

CREATE TABLE IF NOT EXISTS public.customer_capital_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_allocation_id uuid NOT NULL REFERENCES public.salesperson_capital_allocations(id) ON DELETE CASCADE,
  capital_snapshot_id uuid NOT NULL REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE,
  capital_date date NOT NULL,
  salesperson_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_score numeric NOT NULL DEFAULT 0,
  score_source text NOT NULL DEFAULT 'customer_credit_profile.credit_score',
  total_customer_score numeric NOT NULL DEFAULT 0,
  system_suggested_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  override_reason text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccap_final_nonneg CHECK (final_amount >= 0),
  CONSTRAINT ccap_suggested_nonneg CHECK (system_suggested_amount >= 0),
  CONSTRAINT ccap_status_chk CHECK (status IN ('draft','approved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ccap_alloc_customer_uniq
  ON public.customer_capital_allocations(salesperson_allocation_id, customer_id);
CREATE INDEX IF NOT EXISTS ccap_salesperson_date_idx
  ON public.customer_capital_allocations(salesperson_id, capital_date);
CREATE INDEX IF NOT EXISTS ccap_customer_date_idx
  ON public.customer_capital_allocations(customer_id, capital_date);
CREATE INDEX IF NOT EXISTS ccap_snapshot_idx
  ON public.customer_capital_allocations(capital_snapshot_id);

-- override reason validator (trigger; CHECK can't be conditional safely with mutability)
CREATE OR REPLACE FUNCTION public.validate_customer_capital_alloc_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROUND(NEW.final_amount) <> ROUND(NEW.system_suggested_amount)
     AND (NEW.override_reason IS NULL OR length(btrim(NEW.override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason required when final_amount differs from system_suggested_amount'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ccap_validate_override ON public.customer_capital_allocations;
CREATE TRIGGER trg_ccap_validate_override
BEFORE INSERT OR UPDATE ON public.customer_capital_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_customer_capital_alloc_override();

DROP TRIGGER IF EXISTS trg_ccap_updated ON public.customer_capital_allocations;
CREATE TRIGGER trg_ccap_updated
BEFORE UPDATE ON public.customer_capital_allocations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_capital_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccap_read_privileged_or_owner"
ON public.customer_capital_allocations
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
  OR (has_role(auth.uid(),'sales'::app_role) AND salesperson_id = auth.uid())
);

CREATE POLICY "ccap_write_privileged"
ON public.customer_capital_allocations
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

-- =========================================================
-- compute RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_customer_capital_allocations(
  p_salesperson_allocation_id uuid
)
RETURNS TABLE (
  salesperson_allocation_id uuid,
  capital_snapshot_id uuid,
  capital_date date,
  salesperson_id uuid,
  salesperson_final_amount numeric,
  customer_id uuid,
  customer_score numeric,
  total_customer_score numeric,
  system_suggested_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc record;
  v_total numeric;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(ccp.credit_score), 0) INTO v_total
  FROM public.customers c
  JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
    AND ccp.is_active = true
    AND ccp.credit_score > 0;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    ccp.credit_score::numeric,
    v_total,
    CASE
      WHEN v_total > 0 THEN ROUND(v_alloc.final_amount * ccp.credit_score::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
    AND ccp.is_active = true
    AND ccp.credit_score > 0
  ORDER BY ccp.credit_score DESC, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_customer_capital_allocations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_customer_capital_allocations(uuid) TO authenticated;

-- =========================================================
-- save RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.save_customer_capital_allocations(
  p_salesperson_allocation_id uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc record;
  v_total numeric;
  v_item jsonb;
  v_customer_id uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_count int := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(ccp.credit_score), 0) INTO v_total
  FROM public.customers c
  JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
    AND ccp.is_active = true
    AND ccp.credit_score > 0;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_customer_id := (v_item->>'customer_id')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(btrim(COALESCE(v_item->>'override_reason','')), '');

    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- recompute score/suggested server-side (trust no client)
    SELECT ccp.credit_score::numeric INTO v_score
    FROM public.customers c
    JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true
      AND ccp.is_active = true;

    IF v_score IS NULL THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE WHEN v_total > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total) ELSE 0 END;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'draft', auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(),
    'customer_capital_allocations.save',
    'salesperson_capital_allocations',
    v_alloc.id,
    jsonb_build_object(
      'capital_snapshot_id', v_alloc.capital_snapshot_id,
      'capital_date', v_alloc.capital_date,
      'salesperson_id', v_alloc.salesperson_id,
      'count', v_count
    )
  );

  RETURN jsonb_build_object('saved', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.save_customer_capital_allocations(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_capital_allocations(uuid, jsonb) TO authenticated;
