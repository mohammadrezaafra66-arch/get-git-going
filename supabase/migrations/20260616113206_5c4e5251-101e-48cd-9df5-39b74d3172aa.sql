-- SF-1.c1: remove unused anon access from quote tables.
-- No RLS, trigger, function, or authenticated/service_role/postgres grant changes.
-- Reversible via the rollback GRANTs documented in the SF-1.c1 plan.
REVOKE ALL ON TABLE public.sales_quotes      FROM anon;
REVOKE ALL ON TABLE public.sales_quote_items FROM anon;