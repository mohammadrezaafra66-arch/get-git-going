SET client_encoding='UTF8';

-- 461 - gate the credit ledger: hold_credit and release_credit.
--
-- ASCII-ONLY BY DESIGN, following 436. Every string this file ADDS is an API-level refusal, not
-- a UI string. The Persian argument-validation messages already inside the two bodies are
-- carried through unchanged because they are pre-existing product text; nothing new is Persian.
--
-- Owner decision D-13: the credit ledger IS hold_credit / release_credit. The capital-allocation
-- cycle was retired by migration 447 and is NOT revived here.
-- Owner decision D-16: this closes FIRST, in its own migration, before the rest of the money tier.
--
-- ============================================================================
-- 0. THE SUBJECT LIST, DERIVED. Stated verbatim so the next reader can re-run it.
-- ============================================================================
--
-- A prior census is quoted in this repo as reproducing "to the digit" at 63 | 15 | 48 | 0
-- (writers reachable by authenticated | with a non-role guard | genuinely bare | still
-- anon-reachable). It did NOT reproduce, under this query or any of the four variants tried.
-- This is the query these five migrations (461-465) actually select on, run 2026-09-06:
--
--     SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.prosecdef
--       AND p.prokind = 'f'
--       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
--       AND pg_get_function_result(p.oid) <> 'trigger'
--       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
--       AND p.prosrc ~* '(^|[^a-z_])(insert\s+into|update\s+[a-z_."]+\s+set|delete\s+from|truncate)'
--       AND p.prosrc !~* 'has_role|has_any_role|is_admin|is_super_admin|user_roles'
--                        '|current_user_role|require_role|assert_role|_require_privileged'
--                        '|gamification_assert_manager|is_active_actor';
--
--   416 SECURITY DEFINER functions in public; 405 grant EXECUTE to authenticated.
--   141 non-trigger writers reachable by authenticated. 89 carry a role check. 52 do not.
--   Of the 52, 11 also grant EXECUTE to anon.
--
-- Every one of the 52 bodies was read. The count that matters is NOT 52: hand-reading split
-- them into 20 that carry a REAL non-role authorization check (group-admin ownership in the
-- messenger family, a capability row in the bot family, appeal-reviewer standing, auth.uid()
-- row-scoping in the notification family) and 32 that carry none. The e2e gate that guards this
-- class after 465 uses a wider, delegation-following derivation and lands on 46; 11 of those
-- are allowlisted with a written reason and 35 are actioned across 461-465.
--
-- A "RAISE means it is guarded" filter is WRONG on this codebase and these two functions are the
-- proof. See section 1.
--
-- ============================================================================
-- 1. WHAT IS OPEN, measured live 2026-09-06
-- ============================================================================
--
--     hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
--     release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
--     both: prosecdef = t | authenticated EXECUTE = t | anon EXECUTE = f
--
-- Both raise. NEITHER RAISE IS AUTHORIZATION:
--
--     IF p_amount IS NULL OR p_amount <= 0 THEN
--       RAISE EXCEPTION '<Persian: the amount must be greater than zero>' ERRCODE '22023';
--
-- 22023 is invalid_parameter_value. It refuses a bad NUMBER. It does not look at the caller.
-- Every other RAISE in the two bodies is the same shape (P0001 for "no ceiling set", "not
-- enough credit"). There is no has_role, no has_any_role, no 42501 anywhere in either function.
--
-- TWO SEPARATE DEFECTS, and they are not the same defect:
--
--   (a) AUTHORIZATION. `release_credit` is reachable by ANY authenticated user, `viewer`
--       included, and writes customer_credit_balance.held_credit, customer_credit_ledger and
--       audit_logs. Nothing in its body consults the caller.
--
--       `hold_credit` is a MEASURED EXCEPTION and this file records it rather than smoothing it
--       over: its second statement reads the ceiling through
--       public.get_customer_dynamic_credit(), which already carries
--         IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales'])
--       and raises for anyone else. So a `viewer` calling hold_credit today is refused - by a
--       nested call, incidentally, three statements before the first write. That is a guard by
--       accident of call order, it is invisible at the call site, and it disappears the moment
--       anyone inlines the ceiling read. It is NOT a reason to leave hold_credit ungated.
--
--   (b) ACTOR FORGERY, and this one is equally true of both. `p_user_id` is taken from the
--       CALLER and written straight into audit_logs.actor_id and
--       customer_credit_ledger.created_by. The audit trail therefore records whoever the caller
--       says it is. An audit row that the subject chooses the name on is not an audit row.
--
-- ============================================================================
-- 2. THE ROLE SET, and why it is this one
-- ============================================================================
--
-- ARRAY['admin','manager','accountant','sales']::text[]
--
-- Not invented here. It is copied from public.get_customer_dynamic_credit, the ceiling reader
-- that hold_credit itself calls on its second line - so the set is already, today, the set that
-- can see a customer's available credit. Making the WRITE gate narrower than the READ gate that
-- the write depends on would be incoherent; making it wider would be a new grant.
--
-- Each member has a path that must keep working:
--   sales       - src/routes/_app.sales.quotes.new.tsx calls expire_stale_credit_holds as the
--                 signed-in salesperson; that function PERFORMs release_credit.
--   accountant  - public.create_receipt and public.post_receipt_accounting call
--                 public.increase_credit, whose entire body is PERFORM release_credit(...).
--   admin,
--   manager     - hold_credit is reached from update_sales_quote_status via
--                 hold_credit_for_quote, whose own gate admits admin and manager unconditionally.
--
-- `viewer` is the role this refuses, and it is the role the finding is about.
-- public.has_any_role(NULL, ...) returns false (verified), so an unauthenticated caller is
-- refused by the same line.
--
-- user_roles.role is TEXT. The ::text[] cast is REQUIRED - the bare-literal form is ambiguous
-- against the app_role[] overload.
--
-- ============================================================================
-- 3. THE ACTOR IS NOW auth.uid()
-- ============================================================================
--
-- `p_user_id` is KEPT IN BOTH SIGNATURES and is deliberately IGNORED for the audit actor.
--
-- Keeping it is not politeness. Dropping it would change the signature, and the signature is
-- live in four places: public.hold_credit_for_quote, public.expire_stale_credit_holds and
-- public.increase_credit all pass a fourth argument, and src/integrations/supabase/types.ts is
-- generated from it. Changing an arity to fix an audit field would be a larger, riskier edit
-- than the defect warrants.
--
-- So the parameter stays and its VALUE stops being trusted. actor_id and created_by are now
-- auth.uid(). The value the caller supplied is not discarded - it is recorded in the audit diff
-- as `claimed_user_id`, and only when it disagrees with auth.uid(). A caller that lies about
-- who it is now leaves the lie in the record next to the truth.
--
-- expire_stale_credit_holds passes NULL as p_user_id on purpose (an unattended sweep). Under
-- this change that call now audits the salesperson whose page-load ran the sweep, which is more
-- accurate than NULL, not less.
--
-- ============================================================================
-- 4. GRANTS
-- ============================================================================
--
-- REVOKE from anon, PUBLIC and authenticated. `FROM authenticated` is added only because both
-- functions have NO direct caller anywhere in the application, proven by:
--
--     $ grep -rlF 'hold_credit'    src server   ->  src/integrations/supabase/types.ts
--     $ grep -rlF 'release_credit' src server   ->  src/integrations/supabase/types.ts
--
-- types.ts is the GENERATED type surface, not a call site. This is the same reasoning migration
-- 436 applied to apply_stock_movement.
--
-- The internal path is unaffected: hold_credit_for_quote, expire_stale_credit_holds and
-- increase_credit are themselves SECURITY DEFINER, so inside them current_user is the function
-- owner and the owner's EXECUTE is what is checked - not the session role's.
--
-- PUBLIC is revoked separately and is NOT redundant. Wave 3 established that a `=X/supabase_admin`
-- entry in proacl is a PUBLIC grant and survives `REVOKE ... FROM anon` untouched.
--
-- CREATE OR REPLACE silently restores default grants, which is why the REVOKEs come AFTER the
-- replaces and are re-asserted by the verify block in section 6.

-- --------------------------------------------------------------------------------------------
-- 5a. hold_credit
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_credit(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _person   uuid;
  _avail    numeric;
  _held     numeric;
  _new_held numeric;
  _actor    uuid := auth.uid();
  _claimed  jsonb := '{}'::jsonb;
BEGIN
  -- 461: authorization, FIRST, before any read and long before any write. has_any_role(NULL, ..)
  -- is false, so this also refuses an unauthenticated caller.
  IF NOT public.has_any_role(_actor,
        ARRAY['admin','manager','accountant','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only admin, manager, accountant or sales may hold customer credit'
      USING ERRCODE = '42501';
  END IF;

  -- 461: the caller-supplied p_user_id is no longer the actor. It is kept only as evidence when
  -- it disagrees with the authenticated identity.
  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM _actor THEN
    _claimed := jsonb_build_object('claimed_user_id', p_user_id);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ رزرو اعتبار باید بزرگ‌تر از صفر باشد' USING ERRCODE = '22023';
  END IF;

  -- The ceiling, from the SAME function the UI reads. Deriving it here independently would
  -- create a second definition of "available credit" that could drift from the one the customer
  -- was shown — which is the whole failure this migration exists to end.
  SELECT c.available_credit INTO _avail
    FROM public.get_customer_dynamic_credit(p_customer_id) c;

  IF _avail IS NULL THEN
    RAISE EXCEPTION 'سقف اعتبار برای این مشتری تعیین نشده است' USING ERRCODE = 'P0001';
  END IF;
  IF _avail < p_amount THEN
    RAISE EXCEPTION 'اعتبار کافی نیست (قابل استفاده: %، درخواست: %)', _avail, p_amount
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);
  SELECT b.held_credit INTO _held
    FROM public.customer_credit_balance b WHERE b.customer_id = p_customer_id FOR UPDATE;
  _new_held := COALESCE(_held, 0) + p_amount;

  -- Only `held_credit` moves. `available_credit` is the retired wallet and is deliberately not
  -- touched: the ceiling reader ignores it, and writing it would resurrect the second model.
  UPDATE public.customer_credit_balance
     SET held_credit = _new_held, updated_at = now()
   WHERE customer_id = p_customer_id;

  SELECT b.customer_person_id INTO _person
    FROM public.customer_credit_balance b WHERE b.customer_id = p_customer_id;

  -- balance_before/after are NOT NULL with no default. They record the HELD balance, which is
  -- what a hold/release row describes — not the retired wallet, which these functions never read.
  INSERT INTO public.customer_credit_ledger
    (customer_id, customer_person_id, transaction_type, amount,
     balance_before, balance_after, reference_type, reference_id, created_by)
  VALUES (p_customer_id, _person, 'hold', p_amount,
          COALESCE(_held, 0), _new_held, 'sales_quote', p_invoice_id, _actor);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_actor, 'customer_credit', p_customer_id, 'credit_hold',
          jsonb_build_object('amount', p_amount, 'held_after', _new_held,
                             'available_before', _avail, 'reference_id', p_invoice_id)
          || _claimed);

  RETURN;
END
$function$;

-- --------------------------------------------------------------------------------------------
-- 5b. release_credit
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_credit(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _person   uuid;
  _held     numeric;
  _release  numeric;
  _new_held numeric;
  _actor    uuid := auth.uid();
  _claimed  jsonb := '{}'::jsonb;
BEGIN
  -- 461: authorization, FIRST. This function had NO caller check at all: it neither consulted a
  -- role nor, unlike hold_credit, reached a nested function that did. Any authenticated user
  -- could move held_credit for any customer and sign the ledger with any name.
  IF NOT public.has_any_role(_actor,
        ARRAY['admin','manager','accountant','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only admin, manager, accountant or sales may release customer credit'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM _actor THEN
    _claimed := jsonb_build_object('claimed_user_id', p_user_id);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ آزادسازی اعتبار باید بزرگ‌تر از صفر باشد' USING ERRCODE = '22023';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);
  SELECT b.held_credit, b.customer_person_id INTO _held, _person
    FROM public.customer_credit_balance b WHERE b.customer_id = p_customer_id FOR UPDATE;

  -- Release AT MOST what is held. A payment can exceed the reservation — a customer may pay more
  -- than one quote reserved — and releasing more than was held would MINT ceiling, which is the
  -- exact behaviour this model rejects. The excess simply reduces nothing here; it belongs to
  -- `outstanding_balance`, which the ceiling reader already subtracts separately.
  _release  := LEAST(p_amount, COALESCE(_held, 0));
  _new_held := COALESCE(_held, 0) - _release;

  IF _release = 0 THEN
    RETURN;   -- nothing held; not an error, just nothing to give back
  END IF;

  UPDATE public.customer_credit_balance
     SET held_credit = _new_held, updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, customer_person_id, transaction_type, amount,
     balance_before, balance_after, reference_type, reference_id, created_by)
  VALUES (p_customer_id, _person, 'release', _release,
          COALESCE(_held, 0), _new_held, 'payment_receipt', p_invoice_id, _actor);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_actor, 'customer_credit', p_customer_id, 'credit_release',
          jsonb_build_object('requested', p_amount, 'released', _release,
                             'held_after', _new_held, 'reference_id', p_invoice_id)
          || _claimed);

  RETURN;
END
$function$;

-- --------------------------------------------------------------------------------------------
-- 5c. GRANTS. After the replaces, because CREATE OR REPLACE restores the defaults.
-- --------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) FROM PUBLIC;

-- --------------------------------------------------------------------------------------------
-- 6. VERIFY, in the same transaction.
-- --------------------------------------------------------------------------------------------
DO $verify$
DECLARE
  v_fn    text;
  v_open  text[] := '{}';
  v_admin uuid;
BEGIN
  -- 6a. no role but service_role and the owner may hold EXECUTE.
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.proname IN ('hold_credit', 'release_credit')
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;

  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '461: EXECUTE still held on: %', array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '461: verified - neither anon nor authenticated holds EXECUTE';

  -- 6b. the OPEN half of the grant. Revoking from every role would satisfy 6a perfectly and
  --     would kill the quote flow silently.
  IF NOT has_function_privilege('service_role',
        'public.release_credit(uuid,numeric,uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '461: service_role lost EXECUTE on release_credit - the revoke went too far';
  END IF;
  RAISE NOTICE '461: verified - service_role still reaches the ledger';

  -- 6c. the BODY guard, probed WITHOUT calling either function.
  --
  --     Rule: never call a credit function to test it. A call that gets past the guard moves
  --     real money, and the whole point of a forced-disturbance exercise is to remove the guard
  --     that would have stopped it. So the guard is evaluated directly, on the same predicate
  --     the body runs, under the same set_config identity PostgREST would present.
  --
  --     An all-zeros sub is a uuid that holds no role, which is exactly a `viewer`-or-worse
  --     caller, and it cannot be a real person.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

  IF public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '461: an unprivileged authenticated sub PASSES the credit guard';
  END IF;

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '461: verified - an authenticated non-privileged caller is refused by the body';

  -- 6d. the OPEN half of the body guard. A gate written too tightly would satisfy 6c and leave
  --     the credit ledger dead for the people who run it.
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '461: no admin exists to prove the open half';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '461: a real admin is REFUSED by the credit guard - the gate is too tight';
  END IF;

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '461: verified - a real admin passes the credit guard';

  -- 6e. the actor is derived, not supplied. Asserted on the source rather than by calling: the
  --     body must reference auth.uid() and must NOT write p_user_id into the ledger or the audit.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('hold_credit', 'release_credit')
      AND (p.prosrc !~ 'auth\.uid\(\)'
           OR p.prosrc ~ 'reference_id, created_by\)[^;]*p_user_id')
  ) THEN
    RAISE EXCEPTION '461: the audit actor is still taken from p_user_id';
  END IF;
  RAISE NOTICE '461: verified - the audit actor is derived from auth.uid()';
END
$verify$;
