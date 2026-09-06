SET client_encoding='UTF8';

-- ============================================================================
-- 492 - D-32: the daily notice. "امروز N سند تعهدی ثبت شد", to the accountants.
-- ============================================================================
--
-- 🔴 CONTRADICTION WITH THE MISSION BRIEF, RESOLVED IN FAVOUR OF THE DATABASE
-- ---------------------------------------------------------------------------
-- The brief for this row said: "A nightly pg_cron job via
-- cron.schedule_in_database('afrakala', ...) (three jobs already run that way --
-- copy their shape)", and CONTRACTS.md section 4 H·g lists "pg_cron | 1.6 |
-- installed". BOTH ARE FALSE on this database. Measured today, before writing a
-- line of this migration:
--
--   SELECT ... FROM pg_available_extensions WHERE name='pg_cron';
--   --> pg_cron 1.6 installed=NO
--
--   SELECT ... FROM cron.job;
--   --> ERROR: relation "cron.job" does not exist
--
-- pg_cron is AVAILABLE but NOT INSTALLED, there is no cron schema, and therefore
-- there are no three jobs to copy. Installing it is not a migration's business:
-- it requires shared_preload_libraries in postgresql.conf and a server restart.
--
-- The groundwork research had this right and the brief did not --
-- docs/research/accrual-ledger-groundwork-20260906.md line 300: "pg_cron نصب
-- نیست" ("pg_cron is not installed"), with the full pg_extension listing.
--
-- WHAT IS USED INSTEAD -- the repo's own established pattern, not a new mechanism
-- ---------------------------------------------------------------------------
-- Host cron calling a token-protected endpoint. Three endpoints already work this
-- way (generate-marketing-tasks, ingest-market-rates, process-pricing-queue), and
-- src/routes/api/public/hooks/generate-marketing-tasks.ts:11-17 states the reason
-- verbatim, having verified the same absence:
--
--   "Driven by host cron -- see deploy/app/scripts/marketing-tasks-cron.example.sh.
--    There is no pg_cron extension on this database ... so host cron calling a
--    token-protected endpoint is the established pattern in this repo, not a new
--    mechanism."
--
-- This migration provides the FUNCTION. The endpoint and the cron example ship
-- alongside it in the same commit.
--
-- THE FAN-OUT IS THE ONE THAT ALREADY EXISTS
-- ---------------------------------------------------------------------------
-- Copied from notify_accountants_on_sale_price_change lines 43-52: SELECT DISTINCT
-- ur.user_id FROM user_roles WHERE role::text = 'accountant', one notification_queue
-- row each. There are 3 accountants today.
--
-- IDEMPOTENT PER DAY. Re-running the cron, or a retry after a timeout, must not
-- send a second copy: an advisory lock serialises concurrent runs and an explicit
-- check skips a day already notified.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_accountants_daily_accrual_summary(
  p_for_date date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _day        date := COALESCE(p_for_date, public.tehran_today());
  _count      integer;
  _recipients integer := 0;
  _r          record;
  _title      text;
  _body       text;
BEGIN
  -- Serialise overlapping runs for the same day.
  PERFORM pg_advisory_xact_lock(hashtext('daily_accrual_notice:' || _day::text));

  SELECT count(*) INTO _count
    FROM public.journal_entries je
   WHERE je.doc_kind IN ('sale_accrual', 'purchase_accrual')
     AND je.status = 'posted'
     AND je.reverses_entry_id IS NULL
     AND je.entry_date = _day;

  IF EXISTS (
    SELECT 1 FROM public.notification_queue nq
     WHERE nq.type = 'daily_accrual_summary'
       AND nq.reference_type = 'accrual_day'
       AND nq.body LIKE '%' || _day::text || '%'
  ) THEN
    RETURN jsonb_build_object('for_date', _day, 'entries', _count,
                              'recipients', 0, 'skipped', 'already_sent');
  END IF;

  _title := 'خلاصهٔ اسناد تعهدی امروز';
  _body  := 'امروز ' || _count::text || ' سند تعهدی ثبت شد' ||
            ' (تاریخ ' || _day::text || ').';

  FOR _r IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role::text = 'accountant'
  LOOP
    INSERT INTO public.notification_queue
      (user_id, title, body, type, reference_type, reference_id)
    VALUES
      (_r.user_id, _title, _body, 'daily_accrual_summary', 'accrual_day', NULL);
    _recipients := _recipients + 1;
  END LOOP;

  RETURN jsonb_build_object('for_date', _day, 'entries', _count,
                            'recipients', _recipients, 'skipped', NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_accountants_daily_accrual_summary(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_accountants_daily_accrual_summary(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_accountants_daily_accrual_summary(date) TO service_role;
