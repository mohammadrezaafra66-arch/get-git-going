SET client_encoding='UTF8';

-- 409 — OG-80: the stale-hold window becomes 10 days, the sweep is BOUNDED, and it can never
-- take down quote creation.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHERE 10 COMES FROM — written down so nobody changes it for no reason
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- **The longest NORMAL gap between accepting a quote and being paid, in this business, is 5
-- days. The window is double that.** The doubling is deliberate slack: a real deal that runs a
-- little late must not have its ceiling released out from under it mid-transaction. Ten days is
-- long enough that a live deal is safe and short enough that an abandoned quote is reclaimed in
-- under a fortnight.
--
-- The previous default was 60, and that number meant nothing — it was chosen only so the
-- function was callable while the real value was an open question. 10 is the owner's measured
-- answer.
--
-- **It stays a PARAMETER, not a constant.** Changing how long a reservation survives must not
-- require a migration; a caller can pass a different window the day the business changes.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- BOUNDED WORK — the sweep must not walk the whole backlog on every call
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- It is now called from the new-quote page, so its cost is paid by a person waiting to write a
-- quote. `p_limit` caps how many stale holds one call releases. Progress is guaranteed without
-- any cursor or stored position: a released hold gains a matching `release` row and therefore
-- stops matching the predicate, so consecutive calls drain the backlog instead of re-walking it.
--
-- The ORDER BY is not cosmetic. Without it the LIMIT would pick an arbitrary subset each time,
-- which still drains but makes the behaviour untestable; oldest-first also means the most
-- overdue reservation is always the one reclaimed first.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SIGNATURE CHANGE, SO THE OLD ONE IS DROPPED (safety rule 5)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Adding `p_limit` makes this `(integer, integer)`. Without the DROP, `expire_stale_credit_holds(integer)`
-- would survive as an OVERLOAD and a one-argument call would become ambiguous at runtime — far
-- from this migration and hard to attribute. The old signature is named explicitly.

DROP FUNCTION IF EXISTS public.expire_stale_credit_holds(integer);

CREATE OR REPLACE FUNCTION public.expire_stale_credit_holds(
  p_days integer DEFAULT 10, p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _n   integer := 0;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'بازهٔ انقضای رزرو باید حداقل یک روز باشد' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'سقف تعداد رزروهای آزادشده در هر اجرا باید حداقل یک باشد' USING ERRCODE = '22023';
  END IF;

  FOR _row IN
    SELECT l.customer_id, l.reference_id AS quote_id,
           sum(l.amount) AS held_amount, min(l.created_at) AS held_since
      FROM public.customer_credit_ledger l
     WHERE l.transaction_type = 'hold'
       AND l.reference_type = 'sales_quote'
       AND l.created_at < now() - make_interval(days => p_days)
       AND NOT EXISTS (
         SELECT 1 FROM public.customer_credit_ledger r
          WHERE r.transaction_type = 'release'
            AND r.reference_id = l.reference_id)
     GROUP BY l.customer_id, l.reference_id
     ORDER BY min(l.created_at)          -- oldest first: bounded AND deterministic
     LIMIT p_limit
  LOOP
    PERFORM public.release_credit(_row.customer_id, _row.held_amount, _row.quote_id, NULL);

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (NULL, 'sales_quote', _row.quote_id, 'credit_hold_expired',
            jsonb_build_object('customer_id', _row.customer_id, 'released', _row.held_amount,
                               'held_since', _row.held_since, 'after_days', p_days,
                               'reason', 'رزرو اعتبار پس از مهلت بدون پرداخت آزاد شد'));
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer, integer) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Assertions. TWO-SIDED, with TIME SIMULATED rather than waited for — the same discipline OG-63
-- used for the Tehran window. Here the predicate is on DATA AGE, not on the clock, so the honest
-- simulation is a backdated ledger row: it exercises the real comparison against real rows.
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  v_cust    uuid;
  v_person  uuid;
  v_q11     uuid := gen_random_uuid();
  v_q9      uuid := gen_random_uuid();
  v_ok      boolean;
  v_n       int;
BEGIN
  -- No overload may survive.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '409: % signatures of expire_stale_credit_holds exist; a 1-arg call is ambiguous', v_n;
  END IF;

  -- Both guards must refuse nonsense rather than releasing everything.
  v_ok := false;
  BEGIN PERFORM public.expire_stale_credit_holds(0, 10);
  EXCEPTION WHEN invalid_parameter_value THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION '409: a zero-day window was accepted'; END IF;

  v_ok := false;
  BEGIN PERFORM public.expire_stale_credit_holds(10, 0);
  EXCEPTION WHEN invalid_parameter_value THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION '409: a zero limit was accepted'; END IF;

  SELECT b.customer_id, b.customer_person_id INTO v_cust, v_person
    FROM public.customer_credit_balance b LIMIT 1;
  IF v_cust IS NULL THEN
    RAISE NOTICE '409: no credit balance row to simulate against; guards asserted only';
    RETURN;
  END IF;

  -- Two holds on the same customer: one 11 days old, one 9 days old. Backdating `created_at` is
  -- the simulation — no clock is touched and the real predicate does the work.
  UPDATE public.customer_credit_balance SET held_credit = held_credit + 300 WHERE customer_id = v_cust;

  INSERT INTO public.customer_credit_ledger
    (customer_id, customer_person_id, transaction_type, amount, balance_before, balance_after,
     reference_type, reference_id, created_at)
  VALUES (v_cust, v_person, 'hold', 100, 0, 100, 'sales_quote', v_q11, now() - interval '11 days'),
         (v_cust, v_person, 'hold', 200, 100, 300, 'sales_quote', v_q9, now() - interval '9 days');

  v_n := public.expire_stale_credit_holds(10, 50);

  -- CLOSED: the 11-day reservation is released.
  IF NOT EXISTS (SELECT 1 FROM public.customer_credit_ledger
                  WHERE transaction_type = 'release' AND reference_id = v_q11) THEN
    RAISE EXCEPTION '409: an 11-day-old hold was NOT released by a 10-day window';
  END IF;

  -- OPEN: the 9-day reservation is left alone. Without this half, a sweep that released
  -- everything would pass the closed half perfectly and quietly free every live deal's ceiling.
  IF EXISTS (SELECT 1 FROM public.customer_credit_ledger
              WHERE transaction_type = 'release' AND reference_id = v_q9) THEN
    RAISE EXCEPTION '409: a 9-day-old hold WAS released by a 10-day window — live deals would lose their ceiling';
  END IF;

  IF v_n <> 1 THEN
    RAISE EXCEPTION '409: the sweep released % holds; exactly 1 was stale', v_n;
  END IF;

  RAISE NOTICE '409: verified - 11-day hold released, 9-day hold untouched, exactly 1 swept';
  RAISE EXCEPTION 'rollback_probe';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
    RAISE NOTICE '409: probe rolled back; no ledger row or balance was modified';
END
$verify$;
