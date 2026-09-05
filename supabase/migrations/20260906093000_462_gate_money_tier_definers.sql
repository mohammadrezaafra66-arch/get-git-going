SET client_encoding='UTF8';

-- 462 - the rest of the money tier. Follows 461 (D-16: the credit ledger closes first).
--
-- ASCII-ONLY BY DESIGN, following 436. The two Persian argument-validation strings inside
-- expire_stale_credit_holds are pre-existing product text carried through unchanged; nothing new
-- in this file is Persian.
--
-- Subject list derived by the query quoted verbatim in migration 461 section 0. Every body named
-- below was read in full on 2026-09-06.
--
-- ============================================================================
-- 0. THE HEADLINE FINDING: THREE FUNCTIONS WHOSE GUARD ADMITS ONLY THE ANONYMOUS CALLER
-- ============================================================================
--
--     start_market_rate_ingestion_run_system(p_source_code text)
--     finish_market_rate_ingestion_run_system(p_run_id uuid, p_status text, ...)
--     record_external_market_rate_tick_system(p_indicator_id uuid, p_source_id uuid, ...)
--
-- All three open with the SAME line, and it is inverted:
--
--     IF auth.uid() IS NOT NULL THEN
--       RAISE EXCEPTION 'system RPC: not callable by authenticated users';
--     END IF;
--
-- The intent is right - only the cron ingester should write market rates. The implementation is
-- backwards. `auth.uid()` is NULL for `service_role`, and it is ALSO NULL for `anon`. A guard
-- that refuses every caller with an identity admits precisely the callers without one. It is the
-- exact opposite of every other guard in this schema, and it means these three were not merely
-- ungated for the anonymous internet - they were ANONYMOUS-ONLY.
--
-- And the grant matched. Measured in proacl on 2026-09-06, all three carried an EXPLICIT
-- anon entry, not an inherited PUBLIC one:
--
--     {=X/supabase_admin,supabase_admin=X/...,anon=X/supabase_admin,
--      authenticated=X/...,service_role=X/...,postgres=X/...}
--       ^^^^^^^^^^^^^^^^                       ^^^^^^^^^^^^^^^^^^
--       PUBLIC grant                           explicit anon grant
--
-- WHY THIS MATTERS MORE THAN THE REST OF THIS FILE. PostgREST exposes every function in `public`,
-- and the anon key is published in the client bundle by design. So the reachable consequence of
-- `record_external_market_rate_tick_system` is that an unauthenticated caller could INSERT a row
-- into public.market_rate_ticks - the table that feeds public._par_latest_usd_rate(), which
-- public.check_price_alerts_for_product() uses to convert every product price to USD and which
-- the pricing recompute chain consumes. An outsider choosing the dollar rate chooses the
-- catalogue's prices. The same call also writes an audit_logs row with actor_id NULL.
--
-- NOT VERIFIED BY EXECUTION, and deliberately so: proving it end-to-end would mean POSTing a
-- forged rate into the live market_rate_ticks table. The rule is not to call a function to test
-- it. What IS verified is the whole chain that makes it reachable - the explicit anon grant in
-- proacl, the inverted guard read from the live body, and has_function_privilege('anon', ...) = t
-- before this migration and = f after it.
--
-- THE FIX IS A REVOKE, NOT A BODY CHANGE. The body is CORRECT for service_role, which is the only
-- caller it was ever meant to have: src/routes/api/public/hooks/ingest-market-rates.ts drives all
-- three through `supabaseAdmin` (the service-role client), whose auth.uid() is NULL. Rewriting
-- the guard to test for a role would break the only legitimate caller. Removing anon,
-- authenticated and PUBLIC from the grant leaves service_role as the only role that can reach
-- them, which is exactly the intent the body was trying and failing to express.
--
-- ============================================================================
-- 1. THE OTHER MONEY-TIER SUBJECTS, and why REVOKE rather than a body guard
-- ============================================================================
--
-- Migration 436 established the reasoning for apply_stock_movement: when a function's only
-- legitimate callers are triggers or nested calls from another SECURITY DEFINER function,
-- REVOKING the direct grant closes the hole without touching a body, and a body guard would
-- break the internal path instead. Nested calls run with current_user = the function owner, so
-- the owner's EXECUTE is what is checked - the session role's grant is irrelevant to them.
--
-- Each name below is followed by the grep that proves it has no direct application caller. In
-- every case the ONLY hit is src/integrations/supabase/types.ts, which is the GENERATED type
-- surface, not a call site.
--
--   _ensure_credit_balance(p_customer_id uuid)
--       grep -rlF '_ensure_credit_balance' src server -> src/integrations/supabase/types.ts
--       DB callers: get_customer_credit, get_customer_dynamic_credit, hold_credit,
--                   release_credit, reverse_document - all SECURITY DEFINER, and
--                   get_customer_dynamic_credit is itself role-gated.
--
--   hold_credit_for_quote(p_quote_id uuid, p_user_id uuid)
--       grep -rlF 'hold_credit_for_quote' src server -> (nothing at all)
--       DB caller: update_sales_quote_status, which carries its own has_any_role ladder.
--       Also takes a caller-supplied p_user_id; with no direct grant, nobody can supply it.
--
--   calculate_credit_score(_customer_id uuid)
--       grep -rlF 'calculate_credit_score' src server -> src/integrations/supabase/types.ts
--       DB caller: recompute_customer_credit_scores, which refuses unauthenticated callers and
--       then checks has_role(admin) / has_role(manager). Read live 2026-09-06.
--       NO body guard is added here on purpose: the body is 13kB and rewriting it to insert one
--       line is a far larger change than the defect justifies. The revoke closes the direct path
--       completely and the internal path was already gated.
--
--   recalculate_settlement_score(_customer_id uuid)
--       grep -rlF 'recalculate_settlement_score' src server -> src/integrations/supabase/types.ts
--       DB callers: none.
--
--   update_customer_overdue_status(_customer_id uuid)
--       grep -rlF 'update_customer_overdue_status' src server -> src/integrations/supabase/types.ts
--       DB callers: none.
--
--   asan_burn_document_number(_doc_type text, _source_id uuid, _reason text)
--       grep -rlF 'asan_burn_document_number' src server -> (nothing at all)
--       DB callers: tg_asan_burn_journal_entry_number, tg_asan_burn_purchase_number,
--                   tg_asan_burn_sales_quote_number - all triggers.
--       Burning a document number is a fiscal-numbering action; it had no check whatsoever.
--
--   next_sales_quote_number(_year integer)
--       grep -rlF 'next_sales_quote_number' src server -> src/integrations/supabase/types.ts
--       DB caller: sales_quotes_assign_number (trigger). Each call BURNS a number from
--       sales_quote_counters permanently, so an ungated grant is a gap-in-the-sequence defect
--       as well as a write.
--
--   increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
--       grep -rlF 'increase_credit' src server -> src/integrations/supabase/types.ts
--       DB callers: create_receipt, post_receipt_accounting.
--       Its ENTIRE body is `PERFORM public.release_credit(...)`. An ungated wrapper around a
--       gated function is an ungated function, and it forwards the same caller-supplied
--       p_user_id that 461 stopped trusting. It gets BOTH treatments: the same role gate as 461
--       so the wrapper cannot be used to reach the ledger without a role, and the revoke.
--
-- ONE function keeps its `authenticated` grant and therefore needs a real body guard:
--
--   expire_stale_credit_holds(p_days integer, p_limit integer)
--       grep -rn 'expire_stale_credit_holds' src server
--         -> src/routes/_app.sales.quotes.new.tsx  (a live call, as the signed-in salesperson)
--       It PERFORMs release_credit, which 461 now gates. Revoking its grant would break the
--       new-quote page; leaving it bare would let any authenticated user drive the sweep. So it
--       gets the same role set as 461 and keeps EXECUTE for authenticated.
--
-- Role set, everywhere in this file: ARRAY['admin','manager','accountant','sales']::text[],
-- the set already used by public.get_customer_dynamic_credit. user_roles.role is TEXT and the
-- ::text[] cast is required to disambiguate from the app_role[] overload.
--
-- ============================================================================
-- 2. BODY CHANGES (two - the minimum that closes the file)
-- ============================================================================

