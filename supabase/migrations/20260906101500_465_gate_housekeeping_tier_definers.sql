SET client_encoding='UTF8';

-- 465 - the housekeeping tier: gamification engines, score snapshots, provider telemetry and the
-- delivery-receipt expiry sweep.
--
-- ASCII-ONLY BY DESIGN, following 436. The one Persian string reproduced below
-- (`expire_pending_delivery_receipts` is not rewritten here, so nothing Persian is touched at
-- all) - this file adds no Persian.
--
-- Subject list derived by the query quoted verbatim in migration 461 section 0.
--
-- ============================================================================
-- 1. THE CODEBASE ALREADY WROTE THIS POLICY DOWN. IT WAS JUST NEVER APPLIED HERE.
-- ============================================================================
--
-- src/lib/operations/gamification.ts, above the deliberately-absent wrapper:
--
--     // NOTE: `add_employee_xp` is intentionally NOT exposed via a frontend wrapper.
--     // It is a privileged SECURITY DEFINER function that mutates XP and triggers
--     // level-ups. It is invoked only from server-side engines
--     // (`check_and_unlock_achievements_for_employee`, `award_xp_from_score`,
--     // `check_and_update_mission_progress_for_employee`). Direct EXECUTE is
--     // revoked from anon/authenticated/public to prevent privilege escalation.
--
-- That is exactly the right rule. It was applied to `add_employee_xp` and NOT to the three
-- engines the same comment names as its callers - all three still granted EXECUTE to
-- `authenticated`. Closing the callee while leaving its callers open leaves the escalation
-- intact and merely moves it one function along: `award_xp_from_score(_employee_id)` takes the
-- employee id as an argument, so any authenticated user could convert any employee's score into
-- XP, and `check_and_unlock_achievements_for_employee(_employee_id, _event_type)` could unlock
-- achievements and award their xp_reward for anyone.
--
-- This file applies the comment's own rule to the three engines it names.
--
-- ============================================================================
-- 2. THE REVOKES, with the grep that justifies each
-- ============================================================================
--
-- Where the only hit is src/integrations/supabase/types.ts, that is the GENERATED type surface,
-- not a call site. Nested SECURITY DEFINER calls and triggers run with current_user = the
-- function owner, so revoking a session role's grant does not touch them (migration 436,
-- apply_stock_movement).
--
--   award_xp_from_score(_employee_id uuid)
--       grep -rn 'award_xp_from_score' src server
--         -> src/lib/operations/gamification.ts  (the NOTE quoted above - a comment, not a call)
--         -> src/integrations/supabase/types.ts  (generated)
--       DB caller: trg_award_xp_after_score (trigger).
--
--   check_and_unlock_achievements_for_employee(_employee_id uuid, _event_type text)
--       grep -rn '...' src server -> gamification-achievements.ts line 6, which is itself a
--         comment reading "invoked automatically"; plus the generated types.
--       DB caller: trg_check_achievements_after_score (trigger).
--
--   check_and_update_mission_progress_for_employee(_employee_id uuid, _event_type text)
--       grep -rn '...' src server -> gamification-missions.ts line 176, again a comment reading
--         "invoked automatically"; plus the generated types.
--       DB caller: trg_check_missions_after_score (trigger).
--
--   capture_score_snapshots()
--       grep -rlF 'capture_score_snapshots' src server -> src/integrations/supabase/types.ts
--       DB callers: none. It INSERTs a snapshot row per employee and then DELETEs every
--       score_snapshots row older than 90 days - a retention sweep with a delete in it, offered
--       to every logged-in user.
--
--   expire_pending_delivery_receipts()
--       grep -rlF 'expire_pending_delivery_receipts' src server
--         -> src/integrations/supabase/types.ts
--       DB caller: tick_inquiries. It expires receipts AND calls auto_submit_penalty, so an
--       ungated grant is a way to have penalties recorded against other employees.
--
--   ai_record_provider_health(p_provider_id uuid, p_capability text, ...)
--       grep -rn 'ai_record_provider_health' src server
--         -> src/lib/ai/client.server.ts, whose import line is
--            `import { supabaseAdmin } from "@/integrations/supabase/client.server"` - the
--            SERVICE-ROLE client. service_role keeps its grant, so provider telemetry is
--            unaffected.
--       Writes ai_provider_health, which is the table the OCR-provider health decision reads.
--
-- ============================================================================
-- 3. THE TWO THAT KEEP THEIR GRANT, and therefore need a body guard
-- ============================================================================
--
--   calculate_employee_score(_employee_id uuid)
--       grep -rn 'calculate_employee_score' src server
--         -> src/lib/operations/gamification.ts:112       (a live call)
--         -> src/lib/gamification/manual-score.functions.ts:126  (a live call)
--       Both are consumed from back-office screens (_app.gamification.admin.kpi-rules.tsx,
--       _app.gamification.settings.tsx). Bare, it lets any authenticated user recompute and
--       overwrite any employee's score row.
--
--   settle_league_season()
--       grep -rn 'settle_league_season' src server
--         -> src/lib/operations/gamification-leagues.ts:255      (a live call)
--         -> src/routes/_app.gamification.admin.leagues.tsx      (the screen)
--       Bare, any authenticated user could close the active season, freeze everyone's standings,
--       apply every promotion and demotion, and open the next one. It is the single most
--       consequential button in the gamification module and it had no check at all.
--
-- Both get public.gamification_assert_manager(), which is this schema's OWN helper for exactly
-- this decision - not a new role set invented here:
--
--     IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
--     THEN RAISE EXCEPTION '<Persian: only a manager or senior manager ...>' ERRCODE '42501';
--
-- Using the existing helper rather than an inline has_any_role keeps one definition of
-- "gamification manager" in the schema, and it raises 42501, which is the SQLSTATE that means
-- "not you".

