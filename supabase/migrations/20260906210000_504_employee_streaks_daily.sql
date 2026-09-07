-- 504: give public.employee_streaks a writer.
--
-- STATE BEFORE THIS MIGRATION (measured 2026-09-06)
--   employee_streaks: 0 rows, 1 policy (emp_streaks_self_or_admin, SELECT only), and
--   ZERO writers anywhere - no database function referenced the table and no line of src/
--   wrote to it. It was a table nothing filled.
--
-- WHY THIS MIGRATION CARRIES NO cron DDL
--   pg_cron 1.6 is installed in the *postgres* database, not in afrakala: there is no `cron`
--   schema here at all, so `cron.schedule_in_database(...)` cannot be called from a migration
--   applied to afrakala. This is the same split migration 445 documented for the three
--   existing nightly jobs. The schedule for this function is registered by
--   deploy/lan/scripts/cron-504-schedule-employee-streaks.sql, which runs against postgres.
--
-- WHICH DAY THIS SETTLES, AND WHY IT IS NOT tehran_today()
--   The DB session is UTC; Tehran is UTC+3:30 year-round. The job is scheduled at 21:00 GMT
--   = 00:30 Asia/Tehran, i.e. just AFTER the Tehran date rolls over, so it settles the day
--   that has just ENDED: p_day defaults to public.tehran_today() - 1. Defaulting to
--   tehran_today() would evaluate a day 30 minutes old in which nobody has logged in yet and
--   would reset every streak in the company, every night. tehran_today() (migration 396) is
--   still the only date source used - never CURRENT_DATE.
--
-- ACTIVE = LOGGED IN (D-42), AND FRIDAY NEVER BREAKS A STREAK (D-43)
--   "Active" is a login_success row in audit_logs for that employee on that Tehran day. That
--   is why wave 6 B-1 had to land first: before it, AuthProvider discarded the audit write
--   unsent and audit_logs held 0 login_success rows, so this function would have reset every
--   streak every night regardless of who logged in.
--   Friday is ISODOW 5. Per D-43 a Friday extends the streak with no login required.
--   THERE IS NO HOLIDAYS OR CALENDAR TABLE anywhere in this database and tehran_today() is a
--   plain date cast, so official holidays other than Friday are OUT OF SCOPE. A Nowruz week
--   will break streaks. Fixing that needs a calendar table, which is not invented here.
--
-- NO JWT UNDER cron
--   A pg_cron session carries no JWT, so auth.uid() is NULL inside it. This function
--   therefore takes no actor and asserts no role; it is SECURITY DEFINER and its authority is
--   its ownership, not the caller's claims. Verified before wiring: get_kpi_xp() contains no
--   role assertion, and neither do the two AFTER triggers on employee_score_events
--   (trg_check_achievements_after_score, trg_check_missions_after_score) nor the functions
--   they call. Nothing on this path reads auth.uid().
--
-- NO WRITE POLICY IS ADDED, DELIBERATELY
--   employee_streaks has RLS on, relforcerowsecurity = false, and no INSERT/UPDATE policy.
--   That is correct and is left alone: the only writer is this SECURITY DEFINER function,
--   owned by supabase_admin (rolsuper = t, rolbypassrls = t), so it writes without a policy.
--   Adding a client-facing write policy would grant a privilege that has no caller and would
--   let a browser forge its own streak. The existing SELECT policy already lets an employee
--   read their own row and admin/manager read all.
--
-- SCORING IMPACT: NONE. Checked before writing (CLAUDE.md rule 10). compute_employee_score
--   reads employee_score_events ONLY where event_type = 'promotion_completed', and iterates
--   KPIs from gamification_kpis - a DIFFERENT table from gamification_kpi_rules, which is
--   read only by get_kpi_xp(). A new rule row and a new event_type therefore cannot move any
--   existing employee's computed score.
--
-- Reverse with docs/verification/504-down.sql.

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- 1. The XP rule. The row alone does nothing (D-44) - get_kpi_xp() only reads it; the call
--    that awards it is in the function below. Shaped on the existing 'promotion_completed'
--    row, quoted here verbatim as measured:
--      promotion_completed | xp=15 | active=true | sort=120 | انجام تبلیغ / نامزدی محصول
-- ---------------------------------------------------------------------------
INSERT INTO public.gamification_kpi_rules
  (title_fa, title_en, description, event_key, xp_amount, is_active, sort_order)
VALUES
  ('زنجیره‌ی حضور روزانه',
   'Daily attendance streak',
   'به ازای هر روزی که زنجیره‌ی حضور کارمند ادامه پیدا کند، امتیاز تعلق می‌گیرد. جمعه‌ها زنجیره را نمی‌شکنند.',
   'daily_streak_extended',
   5,
   true,
   130)