-- 2a. increase_credit - gate the wrapper.
CREATE OR REPLACE FUNCTION public.increase_credit(
  p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 462: an ungated wrapper around a gated function is an ungated function. 461 put the role
  -- check on release_credit; this puts the same check at the wrapper so the refusal happens at
  -- the surface the caller actually names.
  IF NOT public.has_any_role(auth.uid(),
        ARRAY['admin','manager','accountant','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only admin, manager, accountant or sales may release customer credit'
      USING ERRCODE = '42501';
  END IF;

  -- OG-17 option (b): a receipt RELEASES ceiling. It does not mint money. The previous body
  -- incremented the stored wallet `customer_credit_balance.available_credit`, which
  -- `get_customer_dynamic_credit` ignores - so it inflated a number nobody reads while the real
  -- ceiling never moved.
  --
  -- p_user_id is forwarded unchanged for signature compatibility. release_credit ignores it for
  -- the audit actor as of 461 and records it as `claimed_user_id` when it disagrees with
  -- auth.uid(), so forwarding it cannot forge an actor any more.
  PERFORM public.release_credit(p_customer_id, p_amount, p_receipt_id, p_user_id);
END
$function$;

-- 2b. expire_stale_credit_holds - the one money-tier function that keeps its authenticated grant.
-- The DEFAULTs are load-bearing and are reproduced exactly. CREATE OR REPLACE cannot remove a
-- parameter default ("cannot remove parameter defaults from existing function"), and dropping the
-- function to change that would break src/routes/_app.sales.quotes.new.tsx, which relies on the
-- two-argument call shape. Read live from pg_get_function_arguments on 2026-09-06.
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
  -- 462: authorization first. This is called from the new-quote page as the signed-in
  -- salesperson, so `sales` must stay in the set; it is the same set 461 put on release_credit,
  -- which this function PERFORMs.
  IF NOT public.has_any_role(auth.uid(),
        ARRAY['admin','manager','accountant','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only admin, manager, accountant or sales may expire credit holds'
      USING ERRCODE = '42501';
  END IF;

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

    -- 462: actor_id was NULL here. The sweep is driven by a page load, so there IS an
    -- authenticated human behind it, and auth.uid() names them. This matches what 461 did to the
    -- ledger's own audit rows.
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quote', _row.quote_id, 'credit_hold_expired',
            jsonb_build_object('customer_id', _row.customer_id, 'released', _row.held_amount,
                               'held_since', _row.held_since, 'after_days', p_days,
                               'reason', 'رزرو اعتبار پس از مهلت بدون پرداخت آزاد شد'));
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END
$function$;

-- ============================================================================
-- 3. GRANTS. After the replaces, because CREATE OR REPLACE restores the defaults.
--    PUBLIC is revoked separately from anon and is NOT redundant: a `=X/supabase_admin` entry in
--    proacl is a PUBLIC grant and survives `REVOKE ... FROM anon` untouched (wave 3).
-- ============================================================================

-- 3a. the three inverted-guard system RPCs -> service_role only.
REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(
  uuid, text, integer, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(
  uuid, text, integer, integer, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(
  uuid, text, integer, integer, integer, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(
  uuid, uuid, numeric, timestamptz, timestamptz, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(
  uuid, uuid, numeric, timestamptz, timestamptz, jsonb, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(
  uuid, uuid, numeric, timestamptz, timestamptz, jsonb, text) FROM PUBLIC;

-- 3b. internal-only money functions -> no direct grant at all.
REVOKE EXECUTE ON FUNCTION public._ensure_credit_balance(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hold_credit_for_quote(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increase_credit(uuid, numeric, uuid, uuid)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_credit_score(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_settlement_score(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_overdue_status(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.asan_burn_document_number(text, uuid, text)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_sales_quote_number(integer) FROM anon, authenticated, PUBLIC;

-- 3c. expire_stale_credit_holds KEEPS authenticated - it has a live caller. anon and PUBLIC go.
REVOKE EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer, integer) TO authenticated;

-- ============================================================================
-- 4. VERIFY, in the same transaction.
-- ============================================================================
DO $verify$
DECLARE
  v_fn    text;
  v_open  text[] := '{}';
  v_admin uuid;
BEGIN
  -- 4a. the three system RPCs must be service_role-only, and must STILL BE REACHABLE by it.
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.proname IN ('start_market_rate_ingestion_run_system',
                        'finish_market_rate_ingestion_run_system',
                        'record_external_market_rate_tick_system')
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '462: the inverted-guard RPCs are still reachable: %',
      array_to_string(v_open, ', ');
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('start_market_rate_ingestion_run_system',
                           'finish_market_rate_ingestion_run_system',
                           'record_external_market_rate_tick_system')
         AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 3 THEN
    RAISE EXCEPTION '462: service_role lost a market-rate RPC - ingestion is dead, not secured';
  END IF;
  RAISE NOTICE '462: verified - the three system RPCs are service_role-only and still reachable by it';

  -- 4b. the internal-only money functions hold no direct grant.
  v_open := '{}';
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.proname IN ('_ensure_credit_balance','hold_credit_for_quote','increase_credit',
                        'calculate_credit_score','recalculate_settlement_score',
                        'update_customer_overdue_status','asan_burn_document_number',
                        'next_sales_quote_number')
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '462: EXECUTE still held on internal money functions: %',
      array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '462: verified - the eight internal money functions hold no anon/authenticated grant';

  -- 4c. expire_stale_credit_holds must have KEPT authenticated. The open half: without this,
  --     revoking everything would satisfy 4b's spirit and silently break the new-quote page.
  IF NOT has_function_privilege('authenticated',
        'public.expire_stale_credit_holds(integer,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '462: expire_stale_credit_holds lost authenticated - the new-quote page is broken';
  END IF;
  IF has_function_privilege('anon',
        'public.expire_stale_credit_holds(integer,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '462: expire_stale_credit_holds is still reachable by anon';
  END IF;
  RAISE NOTICE '462: verified - expire_stale_credit_holds keeps authenticated and loses anon';

  -- 4d. the body guards, probed with set_config and WITHOUT calling anything that writes.
  --     Same reasoning as 461 section 6c: these functions move money, so the predicate is
  --     evaluated directly rather than by invoking the function that runs it.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  IF public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '462: an unprivileged authenticated sub PASSES the money-tier guard';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '462: no admin exists to prove the open half';
  END IF;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '462: a real admin is REFUSED by the money-tier guard';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '462: verified - the money-tier guard refuses an unprivileged sub and admits an admin';

  -- 4e. the two rewritten bodies really do carry the check.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('increase_credit', 'expire_stale_credit_holds')
         AND p.prosrc ~ 'has_any_role') <> 2 THEN
    RAISE EXCEPTION '462: a rewritten body is missing its has_any_role check';
  END IF;
  RAISE NOTICE '462: verified - increase_credit and expire_stale_credit_holds carry has_any_role';
END
$verify$;