-- --------------------------------------------------------------------------------------------
-- 4. BODY CHANGES (two)
-- --------------------------------------------------------------------------------------------

-- 4a. calculate_employee_score
CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _r jsonb;
BEGIN
  -- 465: authorization first, through the schema's own helper (admin or manager, ERRCODE 42501).
  -- Without it any authenticated user could recompute and overwrite any employee's score row.
  PERFORM public.gamification_assert_manager();

  _r := public.compute_employee_score(_employee_id, NULL);

  INSERT INTO public.employee_scores (
    employee_id, daily_score, weekly_score, monthly_score, total_score,
    normalized_score, active_work_minutes, breakdown, last_calculated_at
  ) VALUES (
    _employee_id,
    (_r->>'daily_score')::numeric,
    (_r->>'weekly_score')::numeric,
    (_r->>'monthly_score')::numeric,
    (_r->>'total_score')::numeric,
    (_r->>'normalized_score')::numeric,
    (_r->>'active_work_minutes')::numeric,
    _r->'breakdown',
    now()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    daily_score=EXCLUDED.daily_score,
    weekly_score=EXCLUDED.weekly_score,
    monthly_score=EXCLUDED.monthly_score,
    total_score=EXCLUDED.total_score,
    normalized_score=EXCLUDED.normalized_score,
    active_work_minutes=EXCLUDED.active_work_minutes,
    breakdown=EXCLUDED.breakdown,
    last_calculated_at=EXCLUDED.last_calculated_at,
    updated_at=now();

  RETURN jsonb_build_object(
    'employee_id',      _employee_id,
    'daily_score',      (_r->>'daily_score')::numeric,
    'weekly_score',     (_r->>'weekly_score')::numeric,
    'monthly_score',    (_r->>'monthly_score')::numeric,
    'total_score',      (_r->>'total_score')::numeric,
    'normalized_score', (_r->>'normalized_score')::numeric,
    'breakdown',        _r->'breakdown'
  );
END;
$function$;

-- 4b. settle_league_season
CREATE OR REPLACE FUNCTION public.settle_league_season()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  active_season public.league_seasons%ROWTYPE;
  next_start date;
  next_end date;
  next_name text;
  next_id uuid;
  total_count integer;
BEGIN
  -- 465: authorization first. Closing a season freezes every standing, applies every promotion
  -- and demotion and opens the next one; it had no check of any kind.
  PERFORM public.gamification_assert_manager();

  -- status, not is_active: status is the column the trigger treats as the
  -- source of truth and is_active is merely derived from it.
  SELECT * INTO active_season
    FROM public.league_seasons
   WHERE status = 'active'
   ORDER BY COALESCE(starts_at, start_date::timestamptz) DESC
   LIMIT 1;

  -- If no active season, bootstrap current month and exit
  IF NOT FOUND THEN
    next_start := date_trunc('month', current_date)::date;
    next_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    next_name := to_char(next_start, 'YYYY-MM');

    INSERT INTO public.league_seasons(season_name, title_fa, starts_at, ends_at, status)
    VALUES (next_name, next_name,
            next_start::timestamptz,
            (next_end + 1)::timestamptz - interval '1 microsecond',
            'active')
    ON CONFLICT (season_name) DO UPDATE
      SET status    = 'active',
          title_fa  = COALESCE(public.league_seasons.title_fa, EXCLUDED.title_fa),
          starts_at = EXCLUDED.starts_at,
          ends_at   = EXCLUDED.ends_at
    RETURNING id INTO next_id;

    RETURN jsonb_build_object('bootstrapped', true, 'season_id', next_id);
  END IF;

  -- 1. Snapshot final monthly scores into the active season
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score)
  SELECT es.employee_id, active_season.id, 'Bronze'::public.league_tier, COALESCE(es.monthly_score, 0)
  FROM public.employee_scores es
  ON CONFLICT (employee_id, season_id) DO UPDATE
    SET score = EXCLUDED.score;

  -- 2. Compute rank within current league tier
  WITH ranked AS (
    SELECT id,
           league,
           RANK() OVER (PARTITION BY league ORDER BY score DESC) AS r,
           COUNT(*) OVER (PARTITION BY league) AS tier_count
    FROM public.employee_leagues
    WHERE season_id = active_season.id
  )
  UPDATE public.employee_leagues el
  SET rank = ranked.r
  FROM ranked
  WHERE el.id = ranked.id;

  -- Mark active as settled. status='closed' is what actually deactivates it -
  -- setting is_active = false here did nothing, because the trigger overwrote
  -- it from status on the way through.
  UPDATE public.league_seasons
  SET status = 'closed', settled_at = now()
  WHERE id = active_season.id;

  -- 3. Open next month's season
  next_start := (COALESCE(active_season.ends_at::date, active_season.end_date) + interval '1 day')::date;
  next_end := (date_trunc('month', next_start) + interval '1 month - 1 day')::date;
  next_name := to_char(next_start, 'YYYY-MM');

  INSERT INTO public.league_seasons(season_name, title_fa, starts_at, ends_at, status)
  VALUES (next_name, next_name,
          next_start::timestamptz,
          (next_end + 1)::timestamptz - interval '1 microsecond',
          'active')
  ON CONFLICT (season_name) DO UPDATE
    SET status    = 'active',
        title_fa  = COALESCE(public.league_seasons.title_fa, EXCLUDED.title_fa),
        starts_at = EXCLUDED.starts_at,
        ends_at   = EXCLUDED.ends_at
  RETURNING id INTO next_id;

  -- 4. Carry forward members to the new season with promotion/demotion
  --    Within each tier of the just-settled season:
  --      top 20% -> promoted (tier + 1, capped at Legend)
  --      bottom 20% -> demoted (tier - 1, floored at Bronze)
  --      else stays
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score, promoted, demoted)
  SELECT
    el.employee_id,
    next_id,
    CASE
      WHEN el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int
        THEN public.league_tier_from_index(public.league_tier_index(el.league) + 1)
      WHEN el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
        AND public.league_tier_index(el.league) > 1
        THEN public.league_tier_from_index(public.league_tier_index(el.league) - 1)
      ELSE el.league
    END AS new_league,
    0 AS score,
    (el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int) AS promoted,
    (el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
      AND public.league_tier_index(el.league) > 1) AS demoted
  FROM (
    SELECT
      el.*,
      COUNT(*) OVER (PARTITION BY el.league) AS tier_count
    FROM public.employee_leagues el
    WHERE el.season_id = active_season.id
  ) el
  ON CONFLICT (employee_id, season_id) DO NOTHING;

  SELECT COUNT(*) INTO total_count FROM public.employee_leagues WHERE season_id = active_season.id;

  RETURN jsonb_build_object(
    'settled_season_id', active_season.id,
    'settled_season_name', active_season.season_name,
    'new_season_id', next_id,
    'new_season_name', next_name,
    'employees_settled', total_count
  );
