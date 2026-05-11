-- MR-AUTO.1 — Manual-apply pg_cron schedule for market-rate ingestion.
--
-- This file is INTENTIONALLY OUTSIDE supabase/migrations/ so it is never auto-applied.
-- Apply manually on the self-host Postgres after:
--   1) Backup taken: bash deploy/backups/scripts/backup-postgres.sh
--   2) MARKET_RATES_CRON_SECRET set in deploy/app/.env (>=32 random chars).
--   3) Replace REPLACE_ME placeholders below with the real internal app URL
--      and the real cron secret.
--   4) DRY_RUN review, then apply with psql as a superuser.
--
-- ROLLBACK: SELECT cron.unschedule('mr-auto-ingest-market-rates');
--
-- LOVABLE NOTE: pg_cron may not be available, and Cloudflare Workers may be
-- geo-blocked from Navasan. On Lovable, leave this UNAPPLIED and treat the
-- scheduler as "blocked / manual setup required" — see
-- docs/self-host-governance/09_INTERNET_RESILIENCE.md.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is not installed. Install it and rerun.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net extension is not installed. Install it and rerun.';
  end if;

  begin
    perform cron.unschedule('mr-auto-ingest-market-rates');
  exception when others then null;
  end;

  perform cron.schedule(
    'mr-auto-ingest-market-rates',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url     := 'https://REPLACE_ME.example.com/api/public/hooks/ingest-market-rates',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer REPLACE_WITH_MARKET_RATES_CRON_SECRET'
        ),
        body    := '{}'::jsonb
      ) as request_id;
  $cron$);
end
$$;