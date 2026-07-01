CREATE OR REPLACE FUNCTION public.run_daily_capital_allocation(
  p_capital_date date,
  p_total_capital numeric,
  p_notes text DEFAULT NULL::text
)
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
$function$;