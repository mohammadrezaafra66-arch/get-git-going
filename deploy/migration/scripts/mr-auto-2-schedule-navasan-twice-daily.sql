-- MR-AUTO.2 — Manual-apply pg_cron schedule for Navasan twice-daily ingestion.
--
-- Schedule (Asia/Tehran):  Saturday, Sunday, Monday, Tuesday, Wednesday at 12:00 and 13:00.
-- pg_cron evaluates cron expressions in UTC, so we use the UTC equivalent:
--   30 8,9 * * 6,0-3   (08:30 UTC = 12:00 Tehran, 09:30 UTC = 13:00 Tehran; UTC+3:30, no DST in Iran since 2022)
-- Days: 6=Sat, 0=Sun, 1=Mon, 2=Tue, 3=Wed.  Thu/Fri are intentionally excluded.
--
-- This file is INTENTIONALLY OUTSIDE supabase/migrations/ so it is never auto-applied.
-- Apply manually on the self-host (and/or Lovable Cloud) Postgres after:
--   1) Backup taken: bash deploy/backups/scripts/backup-postgres.sh
--   2) Server-only env set on the app container / Lovable Cloud Secrets:
--        MARKET_RATES_AUTO_INGEST_ENABLED=true
--        MARKET_RATES_EXTERNAL_ENABLED=true
--        NAVASAN_ENABLED=true
--        TGJU_ENABLED=false           (TGJU_PUBLIC_ENABLED also stays unset/false)
--        EXTERNAL_API_TIMEOUT_MS=15000
--        NAVASAN_API_KEY=...          (server-only, NEVER VITE_)
--   3) Replace REPLACE_ME_APP_URL below with the real internal app URL
--      (e.g. https://app.afrakala.ir on self-host,
--       or  https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app
--       for Lovable published).
--   4) Apply with psql as a superuser.
--
-- ROLLBACK: SELECT cron.unschedule('mr-auto-navasan-twice-daily');
--
-- Safety notes (already enforced by /api/public/hooks/ingest-market-rates):
--   * If any flag/key is missing, endpoint returns status="disabled" and does NOT overwrite the last valid rate.
--   * If Navasan is unreachable / non-2xx / timeout / empty / zero / non-numeric, the run is recorded as
--     "failed" and no rate is written — manual entry remains the source of truth.
--   * NAVASAN_API_KEY is read only inside the server route (process.env). It is never logged, never returned
--     in the response body, and never bundled into the client (no VITE_ prefix).
--   * TGJU is hard-disabled because TGJU_ENABLED / TGJU_PUBLIC_ENABLED are false; the endpoint will not call it.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is not installed. Install it and rerun.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net extension is not installed. Install it and rerun.';
  end if;

  -- Replace any previous version of this job (idempotent re-apply).
  begin
    perform cron.unschedule('mr-auto-navasan-twice-daily');
  exception when others then null;
  end;

  -- Also unschedule the legacy every-15-min job from MR-AUTO.1 if it exists,
  -- so the two schedules don't double-fire. Operators who still want the
  -- 15-min ingestion can reapply mr-auto-1-schedule-market-rates.sql instead.
  begin
    perform cron.unschedule('mr-auto-ingest-market-rates');
  exception when others then null;
  end;

  perform cron.schedule(
    'mr-auto-navasan-twice-daily',
    '30 8,9 * * 6,0-3',
    $cron$
      select net.http_post(
        url     := 'REPLACE_ME_APP_URL/api/public/hooks/ingest-market-rates',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := '{}'::jsonb,
        timeout_milliseconds := 20000
      ) as request_id;
  $cron$);
end
$$;

-- Verify:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'mr-auto-navasan-twice-daily';
--   SELECT jobid, status, return_message, start_time
--     FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'mr-auto-navasan-twice-daily')
--     ORDER BY start_time DESC LIMIT 10;