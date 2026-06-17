-- SF-1.c4: revoke direct authenticated UPDATE on sales_quotes.
-- Prerequisite: SF-1.c3 update_sales_quote_status RPC is merged and verified.
-- Status transitions must go through public.update_sales_quote_status(...).
-- This migration intentionally changes only the table-level UPDATE grant.
--
-- Rollback:
-- GRANT UPDATE ON TABLE public.sales_quotes TO authenticated;

REVOKE UPDATE ON TABLE public.sales_quotes FROM authenticated;
