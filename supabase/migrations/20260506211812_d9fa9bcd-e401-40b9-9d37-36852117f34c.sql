
-- 1) RLS: remove sales SELECT, restrict to admin/manager/accountant
DROP POLICY IF EXISTS "ccap_read_privileged_or_owner" ON public.customer_capital_allocations;

CREATE POLICY "ccap_read_privileged"
ON public.customer_capital_allocations
FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

-- 2) compute RPC: include all active customers of salesperson; LEFT JOIN credit profile
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

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    COALESCE(ccp.credit_score, 0)::numeric,
    v_total,
    CASE
      WHEN v_total > 0 AND COALESCE(ccp.credit_score,0) > 0
        THEN ROUND(v_alloc.final_amount * COALESCE(ccp.credit_score,0)::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
  ORDER BY COALESCE(ccp.credit_score,0) DESC, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_customer_capital_allocations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_customer_capital_allocations(uuid) TO authenticated;

-- 3) save RPC: correct audit_logs columns, per-row audit, approve+approved_by
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
  v_existing record;
  v_action text;
  v_row_id uuid;
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

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

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

    -- verify customer belongs to this salesperson (active); allow missing/zero score
    SELECT COALESCE(ccp.credit_score, 0)::numeric INTO v_score
    FROM public.customers c
    LEFT JOIN public.customer_credit_profile ccp
      ON ccp.customer_id = c.id AND ccp.is_active = true
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 AND v_score > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total)
      ELSE 0
    END;

    -- detect existing for action classification
    SELECT id INTO v_existing
    FROM public.customer_capital_allocations
    WHERE salesperson_allocation_id = v_alloc.id AND customer_id = v_customer_id;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by, approved_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'approved', auth.uid(), auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          status = 'approved',
          approved_by = auth.uid(),
          updated_at = now()
    RETURNING id INTO v_row_id;

    IF v_existing.id IS NULL THEN
      v_action := 'create';
    ELSIF ROUND(v_final) <> ROUND(v_suggested) THEN
      v_action := 'override';
    ELSE
      v_action := 'update';
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer_capital_allocation',
      v_row_id::text,
      v_action,
      jsonb_build_object(
        'salesperson_allocation_id', v_alloc.id,
        'capital_snapshot_id', v_alloc.capital_snapshot_id,
        'capital_date', v_alloc.capital_date,
        'salesperson_id', v_alloc.salesperson_id,
        'customer_id', v_customer_id,
        'customer_score', v_score,
        'total_customer_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.save_customer_capital_allocations(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_capital_allocations(uuid, jsonb) TO authenticated;
