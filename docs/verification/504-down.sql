-- Reverse of migration 504. Applied to the afrakala database.
--
-- Does NOT unschedule the cron job -- pg_cron lives in the postgres database, so for that run
-- this against postgres instead:
--   SELECT cron.unschedule('afrakala-employee-streaks-nightly');
-- Unschedule FIRST, or the job will keep firing at a function that no longer exists.
--
-- employee_streaks rows written by the function are left in place: they are history, and
-- CLAUDE.md rule 3 forbids DELETE on a table holding data. Drop them deliberately by hand if
-- that is really what is wanted.
SET client_encoding = 'UTF8';

DROP FUNCTION IF EXISTS public.roll_employee_daily_streaks(date);

-- The KPI rule is deactivated rather than deleted, so any employee_score_events row that
-- already references it keeps a resolvable rule.
UPDATE public.gamification_kpi_rules
   SET is_active = false
 WHERE event_key = 'daily_streak_extended';