END;
$function$;

-- --------------------------------------------------------------------------------------------
-- 5. GRANTS. After the replaces, because CREATE OR REPLACE restores the defaults.
--    PUBLIC is revoked separately from anon and is not redundant (wave 3).
-- --------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.award_xp_from_score(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(uuid, text)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(uuid, text)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_score_snapshots() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_pending_delivery_receipts()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_record_provider_health(uuid, text, text, text, text, integer)
  FROM anon, authenticated, PUBLIC;

-- These two keep authenticated - they have live back-office callers - and lose anon and PUBLIC.
REVOKE EXECUTE ON FUNCTION public.calculate_employee_score(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_employee_score(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calculate_employee_score(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.settle_league_season() FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_league_season() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_league_season() TO authenticated;

-- --------------------------------------------------------------------------------------------
-- 6. VERIFY, in the same transaction.
-- --------------------------------------------------------------------------------------------
DO $verify$
DECLARE
  v_fn      text;
  v_open    text[] := '{}';
  v_manager uuid;
BEGIN
  -- 6a. the six internal-only housekeeping functions hold no direct grant.
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.proname IN ('award_xp_from_score','check_and_unlock_achievements_for_employee',
                        'check_and_update_mission_progress_for_employee','capture_score_snapshots',
                        'expire_pending_delivery_receipts','ai_record_provider_health')
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '465: EXECUTE still held on housekeeping functions: %',
      array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '465: verified - the six internal housekeeping functions hold no anon/authenticated grant';

  -- 6b. the OPEN half for the one with a service-role caller. Provider telemetry must survive.
  IF NOT has_function_privilege('service_role',
        'public.ai_record_provider_health(uuid,text,text,text,text,integer)'::regprocedure,
        'EXECUTE') THEN
    RAISE EXCEPTION '465: service_role lost ai_record_provider_health - telemetry is dead, not secured';
  END IF;
  RAISE NOTICE '465: verified - service_role still records provider health';

  -- 6c. the two back-office functions kept authenticated and lost anon.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('calculate_employee_score','settle_league_season')
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) <> 2 THEN
    RAISE EXCEPTION '465: a back-office gamification function lost authenticated - the screen is broken';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('calculate_employee_score','settle_league_season')
                AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION '465: a back-office gamification function is still reachable by anon';
  END IF;
  RAISE NOTICE '465: verified - the two back-office functions keep authenticated and lose anon';

  -- 6d. both rewritten bodies really do call the helper.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('calculate_employee_score','settle_league_season')
         AND p.prosrc ~ 'gamification_assert_manager') <> 2 THEN
    RAISE EXCEPTION '465: a rewritten body is missing gamification_assert_manager()';
  END IF;

  -- 6e. the guard itself, probed with set_config and without calling either function - both
  --     write, and settle_league_season would close the live season.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  BEGIN
    PERFORM public.gamification_assert_manager();
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '465: an unprivileged authenticated sub PASSES gamification_assert_manager';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  -- 6f. the OPEN half, against a real MANAGER - the role the screens are for.
  SELECT user_id INTO v_manager FROM public.user_roles WHERE role = 'manager' LIMIT 1;
  IF v_manager IS NULL THEN
    RAISE EXCEPTION '465: no manager exists to prove the open half';
  END IF;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_manager::text, 'role', 'authenticated')::text, true);
  PERFORM public.gamification_assert_manager();   -- must NOT raise
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '465: verified - the guard refuses an unprivileged sub and admits a real manager';
END
$verify$;
