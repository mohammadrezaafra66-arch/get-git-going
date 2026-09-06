-- 505: make credit_requests a working approval workflow, and give approval something to do.
--
-- STATE BEFORE THIS MIGRATION (measured 2026-09-06)
--   credit_requests: 0 rows, 0 references anywhere in src/, no workflow function, no trigger,
--   no reviewed_at column, and no audit trigger. Its policies were:
--     cr_insert_sales      | INSERT | CHECK has_any_role(uid, {admin,manager,sales,accountant})
--     cr_read_privileged   | SELECT | has_any_role(uid,{admin,manager,accountant})
--                                     OR (has_role(uid,'sales') AND requested_by = uid)
--     cr_update_privileged | UPDATE | has_any_role(uid, {admin,accountant})
--     viewer_restricted    | ALL    | NOT is_viewer_only(uid)
--   So a manager could SEE a request and could not APPROVE one. D-53 fixes that.
--
-- (b) WHY A NEW COLUMN AND WHY A FLOOR, NOT A CEILING
--   D-52: approval = override; the customer leaves the formula and a manual ceiling applies.
--   The formula already has a manual input - customer_credit_profile.credit_limit - but
--   recompute_dynamic_capital_setting applies it as a CEILING:
--       WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
--   so raising it can never lift final_limit above raw_allocation. It is the wrong direction
--   and cannot be reused.
--
--   The override also could NOT live on customer_credit_profile, and this is not a style
--   preference. That table holds ZERO rows, and credit_limit is NOT NULL DEFAULT 0 with
--   CHECK (credit_limit >= 0). Creating a profile row merely to carry an override would give
--   that customer credit_limit = 0, and the ceiling branch above would then clamp their
--   final_limit to 0 - the approval would zero the customer it was meant to raise. The
--   override therefore lives on customers as a NULLABLE column with no default, where NULL
--   unambiguously means "no override" and existing rows are untouched.
--
--   customers.manual_credit_floor adds no foreign key, so migration 328's persons registry
--   gate is not engaged (verified: person_fk_registry_report() clean before and after).
--
-- 🔴 X-1's GUARD IS NOT TOUCHED. recompute_dynamic_capital_setting was read live with
--   pg_get_functiondef (rule 4) and is re-created here from THAT text, not from git. X's
--   safety lock - _capital_setting_reservation_count(p_setting_id) > 0 returning
--   {"skipped": true, "reason": "ledger_exists"} - is reproduced byte for byte and still sits
--   ahead of every write. The floor is added AFTER the guard, in the allocation body, so a
--   setting with a live reservation still returns early and writes nothing.
--
--   The formula block itself is left byte-identical and the floor is a SEPARATE second
--   UPDATE, so the previous behaviour is still visible as one unmodified statement.
--
-- 🔴 has_overdue STILL WINS OVER THE FLOOR - flagged for the owner.
--   D-52 says an approved customer leaves the formula; it does not say an approved customer
--   escapes the overdue block. This migration takes the conservative reading: a customer
--   flagged has_overdue keeps final_limit 0 and binding_constraint 'overdue' even with an
--   override set. Getting this backwards would silently extend credit to a defaulting
--   customer; getting it this way round is visible and recoverable, because the row says
--   'overdue'. If the owner wants the override to beat overdue, that is a one-line change to
--   the WHERE of the floor UPDATE below. Today this path is dormant: customer_credit_profile
--   holds 0 rows, so has_overdue is false for every customer.
--
-- Reverse with docs/verification/505-down.sql.

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- 1. The missing review timestamp.
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_requests
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.credit_requests.reviewed_at IS
  'When the request was approved or rejected. NULL while status = ''pending''. Written only by review_credit_request().';

