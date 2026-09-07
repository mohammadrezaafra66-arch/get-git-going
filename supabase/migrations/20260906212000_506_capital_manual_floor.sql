-- 506: teach recompute_dynamic_capital_setting to respect customers.manual_credit_floor.
--
-- 🔴 READ THIS BEFORE COMPARING AGAINST GIT. The body below was taken from the LIVE database
--   with pg_get_functiondef (CLAUDE.md rule 4), NOT from any migration file, because Agent X
--   rewrote this function earlier in wave 6 (X-1) and the live definition is newer than
--   anything in git history at the time of writing. Re-applying a git version wholesale would
--   have silently reverted X's work.
--
-- 🔴 X-1's SAFETY GUARD IS REPRODUCED UNCHANGED AND STILL RUNS FIRST.
--   v_locked_ledger := public._capital_setting_reservation_count(p_setting_id);
--   IF v_locked_ledger > 0 THEN ... RETURN {"skipped": true, "reason": "ledger_exists"} ...
--   That block is byte-for-byte X's, it sits ahead of every write in the function, and the
--   floor is applied far below it inside the allocation body. A setting carrying a live
--   reservation - in zz_retired_capital_allocation_ledger, or as a net positive 'hold' in
--   customer_credit_ledger - still returns early and writes nothing at all, floor or no floor.
--
-- WHAT ACTUALLY CHANGED - three additions, nothing removed:
--   1. _cust_alloc gains a manual_floor numeric column.
--   2. One new UPDATE populates it from customers.manual_credit_floor.
--   3. One new UPDATE applies it, AFTER the existing formula UPDATE.
--   The existing formula UPDATE (has_overdue -> 0, credit_limit as a CEILING, else
--   raw_allocation) is left BYTE-IDENTICAL rather than being folded into a single larger
--   CASE, so that the previous behaviour remains legible as one unmodified statement and the
--   floor is visibly a separate, additive step.
--
-- The signature is unchanged - (uuid, text) - so this REPLACES the function rather than
-- overloading it (CLAUDE.md rule 5). No defaulted parameter is added.
--
-- 🔴 has_overdue STILL WINS. The floor UPDATE carries `AND NOT has_overdue`, so an overdue
--   customer keeps final_limit 0 even with an override. See migration 505's header for why
--   this reading of D-52 was chosen and what to change if the owner wants the other one.
--
-- Reverse with docs/verification/506-down.sql.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.recompute_dynamic_capital_setting(p_setting_id uuid, p_reason text DEFAULT NULL::text)
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

  -- THE SAFETY LOCK. Was an inline count over capital_allocation_ledger; that table is retired
  -- and the predicate now lives in _capital_setting_reservation_count(), which reads the
  -- renamed table AND customer_credit_ledger holds.
  v_locked_ledger := public._capital_setting_reservation_count(p_setting_id);

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
    manual_floor numeric,          -- 506: the approved override, NULL when there is none
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

  -- 506 ADDITION 1 of 2: pull the approved manual override in. NULL for every customer who
  -- has never had a credit request approved, which is the whole population today.
  UPDATE _cust_alloc ca
     SET manual_floor = c.manual_credit_floor
    FROM public.customers c
   WHERE c.id = ca.customer_id
     AND c.manual_credit_floor IS NOT NULL;

  -- UNCHANGED from X-1's version. The formula's own outcome, including credit_limit used as
  -- a CEILING. Deliberately left as its own statement.
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

  -- 506 ADDITION 2 of 2: THE FLOOR (D-52). This is the ONLY place the override is applied.
  -- It raises final_limit and never lowers it (manual_floor > final_limit), so an override
  -- smaller than what the formula already gives is a no-op rather than a cut. has_overdue
  -- still wins - see this migration's header.
  UPDATE _cust_alloc
     SET final_limit = manual_floor,
         binding_constraint = 'manual_override'
   WHERE manual_floor IS NOT NULL
     AND NOT has_overdue
     AND manual_floor > final_limit;

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
