SET client_encoding='UTF8';

-- ============================================================================================
-- 484 · retire capital_allocation_ledger, WITHOUT losing the safety lock it carries (X-1)
--
-- ── What the table is, measured ─────────────────────────────────────────────────────────────
-- public.capital_allocation_ledger holds 0 rows. It has three prosrc matches, but only TWO are
-- real readers:
--   _capital_alloc_used(text,uuid)            -- feeds held_amount / consumed_amount
--   recompute_dynamic_capital_setting(uuid,text) -- the safety lock, below
--   is_valid_audit_entity_type(text)          -- NOT a reader. It contains the *string literal*
--                                             -- 'capital_allocation_ledger' in a list of audit
--                                             -- entity_type names. It never touches the table,
--                                             -- and it has ZERO callers anywhere in the
--                                             -- database. The rename cannot affect it, so it
--                                             -- is deliberately left untouched.
-- No foreign key references the table. Its RLS policies, grants and indexes follow the rename.
--
-- ── The safety lock, quoted from the live definition ────────────────────────────────────────
-- recompute_dynamic_capital_setting counted rows in capital_allocation_ledger belonging to the
-- setting being recomputed and, if non-zero, returned early:
--
--     IF v_locked_ledger > 0 THEN
--       INSERT INTO public.audit_logs(... 'dynamic_capital_recompute_skipped' ...);
--       RETURN jsonb_build_object('skipped', true, 'reason', 'ledger_exists', ...);
--     END IF;
--
-- WHAT IT PROTECTS AGAINST. The recompute rewrites customer_capital_allocations_dynamic
-- .final_limit and salesperson_capital_allocations_dynamic.allocated_capital from scratch, and
-- zeroes any allocation whose subject no longer qualifies. If money is already reserved against
-- those ceilings, a recompute can drop a ceiling BELOW what is already held -- the customer is
-- then over-committed -- or zero the allocation entirely and orphan the reservation.
--
-- Reproduced 2026-09-06 in BEGIN..ROLLBACK on setting c977b3f9 (2026-08-31), by halving
-- total_capital, which is the real-world trigger (owner changes capital, or a score changes):
--
--   (A) no ledger row  -> {"skipped": false}   ceilings rewritten:
--         customer 869e7514  1247149593 -> 623574797   (-623574796)
--         customer 61ba4ba6   883447903 -> 441723952   (-441723951)
--         customer 2b67455e   311693829 -> 155846914   (-155846915)
--         customer 8b36df09   286823202 -> 143411601   (-143411601)
--         customer 7992be7a   161825459 ->  80912729   ( -80912730)
--
--   (B) ONE 'hold' row of 900,000,000 against customer 869e7514's allocation
--       -> {"skipped": true, "reason": "ledger_exists", "ledger_rows": 1}
--          every ceiling unchanged, audit action 'dynamic_capital_recompute_skipped'
--
--   The concrete harm the lock prevents: without it, 869e7514 holds 900,000,000 against a
--   ceiling that has just become 623,574,797 -- over-committed by 276,425,203.
--
-- ── How the lock is preserved ───────────────────────────────────────────────────────────────
-- Retiring here means RENAMING, not dropping. The rows (and any future ones) still exist under
-- zz_retired_capital_allocation_ledger, so the original predicate keeps working verbatim
-- against the renamed table -- coverage of the historical source is not reduced at all,
-- including its salesperson half, which customer_credit_ledger has no equivalent for.
--
-- On top of that the lock gains a LIVE source, so it can still fire for reservations recorded
-- from now on: a customer of this setting whose net hold in customer_credit_ledger is > 0.
-- The predicate is therefore strictly stronger than the one it replaces, never weaker.
--
-- It is extracted into public._capital_setting_reservation_count(uuid) so that it is named,
-- testable on its own, and so recompute_dynamic_capital_setting's body changes by exactly one
-- statement (Agent B adds a floor to this same function next).
--
-- ── held_amount ─────────────────────────────────────────────────────────────────────────────
-- _capital_alloc_used is re-pointed to read the renamed table PLUS customer_credit_ledger
-- holds. customer_credit_ledger's CHECK already permits 'hold' and 'release' -- no new
-- transaction type is introduced -- but it holds no row of either type today (7 rows: 2
-- adjustment, 5 payment). So held_amount is 0 for all 35 customer allocation rows and all 252
-- salesperson rows both before and after this migration. That 0 -> 0 is stated plainly rather
-- than presented as a passing test: it proves nothing on its own, and the accompanying
-- verification instead creates a real hold in a rolled-back transaction and shows both the old
-- and the new source producing the SAME non-zero number.
--
-- Migration impact: one table renamed. No data change. No column added or dropped.
-- RLS/RBAC impact: none. Policies, grants and indexes follow the renamed table unchanged.
-- Audit impact: none. 'dynamic_capital_recompute_skipped' is still written by the same branch.
-- ============================================================================================

-- ── 1 · retire the table by renaming it ─────────────────────────────────────────────────────
-- Rename, never DROP: the rows are the only record of any reservation ever made, and the
-- safety lock below still reads them.
ALTER TABLE public.capital_allocation_ledger
  RENAME TO zz_retired_capital_allocation_ledger;

