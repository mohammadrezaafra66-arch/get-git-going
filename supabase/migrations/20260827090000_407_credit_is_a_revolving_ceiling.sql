SET client_encoding='UTF8';

-- 407 — M11: credit becomes a REVOLVING CEILING in fact, not only in the reader. One reservation
-- family lives, the other is retired explicitly, and the mint is removed.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE DECISION, AND WHY THE EVIDENCE MAKES IT
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Two complete reservation families existed, both with zero callers:
--
--   FAMILY 1  hold_credit / release_credit / increase_credit
--             storage: customer_credit_balance.held_credit + customer_credit_ledger
--   FAMILY 2  hold_/release_/consume_/refund_capital_allocation
--             storage: capital_allocation_ledger (0 rows), helper _capital_alloc_used
--
-- **FAMILY 1 LIVES.** Not by preference — because its storage is ALREADY WIRED into the active
-- read path. `get_customer_dynamic_credit`, which the quote UI calls
-- (`src/routes/_app.sales.quotes.new.tsx:180`), already computes
--     GREATEST(final_limit - outstanding - held, 0)
-- reading `held` from `customer_credit_balance.held_credit`. **The read side of the ceiling
-- reservation is built and live; it has simply always read zero, because nothing ever wrote it.**
-- Making family 1 work needs one guard fixed. Making family 2 work would need the reader rewired.
--
-- **FAMILY 2's WRITERS ARE RETIRED**, not left lying around — two parallel paths for one concept
-- is the pattern this project has been hurt by repeatedly, and "dead code that still compiles"
-- is how the second one gets picked next time.
--   RETAINED deliberately: `_capital_alloc_used` and `capital_allocation_ledger`. Two views
--   consume the helper (`v_dynamic_customer_capital_balances`,
--   `v_dynamic_salesperson_capital_balances`) and OG-45's security pin depends on
--   `supabase_read_only_user` being unable to execute it. Dropping it would break both.
--   With the ledger empty, those views correctly report zero held and zero consumed.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE BLOCKER THIS FIXES: hold_credit COULD NOT SUCCEED FOR ANY CUSTOMER
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `hold_credit` guarded against the STORED WALLET `customer_credit_balance.available_credit`,
-- and `_ensure_credit_balance` seeds a new row from
--     COALESCE((SELECT credit_limit FROM customer_credit_profile WHERE …), 0)
-- `customer_credit_profile` has **0 rows** (measured), so every new balance seeds
-- `available_credit = 0` and the guard raised «اعتبار کافی نیست» for every customer without a
-- hand-seeded row. The feature could not have worked had anyone called it.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE MINT IS REMOVED (OG-17 option ب)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- The owner's model: "a receipt that raises free credit RELEASES ceiling, it does not mint
-- money." `increase_credit` did the opposite — it INCREMENTED the stored wallet — and it is
-- called from **two live paths**: `post_receipt_accounting` and `create_receipt`.
--
-- It keeps its name and signature deliberately. Renaming would break both call sites and the
-- generated types for no behavioural gain; the body now RELEASES ceiling and the name is
-- documented as historical. It is safe to change today because `held_credit` is 0 for every
-- customer (measured: 13 balance rows, 0 with a non-zero hold), so a release is a no-op until
-- something starts holding — and `get_customer_dynamic_credit` ignores `available_credit`
-- entirely, so no figure the quote UI shows moves.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES **NOT** DO
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- It does not wire the hold into quote acceptance. `update_sales_quote_status` is untouched.
-- Whether an accepted quote with insufficient ceiling should be REFUSED or merely recorded is a
-- business decision, not a technical one: the current UI deliberately records a shortfall
-- (`quote_exception_type` / `_amount` / `_text`) rather than blocking a sale. Raised as OG-79.
--
-- A second reason to stop here: `sales_quotes_validate_status` forbids `accepted → canceled`, so
-- an accepted quote has NO cancellation path. Reserving on accept with release only on payment
-- means an accepted-but-never-paid quote holds ceiling permanently. That is arguably correct —
-- the customer does owe it — but it is a business consequence the owner should choose, not one a
-- migration should impose.

--
-- RETURNS void, MATCHING THE EXISTING SIGNATURES EXACTLY. All seven functions return `void`
-- today, and for a `RETURNS` clause that IS part of the signature: declaring `numeric` would
-- fail with "cannot change return type of existing function", and working around it with
-- DROP + CREATE would discard the grants on two functions that live money paths call. Both
-- callers use `PERFORM`, so the return value was never read.

-- ─── 1. hold_credit: guard against the CEILING, not the wallet ───────────────────────────────
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
BEGIN
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
          COALESCE(_held, 0), _new_held, 'sales_quote', p_invoice_id, p_user_id);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (p_user_id, 'customer_credit', p_customer_id, 'credit_hold',
          jsonb_build_object('amount', p_amount, 'held_after', _new_held,
                             'available_before', _avail, 'reference_id', p_invoice_id));

  RETURN;
END
$function$;

-- ─── 2. release_credit: give ceiling back, never below zero ──────────────────────────────────
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
BEGIN
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
          COALESCE(_held, 0), _new_held, 'payment_receipt', p_invoice_id, p_user_id);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (p_user_id, 'customer_credit', p_customer_id, 'credit_release',
          jsonb_build_object('requested', p_amount, 'released', _release,
                             'held_after', _new_held, 'reference_id', p_invoice_id));

  RETURN;
END
$function$;

