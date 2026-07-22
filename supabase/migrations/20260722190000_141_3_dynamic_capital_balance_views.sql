-- =====================================================================
-- 141.3 - Correct held / consumed / remaining views for DYNAMIC capital
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS - AND WHY IT REPLACES AN EARLIER VIEW
--
-- Migration 20260722170000 created public.v_capital_allocation_balances as a
-- UNION over the LEGACY tables (salesperson_capital_allocations and
-- customer_capital_allocations), reading their held_amount / consumed_amount
-- columns. That view is WRONG for this system.
--
-- Verified against the live function bodies:
--
--   public.hold_capital_allocation()    reads and locks
--   public.consume_capital_allocation()   customer_capital_allocations_DYNAMIC
--   public.release_capital_allocation()   salesperson_capital_allocations_DYNAMIC
--   public.refund_capital_allocation()
--
--   and every ledger row they write uses:
--     allocation_kind='customer'    -> allocation_id = customer_capital_allocations_dynamic.id
--     allocation_kind='salesperson' -> allocation_id = salesperson_capital_allocations_dynamic.id
--
-- So the ledger's allocation ids point at DYNAMIC rows. The legacy tables'
-- held_amount / consumed_amount columns are never written by this flow, and
-- their ids never appear in the ledger. The old view therefore reports numbers
-- that can never correspond to anything the application actually holds or
-- consumes. It is dropped here.
--
-- The correct source of truth is the existing helper:
--
--   public._capital_alloc_used(p_kind text, p_alloc_id uuid)
--     -> (held numeric, consumed numeric)
--
-- which folds the ledger:
--     held     = sum(hold)    - sum(release)
--     consumed = sum(consume) - sum(refund)
--
-- This migration exposes that per allocation row, using exactly the same
-- arithmetic the hold path uses for its availability check:
--     customer    remaining = final_limit       - held - consumed
--     salesperson remaining = allocated_capital - held - consumed
--
-- SAFETY
--   - Views only. No table, column, trigger, RPC or data change.
--   - Drops one view that no application code references (verified by grep
--     across src/ before writing this migration).
--   - _capital_alloc_used is untouched.
--
-- ---------------------------------------------------------------------
-- PRE-CHECK
--
--   SELECT to_regclass('public.v_capital_allocation_balances');   -- exists
--   SELECT count(*) FROM public.capital_allocation_ledger;        -- 0 today
--
-- POST-CHECK
--
--   SELECT * FROM public.v_dynamic_customer_capital_balances LIMIT 5;
--   SELECT * FROM public.v_dynamic_salesperson_capital_balances LIMIT 5;
--
-- With an empty ledger every held/consumed is 0 and remaining equals the
-- allocation, which is the correct starting state.
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--   DROP VIEW IF EXISTS public.v_dynamic_customer_capital_balances;
--   DROP VIEW IF EXISTS public.v_dynamic_salesperson_capital_balances;
--
--   -- and, to restore the superseded (incorrect) view:
--   -- re-run 20260722170000_141_capital_allocation_balances_view.sql
-- =====================================================================

BEGIN;

-- Superseded: unioned the legacy tables, which the ledger never references.
DROP VIEW IF EXISTS public.v_capital_allocation_balances;

-- ---------------------------------------------------------------------
-- Customer level
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_dynamic_customer_capital_balances AS
SELECT
  c.id                                   AS allocation_id,
  c.capital_setting_id,
  c.customer_id,
  c.salesperson_id,
  c.weighted_score,
  c.share_ratio,
  c.raw_allocation,
  COALESCE(c.final_limit, 0)             AS final_limit,
  u.held                                 AS held_amount,
  u.consumed                             AS consumed_amount,
  GREATEST(COALESCE(c.final_limit, 0) - u.held - u.consumed, 0) AS remaining_amount,
  c.binding_constraint,
  c.created_at
FROM public.customer_capital_allocations_dynamic c
CROSS JOIN LATERAL public._capital_alloc_used('customer', c.id) u;

COMMENT ON VIEW public.v_dynamic_customer_capital_balances IS
  'Item 141.3. Per-customer dynamic capital allocation with held/consumed/remaining folded from capital_allocation_ledger via _capital_alloc_used. Matches the availability arithmetic in hold_capital_allocation.';

-- ---------------------------------------------------------------------
-- Salesperson level
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_dynamic_salesperson_capital_balances AS
SELECT
  s.id                                   AS allocation_id,
  s.capital_setting_id,
  s.salesperson_id,
  s.weighted_score,
  s.share_ratio,
  COALESCE(s.allocated_capital, 0)       AS allocated_capital,
  u.held                                 AS held_amount,
  u.consumed                             AS consumed_amount,
  GREATEST(COALESCE(s.allocated_capital, 0) - u.held - u.consumed, 0) AS remaining_amount,
  s.created_at
FROM public.salesperson_capital_allocations_dynamic s
CROSS JOIN LATERAL public._capital_alloc_used('salesperson', s.id) u;

COMMENT ON VIEW public.v_dynamic_salesperson_capital_balances IS
  'Item 141.3. Per-salesperson dynamic capital allocation with held/consumed/remaining folded from capital_allocation_ledger via _capital_alloc_used.';

GRANT SELECT ON public.v_dynamic_customer_capital_balances    TO authenticated;
GRANT SELECT ON public.v_dynamic_salesperson_capital_balances TO authenticated;

COMMIT;