COMMENT ON TABLE public.zz_retired_capital_allocation_ledger IS
  'RETIRED 2026-09-06 (migration 484, wave 6 X-1). Was public.capital_allocation_ledger. Held 0 '
  'rows at retirement. Kept, not dropped, because it is still read by '
  '_capital_setting_reservation_count() and _capital_alloc_used() so that no historical '
  'reservation -- including the salesperson half, which customer_credit_ledger cannot express '
  '-- silently stops locking the daily capital recompute. Write new reservations to '
  'customer_credit_ledger (transaction_type hold/release) instead.';

-- ── 2 · the replacement guard, as a named predicate ─────────────────────────────────────────
-- Returns the number of live reservations that must block a recompute of p_setting_id.
-- > 0 means "reservations exist, do not rewrite the ceilings".
CREATE OR REPLACE FUNCTION public._capital_setting_reservation_count(p_setting_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    -- (1) the frozen historical source. This is the ORIGINAL predicate, unchanged except for
    --     the table's new name, so nothing that used to lock stops locking.
    SELECT count(*)
      FROM public.zz_retired_capital_allocation_ledger l
     WHERE (
        l.allocation_kind = 'customer'
        AND EXISTS (
          SELECT 1 FROM public.customer_capital_allocations_dynamic c
           WHERE c.id = l.allocation_id AND c.capital_setting_id = p_setting_id))
        OR (
        l.allocation_kind = 'salesperson'
        AND EXISTS (
          SELECT 1 FROM public.salesperson_capital_allocations_dynamic s
           WHERE s.id = l.allocation_id AND s.capital_setting_id = p_setting_id))
  ) + (
    -- (2) the live source. A customer holding against a ceiling that belongs to THIS setting.
    --     Net of releases, so a hold that was fully released no longer locks.
    SELECT count(*) FROM (
      SELECT cl.customer_id
        FROM public.customer_credit_ledger cl
       WHERE cl.transaction_type IN ('hold', 'release')
         AND EXISTS (
           SELECT 1 FROM public.customer_capital_allocations_dynamic c
            WHERE c.customer_id = cl.customer_id
              AND c.capital_setting_id = p_setting_id)
       GROUP BY cl.customer_id
      HAVING COALESCE(SUM(CASE WHEN cl.transaction_type = 'hold'    THEN cl.amount
                               WHEN cl.transaction_type = 'release' THEN -cl.amount
                               ELSE 0 END), 0) > 0
    ) q
  );
$function$;

REVOKE ALL ON FUNCTION public._capital_setting_reservation_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._capital_setting_reservation_count(uuid)
  TO postgres, authenticated, service_role;

COMMENT ON FUNCTION public._capital_setting_reservation_count(uuid) IS
  'X-1 (wave 6): the safety lock for recompute_dynamic_capital_setting. Counts reservations '
  'that must block a recompute of this capital setting: rows in the retired '
  'zz_retired_capital_allocation_ledger (the original predicate, verbatim) PLUS customers of '
  'this setting whose NET hold in customer_credit_ledger is > 0. Strictly wider than the '
  'predicate it replaced; > 0 means do not rewrite the ceilings.';

-- ── 3 · re-point held_amount / consumed_amount ──────────────────────────────────────────────
-- Live definition read with pg_get_functiondef first (rule 4). Signature unchanged, so this is
-- a true replacement and not an overload (rule 5).
CREATE OR REPLACE FUNCTION public._capital_alloc_used(
  p_kind text, p_alloc_id uuid, OUT held numeric, OUT consumed numeric)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- the frozen historical source, arithmetic identical to before the rename
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type='hold' THEN amount
                      WHEN transaction_type='release' THEN -amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='consume' THEN amount
                      WHEN transaction_type='refund' THEN -amount ELSE 0 END), 0)
    INTO held, consumed
  FROM public.zz_retired_capital_allocation_ledger
  WHERE allocation_kind = p_kind AND allocation_id = p_alloc_id;

  -- the live source. customer_credit_ledger is keyed by customer, not by allocation, so the
  -- allocation is mapped back to its customer. There is no salesperson equivalent in that
  -- table, which is precisely why the retired table above is kept rather than dropped.
  IF p_kind = 'customer' THEN
    held := held + COALESCE((
      SELECT SUM(CASE WHEN cl.transaction_type='hold'    THEN cl.amount
                      WHEN cl.transaction_type='release' THEN -cl.amount
                      ELSE 0 END)
        FROM public.customer_credit_ledger cl
        JOIN public.customer_capital_allocations_dynamic c
          ON c.customer_id = cl.customer_id
       WHERE c.id = p_alloc_id), 0);
  END IF;
END;
$function$;

COMMENT ON FUNCTION public._capital_alloc_used(text, uuid) IS
  'X-1 (wave 6): held/consumed for one capital allocation. Reads the retired '
  'zz_retired_capital_allocation_ledger (historical, both kinds) and, for customer allocations, '
  'adds net holds from customer_credit_ledger (live). consumed comes from the retired table '
  'only: customer_credit_ledger has no consume/refund equivalent.';

-- ── 4 · recompute_dynamic_capital_setting: the guard now calls the named predicate ──────────
-- The body below is the LIVE definition read with pg_get_functiondef immediately before this
-- migration was written (rule 4). EXACTLY ONE statement differs: the inline
-- `SELECT count(*) ... INTO v_locked_ledger` over capital_allocation_ledger is replaced by a
-- call to _capital_setting_reservation_count(). Everything else, including the skip branch,
-- the audit row, the remainder distribution and the credit_limit ceiling, is unchanged.
CREATE OR REPLACE FUNCTION public.recompute_dynamic_capital_setting(
  p_setting_id uuid, p_reason text DEFAULT NULL::text)
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
