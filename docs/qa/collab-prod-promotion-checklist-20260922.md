# Collaboration production promotion checklist — 2026-09-22

**OWNER-RUN ONLY.** Do not execute against `192.168.170.10` from an agent session that is not explicitly authorized for production.

Production app DB name is **`postgres`** (not `afrakala`). Cron catalog is also on `postgres`.

---

## 0. Preconditions

- [ ] Release branch `release/collab-20260922` merged/deployed through the normal release line to the production checkout (`C:\afrakala`, branch `main`).
- [ ] Test 3100 re-verify report is `READY` (A6, A3, C6, C11, D6, D7).
- [ ] Take a rollback tag / note current `APP_GIT_SHA` on production web before deploy.

---

## 1. Open-inquiry backlog (MANDATORY before enabling cron)

Count open SLA inquiries older than 10 minutes:

```sql
-- on production DB postgres
SELECT count(*) AS open_gt_10m
FROM public.inquiries
WHERE status IN (
  'pending','warning_5min','danger_8min','critical_10min','transfer_available'
)
AND now() - created_at > interval '10 minutes';
```

- [ ] If `open_gt_10m = 0` → safe to enable ticker with day-one penalties.
- [ ] If `open_gt_10m > 0` → **DO NOT schedule yet.** Expire/cancel or grace those rows first (owner decision). Enabling the 1-minute ticker would advance them and can issue `no_response_primary` red cards via `auto_submit_penalty` for any row that crosses critical without an existing active penalty.

Also inventory active penalties if needed:

```sql
SELECT count(*) FROM public.performance_penalties WHERE is_active AND type = 'no_response_primary';
```

---

## 2. Migrations to apply (in order)

From the release commit that contains:

1. `supabase/migrations/20260922180000_560_schedule_tick_inquiries.sql`

Apply with the project's production migration path (release blocks / `mig_apply`), then **record** in `supabase_migrations.schema_migrations` if applying via direct `psql`.

On production, `current_database() = 'postgres'`, so the DO block **registers** job `afrakala-tick-inquiries-1min` with **target database `postgres`** (because database `afrakala` does not exist there — the migration picks `postgres`).

Verify:

```sql
SELECT jobid, jobname, schedule, database, active
FROM cron.job
WHERE jobname = 'afrakala-tick-inquiries-1min';
-- expect: schedule '* * * * *', database='postgres', active=t
```

If the migration COMMENT-only path was used without the DO firing, register manually:

```sql
-- APPLY ON postgres (cron catalog)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'afrakala-tick-inquiries-1min') THEN
    PERFORM cron.unschedule('afrakala-tick-inquiries-1min');
  END IF;
END $$;

SELECT cron.schedule_in_database(
  'afrakala-tick-inquiries-1min',
  '* * * * *',
  'SELECT public.tick_inquiries();',
  'postgres',          -- PRODUCTION target DB name
  'supabase_admin',
  true
);
```

**Do not** copy the TEST companion script as-is (`deploy/lan/scripts/cron-560-schedule-tick-inquiries.sql` hardcodes `'afrakala'`).

---

## 3. Deploy web

Use existing production release / `update-lan.ps1` path with:

- `--no-deps` on `web`
- `GIT_SHA` set from `git rev-parse --short HEAD` on the command line
- `--env-file` for production `.env.lan`

Then:

```powershell
docker restart afrakala-lan-rest
```

Verify:

```powershell
docker exec afrakala-lan-web printenv APP_GIT_SHA
# must equal git rev-parse --short HEAD
```

---

## 4. Post-deploy smoke (owner)

- [ ] `/login` and `/api/healthz` 200
- [ ] Hub as sales/manager: help hints + sidebar pin visible (c1ea61a1)
- [ ] Viewer: **no** «پیام‌ها» hub card; mobile has no `/messages` shortcut
- [ ] Cold session `/collaboration` and `/dashboard` → `/login`
- [ ] Within 3 minutes: `cron.job_run_details` shows succeeded runs for the new job
- [ ] One fresh inquiry reaches `warning_5min` without manual `tick_inquiries`
- [ ] `/my-penalties` still shows `performance_penalties` (same table auto ticker writes)

---

## 5. Rollback

- Unschedule: `SELECT cron.unschedule('afrakala-tick-inquiries-1min');`
- Redeploy previous web image/SHA via release line
- `docker restart afrakala-lan-rest`
