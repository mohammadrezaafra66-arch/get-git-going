-- =====================================================================
-- 141 - Read-only view for capital held / consumed / remaining
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- The dynamic capital page needs to show, per allocation:
--     held, consumed, remaining
--
-- Those figures already exist as columns on the LEGACY allocation tables
-- (public.salesperson_capital_allocations and
--  public.customer_capital_allocations), which are the tables that
-- public.capital_allocation_ledger points at via
-- (allocation_kind, allocation_id).
--
-- This migration adds a single read-only view that exposes the numbers in
-- one shape, so the UI does not have to union two tables by hand and does
-- not have to re-derive balances from the ledger.
--
-- SAFETY
--   - Creates a VIEW only. No table, no column, no data change.
--   - No existing object is dropped or altered.
--   - Fully reversible with a single DROP VIEW (see rollback below).
--
-- ---------------------------------------------------------------------
-- PRE-CHECK - confirm the source tables and columns exist:
--
--     SELECT table_name, column_name
--       FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name IN ('salesperson_capital_allocations',
--                           'customer_capital_allocations')
--        AND column_name IN ('final_amount','held_amount','consumed_amount')
--      ORDER BY table_name, column_name;
--
-- Expect six rows.
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--     DROP VIEW IF EXISTS public.v_capital_allocation_balances;
--
-- ---------------------------------------------------------------------
-- IMPORTANT SCOPE NOTE FOR WHOEVER PICKS THIS UP
--
-- There are currently TWO parallel capital systems in this database:
--
--   Legacy  : daily_capital_snapshots
--             -> salesperson_capital_allocations   (has held/consumed)
--             -> customer_capital_allocations      (has held/consumed)
--             -> capital_allocation_ledger points here
--
--   Dynamic : daily_capital_settings
--             -> salesperson_capital_allocations_dynamic  (NO held/consumed)
--             -> customer_capital_allocations_dynamic     (NO held/consumed)
--             -> /accounting/dynamic-capital reads these
--
-- The hold / release / consume / refund machinery is wired to the LEGACY
-- tables only. The dynamic tables have no held or consumed columns and no
-- ledger rows, so their ids cannot be joined to this view.
--
-- This view is therefore correct and useful for the legacy allocation ids,
-- but it deliberately does NOT attempt to bridge the two systems. Unifying
-- them is a separate, larger decision and must not be guessed at inside a
-- UI task.
-- =====================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_capital_allocation_balances AS
SELECT
  'salesperson'::text                                      AS allocation_kind,
  sca.id                                                   AS allocation_id,
  sca.capital_date                                         AS capital_date,
  sca.salesperson_id                                       AS salesperson_id,
  NULL::uuid                                               AS customer_id,
  sca.final_amount                                         AS allocated_amount,
  sca.held_amount                                          AS held_amount,
  sca.consumed_amount                                      AS consumed_amount,
  GREATEST(
    sca.final_amount - sca.held_amount - sca.consumed_amount,
    0
  )                                                        AS remaining_amount,
  sca.status                                               AS status
FROM public.salesperson_capital_allocations sca

UNION ALL

SELECT
  'customer'::text                                         AS allocation_kind,
  cca.id                                                   AS allocation_id,
  cca.capital_date                                         AS capital_date,
  cca.salesperson_id                                       AS salesperson_id,
  cca.customer_id                                          AS customer_id,
  cca.final_amount                                         AS allocated_amount,
  cca.held_amount                                          AS held_amount,
  cca.consumed_amount                                      AS consumed_amount,
  GREATEST(
    cca.final_amount - cca.held_amount - cca.consumed_amount,
    0
  )                                                        AS remaining_amount,
  cca.status                                               AS status
FROM public.customer_capital_allocations cca;

COMMENT ON VIEW public.v_capital_allocation_balances IS
  'Item 141. Read-only union of legacy salesperson and customer capital allocations exposing held, consumed and remaining. Does not cover the *_dynamic tables, which carry no hold/consume state.';

GRANT SELECT ON public.v_capital_allocation_balances TO authenticated;

COMMIT;
