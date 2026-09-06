SET client_encoding='UTF8';

-- 469 - the three market-rate `_system` RPCs stop testing for the ABSENCE of a user identity
--       and start testing for the service role BY NAME.
--
-- Wave 2, row C-3. Follows 462, which closed the same three by REVOKE and deliberately left
-- their bodies alone. This migration finishes the job in the body, where a grant cannot undo it.
--
-- ASCII-ONLY where this file is the author. The four Persian strings below
-- ('وضعیت نامعتبر', 'مقدار نامعتبر برای نرخ خارجی', and the two suspect-tick notes) are
-- pre-existing product text, copied byte-for-byte out of the live pg_get_functiondef on
-- 2026-09-06 and carried through UNCHANGED. Nothing new in this file is Persian, and the file
-- is delivered over stdin with an md5 check on both sides (CLAUDE.md database rule 1) rather
-- than through a PowerShell pipe.
--
-- ============================================================================
-- 0. WHAT IS WRONG, EXACTLY
-- ============================================================================
--
-- All three open with the same line, read verbatim from the live bodies on 2026-09-06:
--
--     -- Service-role only: callable when there is no authenticated user.
--     IF auth.uid() IS NOT NULL THEN
--       RAISE EXCEPTION 'system RPC: not callable by authenticated users';
--     END IF;
--
-- The comment states the intent correctly and the code expresses its opposite. `auth.uid()` is
-- NULL for `service_role` AND it is NULL for `anon`. A guard that refuses every caller WITH an
-- identity therefore admits exactly the two callers WITHOUT one - the cron ingester, and the
-- unauthenticated internet. It refuses every legitimate authenticated caller and accepts the
-- one caller nobody wants.
--
-- Measured on 2026-09-06, across every SECURITY DEFINER function in `public`, these three are
-- the ONLY functions carrying that form:
--
--     SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef
--        AND p.prosrc ~* 'auth\.uid\(\)\s+IS\s+NOT\s+NULL';
--     -> finish_market_rate_ingestion_run_system
--        record_external_market_rate_tick_system
--        start_market_rate_ingestion_run_system
--
-- ============================================================================
-- 1. WHY A REVOKE WAS NOT ENOUGH, AND THIS FILE EXISTS
-- ============================================================================
--
-- 462 removed anon, authenticated and PUBLIC from the grant. Measured immediately before this
-- migration, all three read anon=f, authenticated=f, service_role=t, and the PUBLIC entry
-- `=X/supabase_admin` is gone:
--
--   proname                                 | anon | authenticated | service_role | proacl
--   ----------------------------------------+------+---------------+--------------+---------------------------------
--   finish_market_rate_ingestion_run_system  | f    | f             | t            | supabase_admin=X/supabase_admin
--   record_external_market_rate_tick_system  | f    | f             | t            |  service_role=X/supabase_admin
--   start_market_rate_ingestion_run_system   | f    | f             | t            |  postgres=X/supabase_admin
--
-- So the hole is closed TODAY and it is closed by one line of ACL. The inverted logic is still
-- in all three bodies, latent. The failure mode this migration removes is a future author
-- writing a bare `CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(...)`
-- to fix an unrelated bug: on a schema whose default privileges grant EXECUTE broadly, that one
-- statement restores the grant and the inverted guard is live again in the same breath, with no
-- diff anywhere that mentions security. CONTRACTS section 4 rule 3 is the same observation from
-- the other side ("CREATE OR REPLACE silently restores default grants, which is why the REVOKEs
-- come AFTER") - a rule that lives only in a GRANT is one GRANT away from being lost.
--
-- What breaks if this migration is wrong: market-rate ingestion. The only caller of all three is
-- src/routes/api/public/hooks/ingest-market-rates.ts, which drives them through `supabaseAdmin`
-- (the service-role client) at lines 97, 125, 147, 182 and 204. If the new guard rejected that
-- caller, the ingester would stop and `market_rate_ticks` would go stale, which silently freezes
-- `_par_latest_usd_rate()` and therefore every USD-converted product price. That is why section
-- 3 proves the accept path as carefully as the refuse path.
--
-- ============================================================================
-- 2. THE POSITIVE FORM, AND WHY auth.role() RATHER THAN current_user
-- ============================================================================
--
--     IF COALESCE(auth.role(), '') <> 'service_role' THEN
--       RAISE EXCEPTION 'forbidden: ... only by the service role' USING ERRCODE = '42501';
--     END IF;
--
-- Three alternatives were read out of the catalogue and rejected, each for a concrete reason:
--
--   current_user  - USELESS HERE. Inside a SECURITY DEFINER function current_user is the
--                   function OWNER, `supabase_admin` for all three (pg_proc.proowner, checked).
--                   It is the same value for every caller and discriminates nothing.
--   session_user  - USELESS HERE. PostgREST connects as one role and then SET ROLE-s; SET ROLE
--                   does not change session_user. anon, authenticated and service_role all
--                   arrive with session_user = the PostgREST connection role.
--   auth.uid() IS NULL
--                 - This is the bug. It is a test for the absence of a subject claim, and both
--                   `anon` and `service_role` lack one.
--
-- auth.role() is the only one of the four that names the role positively. Its live body, read
-- 2026-09-06 (owner supabase_auth_admin, PUBLIC EXECUTE, so reachable from inside a definer
-- function owned by supabase_admin):
--
--     select coalesce(
--       nullif(current_setting('request.jwt.claim.role', true), ''),
--       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
--
-- The service-role key is a JWT whose claims carry "role":"service_role", so the ingester gets
-- 'service_role'. The published anon key carries "role":"anon". A signed-in user's token carries
-- "role":"authenticated". The COALESCE(..., '') matters: a request that presents no JWT at all
-- leaves the setting unset and auth.role() returns NULL, and `NULL <> 'service_role'` is NULL,
-- not true - an unguarded `IF` on that expression would fall THROUGH. Comparing the COALESCEd
-- value makes the missing-claim case refuse, which is the whole point of the migration.
--
-- WHY NO ANON BRANCH IS NEEDED: the single expression refuses anon, authenticated, and the
-- no-token case together. Same property as has_any_role(NULL, ...) returning false rather than
-- NULL (CONTRACTS section 4 rule 2).
--
-- WHY THIS IS SAFE TO PUT IN THE BODY (CONTRACTS section 4 rule 4 / migration 436's
-- apply_stock_movement reasoning): a body guard is wrong when a trigger or a nested SECURITY
-- DEFINER call legitimately runs the function as an ordinary user, because the guard would then
-- break the feature rather than secure it. Checked, and it does not apply here - NO function in
-- `public` calls any of the three:
--
--     SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.prosrc ~
--        '(start_market_rate_ingestion_run_system|finish_market_rate_ingestion_run_system|record_external_market_rate_tick_system)\s*\(';
--     -> (0 rows)
--
-- and the `cron` schema does not exist on this database (`SELECT ... FROM cron.job` ->
-- relation "cron.job" does not exist), so there is no in-database scheduler calling them as
-- supabase_admin either. The HTTP hook above is the only path, and it is service_role.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - It does not change any signature. Same argument names, same types, same defaults, same
--     return types - so no overload is created and CLAUDE.md rule 5 does not bite.
--   - It does not change one line of the ingestion logic. The suspect-tick thresholds, the
--     3% band, the 24-hour staleness rule, the audit_logs row with actor_id NULL and
--     'initiated_by':'system_cron' - all carried through byte-for-byte from the live bodies.
--   - It does not re-open the grant. Section 4 re-asserts exactly the ACL measured in
--     section 1, no more.
--   - It does not touch the six non-`_system` siblings (start_market_rate_ingestion_run,
--     finish_market_rate_ingestion_run, record_market_rate_tick, record_external_market_rate_tick,
--     set_market_rate_tick_status, update_market_rate_source_mapping). Those are anon-reachable
--     and each carries a CORRECT guard - `IF v_uid IS NULL THEN RAISE` followed by an
--     admin/manager/accountant has_role test, read from the live bodies 2026-09-06.

-- ============================================================================
-- 3. THE THREE REPLACEMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run_system(p_source_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sid uuid; v_id uuid;
BEGIN
  -- 469: positive test. It replaced a guard that raised whenever a subject claim was
  -- PRESENT, which is a guard that admitted anon. See the file header, section 0.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: start_market_rate_ingestion_run_system is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, NULL, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run_system(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- 469: positive test. It replaced a guard that raised whenever a subject claim was
  -- PRESENT, which is a guard that admitted anon. See the file header, section 0.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: finish_market_rate_ingestion_run_system is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;
  -- Unchanged argument validation. Persian, pre-existing, ERRCODE left as it was (not an
  -- authorization raise - it refuses a bad status string, not a bad caller).
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text)
 RETURNS TABLE(tick_id uuid, status_out text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  -- 469: positive test. It replaced a guard that raised whenever a subject claim was PRESENT,
  -- which is a guard that admitted anon (see the file header, section 0). This is the one that
  -- matters most, because the INSERT below lands in market_rate_ticks, which feeds
  -- _par_latest_usd_rate() and therefore every USD-converted product price.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: record_external_market_rate_tick_system is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;
  -- Unchanged argument validation. Persian, pre-existing.
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, NULL)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'market_rate_tick', v_id, 'market_rate_external_ingested_system',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct,
      'initiated_by', 'system_cron'
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$;

-- ============================================================================
-- 4. GRANTS. AFTER the replaces, because CREATE OR REPLACE can restore defaults
--    (CONTRACTS section 4 rule 3). The end state re-asserted here is EXACTLY the state
--    measured in section 1 - no role gains anything.
--
--    The GRANT to service_role and postgres is not decoration. `REVOKE ... FROM PUBLIC`
--    materialises an ACL that was previously default, and if CREATE OR REPLACE HAD reset the
--    ACL, service_role would be holding EXECUTE only through PUBLIC at that moment - so the
--    revoke alone would take it away and kill the ingester. Re-granting explicitly makes the
--    end state the same whether the ACL was reset or preserved.
--
--    `FROM PUBLIC` as well as `FROM anon` is mandatory: the `=X/supabase_admin` entry in proacl
--    is the PUBLIC grant and survives `REVOKE ... FROM anon` untouched (migration 436).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text)
  TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(
  uuid, text, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(
  uuid, text, integer, integer, integer, text) TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(
  uuid, uuid, numeric, timestamptz, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(
  uuid, uuid, numeric, timestamptz, timestamptz, jsonb, text) TO service_role, postgres;

-- ============================================================================
-- 5. VERIFICATION, run inside this same transaction so a wrong answer rolls the file back.
--
--    Both directions are asserted, because either one alone passes for the wrong reason:
--      - "no body still carries auth.uid() IS NOT NULL" would also pass if all three were
--        dropped;
--      - "all three carry the service_role test" would also pass if the grant had been
--        re-opened to anon.
-- ============================================================================

DO $verify$
DECLARE
  v_inverted int;
  v_positive int;
  v_open     int;
  v_service  int;
BEGIN
  SELECT count(*) INTO v_inverted
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_market_rate_ingestion_run_system',
                       'finish_market_rate_ingestion_run_system',
                       'record_external_market_rate_tick_system')
     AND p.prosrc ~* 'auth\.uid\(\)\s+IS\s+NOT\s+NULL';
  IF v_inverted <> 0 THEN
    RAISE EXCEPTION '469: % of the three still carry the inverted guard', v_inverted;
  END IF;

  SELECT count(*) INTO v_positive
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_market_rate_ingestion_run_system',
                       'finish_market_rate_ingestion_run_system',
                       'record_external_market_rate_tick_system')
     AND p.prosrc ~* 'auth\.role\(\).*<>.*service_role';
  IF v_positive <> 3 THEN
    RAISE EXCEPTION '469: only % of 3 carry the positive service_role test', v_positive;
  END IF;

  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_market_rate_ingestion_run_system',
                       'finish_market_rate_ingestion_run_system',
                       'record_external_market_rate_tick_system')
     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  IF v_open <> 0 THEN
    RAISE EXCEPTION '469: % anon/authenticated grants survived the revoke', v_open;
  END IF;

  SELECT count(*) INTO v_service
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_market_rate_ingestion_run_system',
                       'finish_market_rate_ingestion_run_system',
                       'record_external_market_rate_tick_system')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_service <> 3 THEN
    RAISE EXCEPTION
      '469: only % of 3 are still reachable by service_role - market-rate ingestion would be dead, not secured',
      v_service;
  END IF;
END;
$verify$;
