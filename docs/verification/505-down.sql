-- Reverse of migration 505. Applied to the afrakala database.
-- Run 506-down.sql FIRST: recompute_dynamic_capital_setting reads
-- customers.manual_credit_floor, so dropping the column while 506's version of the function
-- is live would break every recompute.
SET client_encoding = 'UTF8';

DROP FUNCTION IF EXISTS public.review_credit_request(uuid, text, text);
DROP TRIGGER IF EXISTS trg_credit_requests_audit ON public.credit_requests;
DROP FUNCTION IF EXISTS public.audit_credit_request_change();

-- D-53 back out: manager loses the UPDATE policy again.
DROP POLICY IF EXISTS cr_update_privileged ON public.credit_requests;
CREATE POLICY cr_update_privileged ON public.credit_requests
  FOR UPDATE TO authenticated
  USING      (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

ALTER TABLE public.customer_capital_allocations_dynamic
  DROP CONSTRAINT IF EXISTS customer_capital_allocations_dynamic_binding_constraint_check;
ALTER TABLE public.customer_capital_allocations_dynamic
  ADD CONSTRAINT customer_capital_allocations_dynamic_binding_constraint_check
  CHECK (binding_constraint = ANY (ARRAY['formula','credit_limit','overdue','floor']));

-- The two columns are NOT dropped. Both may hold real decisions by the time anyone reverses
-- this, and CLAUDE.md rule 3 forbids destroying data. Drop them by hand, deliberately:
--   ALTER TABLE public.customers        DROP COLUMN manual_credit_floor;
--   ALTER TABLE public.credit_requests  DROP COLUMN reviewed_at;
