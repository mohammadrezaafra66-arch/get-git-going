-- Phase 20.1: Salesperson capital allocations
CREATE TABLE IF NOT EXISTS public.salesperson_capital_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_snapshot_id uuid NOT NULL REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE,
  capital_date date NOT NULL,
  salesperson_id uuid NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  score_source text NOT NULL DEFAULT 'employee_scores.monthly_score',
  total_score numeric NOT NULL DEFAULT 0,
  system_suggested_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  override_reason text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scap_final_nonneg CHECK (final_amount >= 0),
  CONSTRAINT scap_suggested_nonneg CHECK (system_suggested_amount >= 0),
  CONSTRAINT scap_status_chk CHECK (status IN ('draft','approved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS scap_snapshot_salesperson_uniq
  ON public.salesperson_capital_allocations (capital_snapshot_id, salesperson_id);
CREATE INDEX IF NOT EXISTS scap_capital_date_idx
  ON public.salesperson_capital_allocations (capital_date);
CREATE INDEX IF NOT EXISTS scap_salesperson_date_idx
  ON public.salesperson_capital_allocations (salesperson_id, capital_date);

DROP TRIGGER IF EXISTS trg_scap_updated_at ON public.salesperson_capital_allocations;
CREATE TRIGGER trg_scap_updated_at
  BEFORE UPDATE ON public.salesperson_capital_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.salesperson_capital_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scap_select ON public.salesperson_capital_allocations;
CREATE POLICY scap_select ON public.salesperson_capital_allocations
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]));

DROP POLICY IF EXISTS scap_insert ON public.salesperson_capital_allocations;
CREATE POLICY scap_insert ON public.salesperson_capital_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]));

DROP POLICY IF EXISTS scap_update ON public.salesperson_capital_allocations;
CREATE POLICY scap_update ON public.salesperson_capital_allocations
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]));

-- DELETE intentionally not allowed (no policy)

REVOKE ALL ON public.salesperson_capital_allocations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.salesperson_capital_allocations TO authenticated;

-- ============================================================
-- RPC 1: compute_salesperson_capital_allocations (read-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(
  p_capital_snapshot_id uuid
)
RETURNS TABLE (
  capital_snapshot_id uuid,
  capital_date date,
  daily_final_capital numeric,
  salesperson_id uuid,
  score numeric,
  total_score numeric,
  system_suggested_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  -- Sum of monthly scores across users with 'sales' role
  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_salesperson_capital_allocations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_salesperson_capital_allocations(uuid) TO authenticated;

-- ============================================================
-- RPC 2: save_salesperson_capital_allocations
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(
  p_capital_snapshot_id uuid,
  p_allocations jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
  v_action text;
BEGIN
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::public.app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(v_item->>'override_reason','');

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount cannot be negative' USING ERRCODE = '22023';
    END IF;

    -- Verify salesperson role + recompute server-side suggested
    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    IF ROUND(v_final) <> v_suggested AND v_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason required when final_amount differs from suggested' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_final,
            override_reason = v_reason,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
      v_action := CASE WHEN ROUND(v_final) <> v_suggested THEN 'override' ELSE 'update' END;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_final,
        v_reason, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
      v_action := 'create';
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor,
      'salesperson_capital_allocation',
      v_alloc_id::text,
      v_action,
      jsonb_build_object(
        'capital_snapshot_id', p_capital_snapshot_id,
        'capital_date', v_snap.capital_date,
        'salesperson_id', v_sp,
        'score', v_score,
        'total_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_salesperson_capital_allocations(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_salesperson_capital_allocations(uuid, jsonb) TO authenticated;