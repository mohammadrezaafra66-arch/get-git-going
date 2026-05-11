# MR-AUTO.1 — Automatic Market-Rate Ingestion

- Purpose: scheduled (every 15 min) Navasan ingestion in both Lovable and self-host.
- Audience: DevOps / Operator.
- Last updated: 2026-05-11
- Related: `09_INTERNET_RESILIENCE.md`, `10_ENVIRONMENT_MATRIX.md`, `07_MIGRATION_SAFETY.md`

## Endpoint

`POST /api/public/hooks/ingest-market-rates`

- Auth header (required): `Authorization: Bearer ${MARKET_RATES_CRON_SECRET}`
  (also accepts `X-Cron-Secret: ${MARKET_RATES_CRON_SECRET}`).
- No client UI calls this. Cron / pg_cron only.
- TGJU is intentionally NOT called in this phase.

## Server-only env (never `VITE_`)

| name | default | role |
|---|---|---|
| `MARKET_RATES_AUTO_INGEST_ENABLED` | `false` | master switch for the scheduled job |
| `MARKET_RATES_EXTERNAL_ENABLED` | `false` | global market-rate external switch |
| `NAVASAN_ENABLED` | `false` | per-source switch |
| `NAVASAN_API_KEY` | — | server-only secret |
| `NAVASAN_BASE_URL` | `https://www.navasan.tech/api` | overridable |
| `MARKET_RATES_CRON_SECRET` | — | shared secret with the scheduler |
| `MARKET_RATES_INGEST_INTERVAL_MINUTES` | `15` | informational (cron expression in SQL) |
| `EXTERNAL_API_TIMEOUT_MS` | `15000` | floor 15s, cap 60s |

## Response shape

```
{ ok, source: "NAVASAN_API", status, fetched, inserted, suspect,
  skipped_count, reason, run_id, timestamp }
```

`status` ∈ `completed | failed | skipped | disabled | unauthorized`.

## Self-host scheduler (pg_cron)

1. Take a fresh backup: `bash deploy/backups/scripts/backup-postgres.sh`.
2. Set `MARKET_RATES_CRON_SECRET` (>=32 random chars) and the rest of the
   flags in `deploy/app/.env` and restart the `web` container.
3. Edit `deploy/migration/scripts/mr-auto-1-schedule-market-rates.sql` and
   replace the two `REPLACE_ME` placeholders with the real internal app URL
   (e.g. `https://app.afrakala.ir`) and the real Bearer secret.
4. Apply manually with psql as a superuser:
   `psql "$DATABASE_URL" -f deploy/migration/scripts/mr-auto-1-schedule-market-rates.sql`
5. Verify: `SELECT * FROM cron.job WHERE jobname = 'mr-auto-ingest-market-rates';`
   and tail logs in `cron.job_run_details`.

Rollback: `SELECT cron.unschedule('mr-auto-ingest-market-rates');`

## MR-AUTO.2 — Navasan twice-daily schedule (Sat–Wed 12:00 & 13:00 Asia/Tehran)

For deployments that only need a light Navasan refresh twice per business day
(Saturday through Wednesday at 12:00 and 13:00 Iran time), apply
`deploy/migration/scripts/mr-auto-2-schedule-navasan-twice-daily.sql`
instead of the every-15-minute job above. The script also unschedules the
legacy `mr-auto-ingest-market-rates` job so the two cannot double-fire.

- Cron expression (UTC, what pg_cron sees): `30 8,9 * * 6,0-3`
  (08:30 UTC = 12:00 Tehran, 09:30 UTC = 13:00 Tehran; UTC+3:30, no DST.)
- Timezone-aware equivalent (for schedulers that support TZ): `0 12,13 * * 6,0-3` with `Asia/Tehran`.
- Days: 6=Sat, 0=Sun, 1=Mon, 2=Tue, 3=Wed. Thursday and Friday are excluded.
- Required server-only env on the app: `MARKET_RATES_AUTO_INGEST_ENABLED=true`,
  `MARKET_RATES_EXTERNAL_ENABLED=true`, `NAVASAN_ENABLED=true`,
  `NAVASAN_API_KEY=...`, `EXTERNAL_API_TIMEOUT_MS=15000`. Keep `TGJU_ENABLED=false`
  (and leave `TGJU_PUBLIC_ENABLED` unset) to ensure TGJU is not called.
- Manual rate entry is unaffected and remains the source of truth on any failure.
- Rollback: `SELECT cron.unschedule('mr-auto-navasan-twice-daily');`

## MR-AUTO.3 — Where the secrets live

The endpoint reads the same env names (`MARKET_RATES_AUTO_INGEST_ENABLED`,
`MARKET_RATES_EXTERNAL_ENABLED`, `NAVASAN_ENABLED`, `NAVASAN_API_KEY`,
`NAVASAN_BASE_URL`, `EXTERNAL_API_TIMEOUT_MS`, `TGJU_ENABLED`,
`TGJU_PUBLIC_ENABLED`) in both environments — the only difference is *where*
the operator sets them:

- **Lovable Preview / Lovable published**: Lovable Cloud → Secrets panel.
  All values are server-only (no `VITE_` prefix is ever allowed). Verified
  `2026-05-11`: this Lovable Cloud project has `pg_cron` and `pg_net`
  installed, so the schedule script can be applied directly here. If a future
  Lovable Cloud instance lacks them, fall back to an external scheduler that
  POSTs to `/api/public/hooks/ingest-market-rates` on cron
  `30 8,9 * * 6,0-3` (UTC) — same body `{}`, no auth header required.
- **Self-host (Linux + Docker)**: `deploy/app/.env` on the server, never
  committed. Apply the same SQL on the host Postgres.

The Navasan API key is read only inside server code via
`process.env.NAVASAN_API_KEY` (see
`src/routes/api/public/hooks/ingest-market-rates.ts` and
`src/lib/market-rates-ingestion.functions.ts`). It is never logged, never
returned in API responses, and never bundled into the client.

## Lovable preview / published

Status: **blocked / manual setup required.**

- pg_cron + pg_net are not assumed available on Lovable Cloud.
- Cloudflare Workers may be geo-blocked from `navasan.tech` even if a
  scheduler existed.
- Therefore: do NOT apply the SQL above on Lovable. Either (a) leave the
  scheduler off, or (b) run the cron from an external scheduler (e.g. a tiny
  always-on box) that POSTs to the published URL with the Bearer secret.
- The endpoint itself still works on Lovable for ad-hoc verification — when
  flags are off it returns `status: "disabled"` without any external call.

## Failure semantics

- Missing/wrong secret → HTTP 401, `status: "unauthorized"`, no ingest.
- Any flag off / key missing → HTTP 200, `status: "disabled" | "skipped"`,
  no external call.
- Navasan unreachable / timeout / non-2xx → HTTP 200, `status: "failed"`,
  the run row is closed as `failed`, core app keeps working.
- TGJU is hard-skipped in this phase (no fetch, no scrape).