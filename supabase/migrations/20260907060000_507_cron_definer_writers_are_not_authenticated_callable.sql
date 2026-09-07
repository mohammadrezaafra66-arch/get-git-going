SET client_encoding='UTF8';

-- ============================================================================================
-- 507 · the two wave-6 cron writers stop being callable by every authenticated user
--
-- ── What went wrong ─────────────────────────────────────────────────────────────────────────
-- Wave 6 added two nightly functions. `pg_cron` is not installed in `afrakala` and a cron
-- session carries NO JWT, so `auth.uid()` is NULL inside it. Both were therefore written as
-- SECURITY DEFINER with no caller check -- which is correct for the cron path and wrong for
-- everyone else, because `CREATE FUNCTION` leaves EXECUTE granted to `authenticated`.
--
-- `e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` caught it after the merge:
--
--   Error: SECURITY DEFINER writer(s) reachable by every authenticated user - a 'viewer'
--   included - with no check that refuses a CALLER:
--     notify_accountants_daily_accrual_summary, roll_employee_daily_streaks.
--
-- Measured before this migration:
--
--   notify_accountants_daily_accrual_summary(date) | prosecdef=t | authenticated=X | anon=f
--   roll_employee_daily_streaks(date)              | prosecdef=t | authenticated=X | anon=f
--
-- `anon` was already closed (migration 477 / gate og103 held), so the exposure was to any
-- signed-in user. Concretely: a `viewer` could post notifications into three accountants'
-- queues at will, and could advance or reset every employee's gamification streak and mint the
-- XP events that go with it. Neither is catastrophic; both are writes nobody should be able to
-- make from a browser.
--
-- ── Why REVOKE rather than a caller check ───────────────────────────────────────────────────
-- Adding `has_any_role(auth.uid(), ...)` would break the very path these exist for: cron has no
-- JWT, so `auth.uid()` is NULL and the assertion would refuse the scheduler itself -- silently,
-- because a cron failure is not surfaced anywhere a person looks. The functions genuinely have
-- exactly one legitimate caller each, and it is not a browser:
--
--   jobid 23 | afrakala-accrual-daily-notice     | username postgres        | database afrakala
--   jobid 25 | afrakala-employee-streaks-nightly | username supabase_admin  | database afrakala
--
-- Both job owners keep EXECUTE through their own grants, so revoking `authenticated` and
-- PUBLIC removes the browser path and leaves the scheduler untouched. Verified before writing
-- this: `grep -rn` over `src/` and `server/` finds ZERO callers of either name, so no UI, hook
-- or server route regresses.
--
-- This is the same shape as CLAUDE.md rule 9's standing warning -- `CREATE OR REPLACE FUNCTION`
-- restores default grants -- applied to CREATE. Any future cron-only definer function must
-- carry these REVOKEs in the same migration that creates it.
--
-- ── Not addressed here, deliberately ────────────────────────────────────────────────────────
-- `_capital_setting_reservation_count(uuid)` is also authenticated-executable, but it is
-- `STABLE` and returns an integer count -- a reader, not a writer, which is why og61 does not
-- flag it. It is left alone rather than swept in: narrowing it is a judgement about information
-- disclosure, not a regression this wave introduced.
--
-- `recompute_employee_scores_from_calls(timestamptz)` was checked and is already guarded --
-- `PERFORM public.gamification_assert_manager();` -- which og61 recognises as authorization.
-- No change needed.
-- ============================================================================================

REVOKE EXECUTE ON FUNCTION public.notify_accountants_daily_accrual_summary(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_accountants_daily_accrual_summary(date) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.roll_employee_daily_streaks(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.roll_employee_daily_streaks(date) FROM authenticated;

-- The scheduler's two owners keep EXECUTE explicitly, so the grant does not depend on whatever
-- default happened to be in place when the function was created.
GRANT EXECUTE ON FUNCTION public.notify_accountants_daily_accrual_summary(date) TO postgres, supabase_admin, service_role;
GRANT EXECUTE ON FUNCTION public.roll_employee_daily_streaks(date)              TO postgres, supabase_admin, service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
       'public.notify_accountants_daily_accrual_summary(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '507: notify_accountants_daily_accrual_summary is still authenticated-callable';
  END IF;

  IF has_function_privilege('authenticated',
       'public.roll_employee_daily_streaks(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '507: roll_employee_daily_streaks is still authenticated-callable';
  END IF;

  IF has_function_privilege('anon',
       'public.notify_accountants_daily_accrual_summary(date)', 'EXECUTE')
   OR has_function_privilege('anon', 'public.roll_employee_daily_streaks(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '507: anon must not reach either function';
  END IF;

  -- The point of the migration is that the scheduler still works. Assert it, rather than
  -- assuming the GRANT above did what it looks like it does.
  IF NOT has_function_privilege('postgres',
        'public.notify_accountants_daily_accrual_summary(date)', 'EXECUTE')
  OR NOT has_function_privilege('supabase_admin',
        'public.roll_employee_daily_streaks(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '507: a cron job owner lost EXECUTE -- the nightly jobs would stop silently';
  END IF;
END $$;