ON CONFLICT (event_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The writer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roll_employee_daily_streaks(p_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day        date    := COALESCE(p_day, public.tehran_today() - 1);
  v_is_friday  boolean := EXTRACT(ISODOW FROM v_day) = 5;
  v_xp         numeric := public.get_kpi_xp('daily_streak_extended', 5);
  v_extended   integer := 0;
  v_reset      integer := 0;
  v_considered integer := 0;
BEGIN
  SELECT count(*) INTO v_considered
    FROM public.profiles p
   WHERE p.status = 'active'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);

  WITH staff AS (
    SELECT p.id AS employee_id
      FROM public.profiles p
     WHERE p.status = 'active'
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
  ),
  scored AS (
    -- current_count is carried as the ACTIVITY FLAG into the upsert: 1 = active that day,
    -- 0 = not. ON CONFLICT can only see the proposed row through EXCLUDED, so the flag has
    -- to travel in a real column. EXCLUDED.current_count > 0 reads back as "was active".
    SELECT s.employee_id,
           CASE WHEN v_is_friday OR EXISTS (
                  SELECT 1
                    FROM public.audit_logs a
                   WHERE a.actor_id = s.employee_id
                     AND a.action = 'login_success'
                     AND (a.created_at AT TIME ZONE 'Asia/Tehran')::date = v_day
                ) THEN 1 ELSE 0 END AS active_flag
      FROM staff s
  ),
  upserted AS (
    INSERT INTO public.employee_streaks AS es
      (employee_id, streak_type, current_count, best_count, last_event_date, updated_at)
    SELECT sc.employee_id, 'daily_login', sc.active_flag, sc.active_flag, v_day, now()
      FROM scored sc
    ON CONFLICT (employee_id, streak_type) DO UPDATE
       SET current_count = CASE
             WHEN EXCLUDED.current_count = 0 THEN 0
             WHEN es.last_event_date = EXCLUDED.last_event_date - 1 THEN es.current_count + 1
             ELSE 1
           END,
           best_count = GREATEST(es.best_count, CASE
             WHEN EXCLUDED.current_count = 0 THEN 0
             WHEN es.last_event_date = EXCLUDED.last_event_date - 1 THEN es.current_count + 1
             ELSE 1
           END),
           last_event_date = EXCLUDED.last_event_date,
           updated_at = now()
       -- Idempotent, and refuses to walk backwards: re-running for a day already settled
       -- updates nothing, so a double-fire cannot inflate or reset a streak.
       WHERE es.last_event_date IS NULL
          OR es.last_event_date < EXCLUDED.last_event_date
    RETURNING es.employee_id, es.current_count
  ),
  awarded AS (
    -- The call that actually awards the XP (D-44). Shaped on award_inquiry_response_score(),
    -- including its ON CONFLICT target, so a re-run cannot double-award.
    INSERT INTO public.employee_score_events
      (employee_id, event_type, source_table, source_id, triggered_at, payload)
    SELECT u.employee_id,
           'daily_streak_extended',
           'employee_streaks',
           u.employee_id::text || ':' || v_day::text,
           ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Tehran') - interval '1 second',
           jsonb_build_object(
             'streak_day',    v_day,
             'current_count', u.current_count,
             'score_value',   v_xp,
             'was_friday',    v_is_friday
           )
      FROM upserted u
     WHERE u.current_count > 0
    ON CONFLICT (source_table, source_id, event_type)
      WHERE source_table IS NOT NULL AND source_id IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) FILTER (WHERE u.current_count > 0),
         count(*) FILTER (WHERE u.current_count = 0)
    INTO v_extended, v_reset
    FROM upserted u;

  RETURN jsonb_build_object(
    'day',        v_day,
    'is_friday',  v_is_friday,
    'considered', v_considered,
    'extended',   v_extended,
    'reset',      v_reset,
    'xp_each',    v_xp
  );
END;
$function$;

COMMENT ON FUNCTION public.roll_employee_daily_streaks(date) IS
  'Scheduled by pg_cron job "afrakala-employee-streaks-nightly" in the postgres database: 0 21 * * * GMT = 00:30 Asia/Tehran daily, settling the Tehran day that has just ended (tehran_today() - 1). Extends employee_streaks.streak_type=''daily_login'' for every active employee who has a login_success audit row that day, or when that day was a Friday (D-43); resets to 0 otherwise. Awards the daily_streak_extended KPI into employee_score_events. Carries no auth.uid() dependency because a cron session has no JWT.';

-- ---------------------------------------------------------------------------
-- 3. Grants. The nightly caller is supabase_admin via pg_cron. No browser role needs to run
--    this, and no anon grant is created (CONTRACTS §7).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.roll_employee_daily_streaks(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roll_employee_daily_streaks(date) TO supabase_admin;
GRANT EXECUTE ON FUNCTION public.roll_employee_daily_streaks(date) TO service_role;