-- ─── 3. increase_credit STOPS MINTING and becomes a release ──────────────────────────────────
-- Name and signature preserved on purpose: `post_receipt_accounting` and `create_receipt` both
-- call it, and renaming would change two live money paths and the generated types for no
-- behavioural gain. The name is historical; the behaviour is now the owner's model.
CREATE OR REPLACE FUNCTION public.increase_credit(
  p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- OG-17 option (ب): a receipt RELEASES ceiling. It does not mint money. The previous body
  -- incremented the stored wallet `customer_credit_balance.available_credit`, which
  -- `get_customer_dynamic_credit` ignores — so it inflated a number nobody reads while the real
  -- ceiling never moved.
  PERFORM public.release_credit(p_customer_id, p_amount, p_receipt_id, p_user_id);
END
$function$;

-- ─── 4. Family 2's writers are RETIRED, loudly ───────────────────────────────────────────────
-- Not dropped: `capital_allocation_ledger` and `_capital_alloc_used` stay because two views read
-- the helper and OG-45's pin depends on it. The four WRITERS raise instead of writing, so a
-- future caller gets an immediate, explanatory failure rather than silently starting a second
-- reservation model in a table nothing reconciles.
DO $retire$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['hold_capital_allocation','release_capital_allocation',
                            'consume_capital_allocation','refund_capital_allocation'] LOOP
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION public.%I(p_customer_id uuid, p_amount numeric,
                                           p_invoice_id uuid, p_user_id uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
      AS $b$
      BEGIN
        RAISE EXCEPTION 'این مسیر رزرو بازنشسته شده است؛ از hold_credit/release_credit استفاده کنید (M11)'
          USING ERRCODE = '0A000';
      END
      $b$;$f$, fn);
  END LOOP;
END
$retire$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Assertions. Behavioural, inside a savepoint that rolls back — a catalogue check cannot tell a
-- corrected guard from a broken one.
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  v_cust   uuid;
  v_avail  numeric;
  v_held   numeric;
  v_ok     boolean;
BEGIN
  -- The retired writers must refuse.
  v_ok := false;
  BEGIN
    PERFORM public.hold_capital_allocation(gen_random_uuid(), 1, gen_random_uuid(), gen_random_uuid());
  EXCEPTION WHEN feature_not_supported THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '407: hold_capital_allocation still writes; family 2 was not retired';
  END IF;

  -- `increase_credit` must no longer mint. Checked against CODE, not comments: an earlier draft
  -- of this very assertion failed because the new body's explanatory comment names the wallet
  -- column while the code never touches it. `regexp_replace` strips line comments first, which
  -- is the difference between asserting behaviour and asserting prose.
  IF regexp_replace(pg_get_functiondef('public.increase_credit'::regproc), '--[^
]*', '', 'g')
       ILIKE '%available_credit%' THEN
    RAISE EXCEPTION '407: increase_credit still touches the wallet in CODE — the mint survives';
  END IF;
  IF regexp_replace(pg_get_functiondef('public.increase_credit'::regproc), '--[^
]*', '', 'g')
       NOT ILIKE '%release_credit%' THEN
    RAISE EXCEPTION '407: increase_credit does not release ceiling';
  END IF;

  -- And hold_credit must guard against the CEILING, not the wallet.
  IF regexp_replace(pg_get_functiondef('public.hold_credit'::regproc), '--[^
]*', '', 'g')
       ILIKE '%b.available_credit%' THEN
    RAISE EXCEPTION '407: hold_credit still guards on the stored wallet';
  END IF;

  -- BEHAVIOURAL: find a customer with real ceiling and exercise hold → release.
  --
  -- The JWT claim is required, not decorative: `get_customer_dynamic_credit` carries its own
  -- role guard and raises «دسترسی غیرمجاز» without one. A first draft of this probe failed there
  -- and would have been easy to misread as the new code being broken.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT (array_agg(user_id ORDER BY user_id))[1]
                                FROM public.user_roles WHERE role = 'admin'),
                      'role', 'authenticated')::text, true);

  SELECT c.id INTO v_cust
    FROM public.customers c
   WHERE (SELECT g.available_credit FROM public.get_customer_dynamic_credit(c.id) g) > 0
   ORDER BY c.id LIMIT 1;

  IF v_cust IS NULL THEN
    RAISE NOTICE '407: no customer has available ceiling; primitives created but not exercised';
    RETURN;
  END IF;

  SELECT g.available_credit INTO v_avail FROM public.get_customer_dynamic_credit(v_cust) g;

  BEGIN
    PERFORM public.hold_credit(v_cust, 1, gen_random_uuid(),
                               (SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1));
    SELECT b.held_credit INTO v_held FROM public.customer_credit_balance b WHERE b.customer_id = v_cust;
    IF COALESCE(v_held,0) < 1 THEN
      RAISE EXCEPTION '407: hold_credit did not increase held_credit';
    END IF;

    -- CONSUMES ceiling: the reader must now show 1 less.
    IF (SELECT g.available_credit FROM public.get_customer_dynamic_credit(v_cust) g) <> v_avail - 1 THEN
      RAISE EXCEPTION '407: the hold did not consume ceiling (before %, after %)',
        v_avail, (SELECT g.available_credit FROM public.get_customer_dynamic_credit(v_cust) g);
    END IF;

    -- And a release must give it back — the revolving half.
    PERFORM public.release_credit(v_cust, 1, gen_random_uuid(),
                                  (SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1));
    IF (SELECT g.available_credit FROM public.get_customer_dynamic_credit(v_cust) g) <> v_avail THEN
      RAISE EXCEPTION '407: the release did not restore the ceiling';
    END IF;

    RAISE NOTICE '407: verified - hold consumed ceiling (% -> %) and release restored it',
      v_avail, v_avail - 1;
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
      RAISE NOTICE '407: probe rolled back; no credit row was modified';
  END;
END
$verify$;
