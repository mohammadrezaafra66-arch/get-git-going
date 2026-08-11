#!/usr/bin/env bash
# Phase 10 / requirement 224 — daily recurring marketing task generator
# (host cron driver) — EXAMPLE ONLY.
#
# DO NOT commit a real MARKETING_TASKS_WORKER_TOKEN. The token is loaded at
# runtime from /etc/afrakala/app.env (chmod 600, owned by the operator user).
#
# Install (operator, on the self-host server only):
#   sudo install -m 0755 deploy/app/scripts/marketing-tasks-cron.example.sh \
#       /usr/local/bin/afrakala-marketing-tasks.sh
#
# ---------------------------------------------------------------------------
# CRONTAB — the timezone matters and is the whole point of this file.
# ---------------------------------------------------------------------------
# The application decides "today" with public.tehran_today(); the job itself is
# therefore correct whatever time it runs. But cron should still fire just
# after the Tehran day starts, so the team sees today's list first thing.
#
# Asia/Tehran is UTC+03:30 (Iran abolished DST in 2022, so this does not shift).
# 00:05 Tehran == 20:35 UTC the PREVIOUS day:
#
#   35 20 * * * /usr/local/bin/afrakala-marketing-tasks.sh
#
# If your server's cron runs in local Tehran time instead of UTC, use:
#   5 0 * * * /usr/local/bin/afrakala-marketing-tasks.sh
#
# Check which one applies before installing:
#   timedatectl | grep 'Time zone'
#
# A midday safety re-run is harmless and recommended — the endpoint is
# idempotent, so a second call produces "generated: 0". It covers the case
# where the server was down at the start of the day:
#   5 9 * * * /usr/local/bin/afrakala-marketing-tasks.sh
#
# Logs: /var/log/afrakala/marketing-tasks.log (rotate via logrotate).

set -u

ENV_FILE="${AFRAKALA_ENV_FILE:-/etc/afrakala/app.env}"
LOG_DIR="${AFRAKALA_LOG_DIR:-/var/log/afrakala}"
LOG_FILE="${AFRAKALA_MARKETING_LOG:-$LOG_DIR/marketing-tasks.log}"
ENDPOINT="${AFRAKALA_MARKETING_TASKS_URL:-https://app.afrakala.ir/api/public/hooks/generate-marketing-tasks}"
TIMEOUT="${AFRAKALA_MARKETING_TIMEOUT:-30}"

mkdir -p "$LOG_DIR" 2>/dev/null || true

# shellcheck disable=SC1090
if [ ! -r "$ENV_FILE" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR env file not readable: $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi
set -a
. "$ENV_FILE"
set +a

if [ -z "${MARKETING_TASKS_WORKER_TOKEN:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR MARKETING_TASKS_WORKER_TOKEN missing in $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

TS="$(date -u +%FT%TZ)"
# Pass the token via a header file so it never appears on the process command
# line (visible to every user via `ps`).
HDR_FILE="$(mktemp)"
trap 'rm -f "$HDR_FILE"' EXIT
{
  echo "Authorization: Bearer ${MARKETING_TASKS_WORKER_TOKEN}"
  echo "Content-Type: application/json"
} > "$HDR_FILE"

RESP="$(
  curl -sS --max-time "$TIMEOUT" \
    -o - -w '\nHTTP_STATUS=%{http_code} TIME=%{time_total}s\n' \
    -X POST "$ENDPOINT" \
    -H @"$HDR_FILE" 2>&1
)" || true

printf '[%s] %s\n' "$TS" "$RESP" >> "$LOG_FILE"
