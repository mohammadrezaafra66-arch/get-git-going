SELECT set_config('request.jwt.claims', '{"sub":"a13bbeb7-79c0-4960-956d-de2458ed8bc6","role":"authenticated"}', true);
DELETE FROM public.daily_capital_settings WHERE capital_date = CURRENT_DATE;
SELECT public.run_daily_capital_allocation(CURRENT_DATE, 30000000, 'تست 30M');