-- ---------------------------------------------------------------------------
-- 2. The manual ceiling override. NULL = no override, and the formula runs untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS manual_credit_floor numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.customers'::regclass
       AND conname = 'customers_manual_credit_floor_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_manual_credit_floor_check
      CHECK (manual_credit_floor IS NULL OR manual_credit_floor >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.customers.manual_credit_floor IS
  'Manual credit ceiling override granted by an approved credit_requests row (D-52). Applied by recompute_dynamic_capital_setting as a FLOOR - final_limit is raised to it when the formula would give less - which is the opposite direction to customer_credit_profile.credit_limit, a CEILING. NULL means no override. Written only by review_credit_request().';

-- ---------------------------------------------------------------------------
-- 3. binding_constraint gains the value that says "this customer left the formula".
--    'floor' is already taken and means something else entirely - it marks a customer
--    dropped out of the allocation and zeroed - so it is NOT reused here.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_capital_allocations_dynamic
  DROP CONSTRAINT IF EXISTS customer_capital_allocations_dynamic_binding_constraint_check;

ALTER TABLE public.customer_capital_allocations_dynamic
  ADD CONSTRAINT customer_capital_allocations_dynamic_binding_constraint_check
  CHECK (binding_constraint = ANY (ARRAY['formula','credit_limit','overdue','floor','manual_override']));

-- ---------------------------------------------------------------------------
-- 4. (a) D-53 - manager joins the UPDATE policy.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cr_update_privileged ON public.credit_requests;
CREATE POLICY cr_update_privileged ON public.credit_requests
  FOR UPDATE TO authenticated
  USING      (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]));

-- ---------------------------------------------------------------------------
-- 5. Audit. credit_requests had NO audit trigger, and an approval moves a customer's credit
--    ceiling - a sensitive action (CLAUDE.md rule 10). Following X's H-1 single-writer rule,
--    the TRIGGER is the audit writer and review_credit_request() below does NOT also insert
--    an audit row, so an approval produces exactly one. Shaped on audit_credit_rule_change().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_credit_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    auth.uid(),
    CASE WHEN tg_op = 'INSERT' THEN 'credit_request_created'
         ELSE 'credit_request_' || NEW.status END,
    'credit_requests',
    NEW.id::text,
    jsonb_build_object(
      'customer_id',      NEW.customer_id,
      'requested_amount', NEW.requested_amount,
      'status',           NEW.status,
      'old_status',       CASE WHEN tg_op = 'UPDATE' THEN OLD.status ELSE NULL END,
      'reviewed_by',      NEW.reviewed_by
    )
  );
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_credit_requests_audit ON public.credit_requests;
CREATE TRIGGER trg_credit_requests_audit
  AFTER INSERT OR UPDATE OF status ON public.credit_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_credit_request_change();

-- ---------------------------------------------------------------------------
-- 6. The workflow function. It exists rather than letting the browser UPDATE directly
--    because approval must also write customers.manual_credit_floor, and no browser role may
--    be allowed to set a credit ceiling on its own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_credit_request(
  p_request_id uuid,
  p_decision   text,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_req   record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden: credit requests may only be reviewed by an authenticated caller'
      USING errcode = '42501';
  END IF;

  -- D-53: manager reviews too. Cast explicitly - has_any_role is overloaded on text[] and
  -- app_role[], and an uncast array literal is ambiguous.
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'unauthorized: reviewing a credit request requires admin, manager or accountant'
      USING errcode = '42501';
  END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision %, expected approved or rejected', p_decision
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_req FROM public.credit_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'credit request not found: %', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'credit request % is already %', p_request_id, v_req.status
      USING errcode = '22023';
  END IF;

  UPDATE public.credit_requests
     SET status      = p_decision,
         reviewed_by = v_actor,
         reviewed_at = now(),
         notes       = COALESCE(p_notes, notes)
   WHERE id = p_request_id;

  -- The override itself (D-52). Rejection deliberately leaves any existing floor alone -
  -- rejecting a new request is not a decision to revoke a ceiling granted earlier.
  IF p_decision = 'approved' THEN
    UPDATE public.customers
       SET manual_credit_floor = v_req.requested_amount
     WHERE id = v_req.customer_id;
  END IF;

  RETURN jsonb_build_object(
    'request_id',   p_request_id,
    'status',       p_decision,
    'customer_id',  v_req.customer_id,
    'manual_credit_floor',
      CASE WHEN p_decision = 'approved' THEN v_req.requested_amount ELSE NULL END,
    'reviewed_by',  v_actor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.review_credit_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_credit_request(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.review_credit_request(uuid, text, text) IS
  'Approve or reject a credit request. Requires admin, manager or accountant (D-53). On approval, writes customers.manual_credit_floor = requested_amount, which recompute_dynamic_capital_setting then applies as a FLOOR (D-52). Audit row comes from trg_credit_requests_audit, not from here.';
