Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
 RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric, salesperson_id uuid, score numeric, total_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.text[]) THEN
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
$function$


-- ================================================================

CREATE OR REPLACE FUNCTION public.run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_setting_id uuid;
  v_sp_count int := 0;
  v_cust_count int := 0;
  v_total_allocated numeric := 0;
  v_sum_sp_score numeric;
  v_sp record;
  v_sum_cust_score numeric;
  v_remainder numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'accountant')) THEN
    RAISE EXCEPTION 'unauthorized: requires admin or accountant role';
  END IF;

  IF p_total_capital IS NULL OR p_total_capital <= 0 THEN
    RAISE EXCEPTION 'invalid total_capital: must be > 0';
  END IF;

  BEGIN
    INSERT INTO public.daily_capital_settings(capital_date, total_capital, scoring_mode, notes, created_by)
    VALUES (p_capital_date, p_total_capital, 'auto', p_notes, v_caller)
    RETURNING id INTO v_setting_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'capital allocation already exists for date %', p_capital_date;
  END;

  CREATE TEMP TABLE _sp_alloc(
    salesperson_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_amount numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    allocated_capital numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
  SELECT ur.user_id,
         COALESCE((public.calculate_dynamic_score('salesperson', ur.user_id, p_capital_date) ->> 'weighted_score')::numeric, 0)
  FROM public.user_roles ur
  WHERE ur.role = 'sales'
  GROUP BY ur.user_id;

  SELECT COALESCE(SUM(weighted_score), 0) INTO v_sum_sp_score FROM _sp_alloc;
  SELECT COUNT(*) INTO v_sp_count FROM _sp_alloc;

  IF v_sum_sp_score > 0 THEN
    UPDATE _sp_alloc SET
      share_ratio  = weighted_score / v_sum_sp_score,
      raw_amount   = (weighted_score / v_sum_sp_score) * p_total_capital,
      floor_amount = FLOOR((weighted_score / v_sum_sp_score) * p_total_capital),
      fractional   = ((weighted_score / v_sum_sp_score) * p_total_capital)
                     - FLOOR((weighted_score / v_sum_sp_score) * p_total_capital)
    WHERE true;

    SELECT p_total_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_alloc;
    UPDATE _sp_alloc SET allocated_capital = floor_amount WHERE true;

    IF v_remainder > 0 THEN
      WITH ranked AS (
        SELECT salesperson_id
        FROM _sp_alloc
        WHERE weighted_score > 0
        ORDER BY fractional DESC, weighted_score DESC, salesperson_id
        LIMIT v_remainder::int
      )
      UPDATE _sp_alloc a
      SET allocated_capital = a.floor_amount + 1
      FROM ranked r
      WHERE a.salesperson_id = r.salesperson_id;
    END IF;
  END IF;

  INSERT INTO public.salesperson_capital_allocations_dynamic(
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  SELECT v_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  FROM _sp_alloc;

  CREATE TEMP TABLE _cust_alloc(
    customer_id uuid PRIMARY KEY,
    salesperson_id uuid NOT NULL,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0,
    credit_limit numeric,
    has_overdue boolean NOT NULL DEFAULT false,
    has_profile boolean NOT NULL DEFAULT false,
    final_limit numeric NOT NULL DEFAULT 0,
    binding_constraint text NOT NULL DEFAULT 'formula'
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS _sp_cust(
    customer_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  TRUNCATE _sp_cust;

  FOR v_sp IN
    SELECT salesperson_id, allocated_capital
    FROM _sp_alloc
    WHERE allocated_capital > 0
  LOOP
    TRUNCATE _sp_cust;

    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id,
           COALESCE((public.calculate_dynamic_score('customer', c.id, p_capital_date) ->> 'weighted_score')::numeric, 0)
    FROM public.customers c
    WHERE c.responsible_id = v_sp.salesperson_id
      AND COALESCE(c.is_active, true) = true;

    SELECT COALESCE(SUM(weighted_score),0) INTO v_sum_cust_score FROM _sp_cust;

    IF v_sum_cust_score > 0 THEN
      UPDATE _sp_cust SET
        floor_amount = FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital),
        fractional   = ((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
                       - FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
      WHERE true;

      SELECT v_sp.allocated_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_cust;
      UPDATE _sp_cust SET raw_allocation = floor_amount WHERE true;

      IF v_remainder > 0 THEN
        WITH ranked AS (
          SELECT customer_id
          FROM _sp_cust
          WHERE weighted_score > 0
          ORDER BY fractional DESC, weighted_score DESC, customer_id
          LIMIT v_remainder::int
        )
        UPDATE _sp_cust c
        SET raw_allocation = c.floor_amount + 1
        FROM ranked r
        WHERE c.customer_id = r.customer_id;
      END IF;
    END IF;

    INSERT INTO _cust_alloc(
      customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation
    )
    SELECT
      sc.customer_id,
      v_sp.salesperson_id,
      sc.weighted_score,
      CASE WHEN v_sum_cust_score > 0 THEN sc.weighted_score / v_sum_cust_score ELSE 0 END,
      sc.raw_allocation
    FROM _sp_cust sc;
  END LOOP;

  UPDATE _cust_alloc ca
  SET credit_limit = ccp.credit_limit,
      has_overdue = COALESCE(ccp.has_overdue, false),
      has_profile = true
  FROM public.customer_credit_profile ccp
  WHERE ccp.customer_id = ca.customer_id;

  UPDATE _cust_alloc SET
    final_limit = CASE
      WHEN has_overdue THEN 0
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
      ELSE raw_allocation
    END,
    binding_constraint = CASE
      WHEN has_overdue THEN 'overdue'
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
      ELSE 'formula'
    END
  WHERE true;

  SELECT COUNT(*), COALESCE(SUM(final_limit),0) INTO v_cust_count, v_total_allocated FROM _cust_alloc;

  INSERT INTO public.customer_capital_allocations_dynamic(
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  SELECT v_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
         raw_allocation, final_limit, binding_constraint
  FROM _cust_alloc;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_caller,
    'create',
    'daily_capital_setting',
    v_setting_id::text,
    jsonb_build_object(
      'capital_date', p_capital_date,
      'total_capital', p_total_capital,
      'salespersons_count', v_sp_count,
      'customers_count', v_cust_count,
      'total_allocated_to_customers', v_total_allocated,
      'scoring_mode', 'auto'
    )
  );

  RETURN jsonb_build_object(
    'setting_id', v_setting_id,
    'capital_date', p_capital_date,
    'total_capital', p_total_capital,
    'salespersons_count', v_sp_count,
    'customers_count', v_cust_count,
    'total_allocated_to_customers', v_total_allocated
  );
END;
$function$


-- ================================================================

CREATE OR REPLACE FUNCTION public.save_daily_capital_snapshot(p_capital_date date, p_final_capital numeric, p_override_reason text DEFAULT NULL::text)
 RETURNS daily_capital_snapshots
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  s public.daily_capital_snapshots;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;
  IF p_final_capital IS NULL OR p_final_capital < 0 THEN
    RAISE EXCEPTION 'final_capital must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.compute_daily_capital(p_capital_date);

  IF p_final_capital <> c.system_suggested_capital
     AND (p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason is required when final differs from suggested'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_snapshots(
    capital_date, system_suggested_capital, final_capital,
    total_receivables, overdue_receivables, due_today_receivables, future_receivables,
    total_payables, overdue_payables, due_today_payables, future_payables,
    input_id, formula_version, override_reason, approved_by, created_by
  ) VALUES (
    p_capital_date, c.system_suggested_capital, p_final_capital,
    c.total_receivables, c.overdue_receivables, c.due_today_receivables, c.future_receivables,
    c.total_payables, c.overdue_payables, c.due_today_payables, c.future_payables,
    c.input_id, c.formula_version, NULLIF(btrim(p_override_reason),''), auth.uid(), auth.uid()
  )
  RETURNING * INTO s;

  RETURN s;
END;
$function$


-- ================================================================

CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(p_capital_snapshot_id uuid, p_allocations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::public.text[]) THEN
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
$function$


-- ================================================================

