-- Requirement 213: make dynamic capital recompute compatible with safeupdate.
--
-- Root cause:
-- Updating an existing dynamic_entity_scores row fires
-- refresh_today_dynamic_capital_after_score_change(), which calls
-- recompute_dynamic_capital_setting(). That function updates temporary
-- work tables without WHERE clauses. The LAN database enables the safeupdate
-- guard, so those internal temp-table updates fail with:
--   UPDATE requires a WHERE clause
--
-- Fix:
-- Preserve the allocation algorithm and all permissions, but:
--   1. Drop any leftover temp work tables at the beginning of the function so
--      repeated trigger calls in the same session cannot collide.
--   2. Add WHERE true to whole-temp-table UPDATE statements.
--
-- No RLS policy, score formula, weight rule, or allocation business rule is
-- changed.

CREATE OR REPLACE FUNCTION public.recompute_dynamic_capital_setting(
  p_setting_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_setting record;
  v_sp_count int := 0;
  v_cust_count int := 0;
  v_total_allocated numeric := 0;
  v_sum_sp_score numeric := 0;
  v_sum_cust_score numeric := 0;
  v_remainder numeric := 0;
  v_sp record;
  v_locked_ledger int := 0;
BEGIN
  SELECT id, capital_date, total_capital, notes, created_by
    INTO v_setting
    FROM public.daily_capital_settings
   WHERE id = p_setting_id
   FOR UPDATE;

  IF v_setting.id IS NULL THEN
    RAISE EXCEPTION 'capital setting not found: %', p_setting_id;
  END IF;

  IF v_actor IS NOT NULL AND NOT (
    public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'accountant')
  ) THEN
    RAISE EXCEPTION 'unauthorized: requires admin or accountant role';
  END IF;

  SELECT count(*) INTO v_locked_ledger
    FROM public.capital_allocation_ledger l
   WHERE (
      l.allocation_kind = 'customer'
      AND EXISTS (
        SELECT 1
          FROM public.customer_capital_allocations_dynamic c
         WHERE c.id = l.allocation_id
           AND c.capital_setting_id = p_setting_id
      )
    )
    OR (
      l.allocation_kind = 'salesperson'
      AND EXISTS (
        SELECT 1
          FROM public.salesperson_capital_allocations_dynamic s
         WHERE s.id = l.allocation_id
           AND s.capital_setting_id = p_setting_id
      )
    );

  IF v_locked_ledger > 0 THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
    VALUES (
      v_actor,
      'dynamic_capital_recompute_skipped',
      'daily_capital_setting',
      p_setting_id::text,
      jsonb_build_object(
        'reason', COALESCE(p_reason, 'score_changed'),
        'capital_date', v_setting.capital_date,
        'ledger_rows', v_locked_ledger
      )
    );

    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'ledger_exists',
      'ledger_rows', v_locked_ledger,
      'setting_id', p_setting_id
    );
  END IF;

  DROP TABLE IF EXISTS _sp_cust;
  DROP TABLE IF EXISTS _cust_alloc;
  DROP TABLE IF EXISTS _sp_alloc;

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
         COALESCE(
           (public.calculate_dynamic_score('salesperson', ur.user_id, v_setting.capital_date)
             ->> 'weighted_score')::numeric,
           0
         )
    FROM public.user_roles ur
   WHERE ur.role = 'sales'
   GROUP BY ur.user_id;

  SELECT COALESCE(SUM(weighted_score), 0), COUNT(*)
    INTO v_sum_sp_score, v_sp_count
    FROM _sp_alloc;

  IF v_sum_sp_score > 0 THEN
    UPDATE _sp_alloc
       SET share_ratio = weighted_score / v_sum_sp_score,
           raw_amount = (weighted_score / v_sum_sp_score) * v_setting.total_capital,
           floor_amount = FLOOR((weighted_score / v_sum_sp_score) * v_setting.total_capital),
           fractional = ((weighted_score / v_sum_sp_score) * v_setting.total_capital)
             - FLOOR((weighted_score / v_sum_sp_score) * v_setting.total_capital)
     WHERE true;

    SELECT v_setting.total_capital - COALESCE(SUM(floor_amount), 0)
      INTO v_remainder
      FROM _sp_alloc;

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

  UPDATE public.salesperson_capital_allocations_dynamic s
     SET weighted_score = 0,
         share_ratio = 0,
         allocated_capital = 0
   WHERE s.capital_setting_id = p_setting_id
     AND NOT EXISTS (
       SELECT 1 FROM _sp_alloc x WHERE x.salesperson_id = s.salesperson_id
     );

  INSERT INTO public.salesperson_capital_allocations_dynamic(
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  SELECT p_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
    FROM _sp_alloc
  ON CONFLICT (capital_setting_id, salesperson_id) DO UPDATE
     SET weighted_score = EXCLUDED.weighted_score,
         share_ratio = EXCLUDED.share_ratio,
         allocated_capital = EXCLUDED.allocated_capital;

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

  CREATE TEMP TABLE _sp_cust(
    customer_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  FOR v_sp IN
    SELECT salesperson_id, allocated_capital
      FROM _sp_alloc
     WHERE allocated_capital > 0
  LOOP
    TRUNCATE _sp_cust;

    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id,
           COALESCE(
             (public.calculate_dynamic_score('customer', c.id, v_setting.capital_date)
               ->> 'weighted_score')::numeric,
             0
           )
      FROM public.customers c
     WHERE c.responsible_id = v_sp.salesperson_id
       AND COALESCE(c.is_active, true) = true;

    SELECT COALESCE(SUM(weighted_score), 0)
      INTO v_sum_cust_score
      FROM _sp_cust;

    IF v_sum_cust_score > 0 THEN
      UPDATE _sp_cust
         SET floor_amount = FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital),
             fractional = ((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
               - FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
       WHERE true;

      SELECT v_sp.allocated_capital - COALESCE(SUM(floor_amount), 0)
        INTO v_remainder
        FROM _sp_cust;

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
    SELECT sc.customer_id,
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

  UPDATE _cust_alloc
     SET final_limit = CASE
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

  UPDATE public.customer_capital_allocations_dynamic c
     SET weighted_score = 0,
         share_ratio = 0,
         raw_allocation = 0,
         final_limit = 0,
         binding_constraint = 'floor'
   WHERE c.capital_setting_id = p_setting_id
     AND NOT EXISTS (
       SELECT 1 FROM _cust_alloc x WHERE x.customer_id = c.customer_id
     );

  INSERT INTO public.customer_capital_allocations_dynamic(
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  SELECT p_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
         raw_allocation, final_limit, binding_constraint
    FROM _cust_alloc
  ON CONFLICT (capital_setting_id, customer_id) DO UPDATE
     SET salesperson_id = EXCLUDED.salesperson_id,
         weighted_score = EXCLUDED.weighted_score,
         share_ratio = EXCLUDED.share_ratio,
         raw_allocation = EXCLUDED.raw_allocation,
         final_limit = EXCLUDED.final_limit,
         binding_constraint = EXCLUDED.binding_constraint;

  SELECT COUNT(*), COALESCE(SUM(final_limit), 0)
    INTO v_cust_count, v_total_allocated
    FROM _cust_alloc;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_actor,
    'dynamic_capital_recomputed',
    'daily_capital_setting',
    p_setting_id::text,
    jsonb_build_object(
      'reason', COALESCE(p_reason, 'score_changed'),
      'capital_date', v_setting.capital_date,
      'total_capital', v_setting.total_capital,
      'salespersons_count', v_sp_count,
      'customers_count', v_cust_count,
      'total_allocated_to_customers', v_total_allocated
    )
  );

  RETURN jsonb_build_object(
    'skipped', false,
    'setting_id', p_setting_id,
    'capital_date', v_setting.capital_date,
    'total_capital', v_setting.total_capital,
    'salespersons_count', v_sp_count,
    'customers_count', v_cust_count,
    'total_allocated_to_customers', v_total_allocated
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_dynamic_capital_setting(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_dynamic_capital_setting(uuid, text) TO authenticated;
ALTER FUNCTION public.recompute_dynamic_capital_setting(uuid, text) OWNER TO supabase_admin;
