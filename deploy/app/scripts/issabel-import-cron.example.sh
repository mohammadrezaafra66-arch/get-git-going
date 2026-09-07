#!/usr/bin/env bash
# C-6 / D-39 — واردسازی زمان‌بندی‌شدهٔ CDR ایزابل (host cron driver) — EXAMPLE ONLY.
#
# DO NOT commit a real ISSABEL_IMPORT_WORKER_TOKEN. The token is loaded at
# runtime from /etc/afrakala/app.env (chmod 600, owned by the operator user).
#
# Install (operator, on the self-host server only):
#   sudo install -m 0755 deploy/app/scripts/issabel-import-cron.example.sh \
#       /usr/local/bin/afrakala-issabel-import.sh
#
# ---------------------------------------------------------------------------
# WHY HOST CRON AND NOT pg_cron — measured on this database, 2026-09-07
# ---------------------------------------------------------------------------
# Database `afrakala` has NO pg_cron, NO http, NO pg_net:
#
#   afrakala: btree_gist pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt
#             pgsodium plpgsql supabase_vault uuid-ossp vector
#   postgres: pg_cron (+ the rest)
#
# pg_cron executes SQL, never a shell, so "a curl in a cron shell" has no
# mechanism behind it. Driving this import from the database would need TWO new
# extensions in the owner's database — pg_cron (or cron.schedule_in_database)
# plus http/pg_net — and would hand the database outbound network access purely
# to reach an endpoint host cron already reaches with nothing installed.
#
# Host cron calling a token-protected endpoint is also the ESTABLISHED pattern
# in this repo, not a new mechanism:
#   deploy/app/scripts/marketing-tasks-cron.example.sh
#   deploy/app/scripts/pricing-worker-cron.example.sh
#
# ---------------------------------------------------------------------------
# CRONTAB — D-39's five windows
# ---------------------------------------------------------------------------
# Asia/Tehran is UTC+03:30 and Iran abolished DST in 2022, so these do not shift.
#
# The owner states the schedule in TEHRAN time:
#   window 1   08:00–10:00   hourly          -> 08, 09                     2 runs
#   window 2   10:00–13:00   every 30 min    -> 10:00 … 12:30              6 runs
#   window 3   13:00–17:00   hourly          -> 13, 14, 15, 16             4 runs
#   window 4   17:00–20:00   hourly          -> 17, 18, 19                 3 runs
#   window 5   20:00–08:00   every 6 hours   -> 20, 02                     2 runs
#                                                              TOTAL      17 runs/day
#
# IF THE SERVER'S CRON RUNS IN TEHRAN LOCAL TIME — five lines, one per window:
#
#   0    8,9        * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 1
#   0,30 10,11,12   * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 2
#   0    13,14,15,16 * * * /usr/local/bin/afrakala-issabel-import.sh   # window 3
#   0    17,18,19   * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 4
#   0    20,2       * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 5
#
# IF THE SERVER'S CRON RUNS IN UTC — the half-hour offset splits window 2 into
# three expressions, so it becomes seven lines, not five:
#
#   30   4,5        * * *  ...   # window 1  (08,09 Tehran)
#   30   6          * * *  ...   # window 2a (10:00 Tehran)
#   0,30 7,8        * * *  ...   # window 2b (10:30–12:00 Tehran)
#   0    9          * * *  ...   # window 2c (12:30 Tehran)
#   30   9,10,11,12 * * *  ...   # window 3  (13–16 Tehran)
#   30   13,14,15   * * *  ...   # window 4  (17–19 Tehran)
#   30   16,22      * * *  ...   # window 5  (20, 02 Tehran)
#
# Check which one applies BEFORE installing — getting this wrong shifts every
# window by 3.5 hours:
#   timedatectl | grep 'Time zone'
#
# Overlapping or repeated runs are harmless: call_logs.external_id is uniquely
# indexed on linkedid and the importer filters before inserting, so a second
# call returns calls_inserted: 0.
#
# Logs: /var/log/afrakala/issabel-import.log (rotate via logrotate).

set -u

ENV_FILE="${AFRAKALA_ENV_FILE:-/etc/afrakala/app.env}"
LOG_DIR="${AFRAKALA_LOG_DIR:-/var/log/afrakala}"
LOG_FILE="${AFRAKALA_ISSABEL_LOG:-$LOG_DIR/issabel-import.log}"
ENDPOINT="${AFRAKALA_ISSABEL_IMPORT_URL:-http://127.0.0.1:3000/api/public/hooks/import-issabel-calls}"
TIMEOUT="${AFRAKALA_ISSABEL_TIMEOUT:-120}"

mkdir -p "$LOG_DIR" 2>/dev/null || true

if [ ! -r "$ENV_FILE" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR env file not readable: $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi
# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

if [ -z "${ISSABEL_IMPORT_WORKER_TOKEN:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR ISSABEL_IMPORT_WORKER_TOKEN missing in $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

TS="$(date -u +%FT%TZ)"
# Pass the token via a header file so it never appears on the process command
# line, where every user could read it with `ps`.
HDR_FILE="$(mktemp)"
trap 'rm -f "$HDR_FILE"' EXIT
{
  echo "Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}"
  echo "Content-Type: application/json"
} > "$HDR_FILE"

RESP="$(
  curl -sS --max-time "$TIMEOUT" \
    -o - -w '\nHTTP_STATUS=%{http_code} TIME=%{time_total}s\n' \
    -X POST "$ENDPOINT" \
    -H @"$HDR_FILE" 2>&1
)" || true

printf '[%s] %s\n' "$TS" "$RESP" >> "$LOG_FILE"
