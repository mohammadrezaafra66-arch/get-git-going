
-- Phase 18.1B — Audit fix
-- Restrict direct SELECT on financial views. UI must use role-guarded RPCs.
-- Idempotent: REVOKE is safe to re-run.

REVOKE ALL ON public.vw_customer_receivables FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vw_supplier_payables    FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.vw_customer_receivables IS
  'Phase 18.1 — read-only receivables. Direct SELECT restricted (Phase 18.1B). Use get_receivables_summary RPC; list/detail RPCs in Phase 18.2.';

COMMENT ON VIEW public.vw_supplier_payables IS
  'Phase 18.1 — read-only payables. Direct SELECT restricted (Phase 18.1B). Use get_payables_summary RPC; list/detail RPCs in Phase 18.2. Partial purchase payments not modeled; multi-currency preserved without FX conversion.';
