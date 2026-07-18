-- Grant execute on daily-capital RPC functions to authenticated users.
-- Table RLS already restricts data appropriately.
REVOKE ALL ON FUNCTION public.compute_daily_capital(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_daily_capital(date) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_daily_capital_input(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_daily_capital_input(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.save_daily_capital_snapshot(date, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_capital_snapshot(date, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.run_daily_capital_allocation(date, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_daily_capital_allocation(date, numeric, text) TO authenticated;