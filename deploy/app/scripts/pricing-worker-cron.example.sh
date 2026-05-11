#!/usr/bin/env bash
# PRICE-RT.5 — Pricing recompute worker (host cron driver) — EXAMPLE ONLY.
#
# DO NOT commit a real PRICING_WORKER_TOKEN. The token is loaded at runtime
# from /etc/afrakala/app.env (chmod 600, owned by the operator user).
#
# Install (operator, on the self-host server only):
#   sudo install -m 0755 deploy/app/scripts/pricing-worker-cron.example.sh \
#       /usr/local/bin/afrakala-pricing-worker.sh
#
# Crontab line (runs twice per minute = ~every 30s; adjust as needed):
#   * * * * * /usr/local/bin/afrakala-pricing-worker.sh
#   * * * * * sleep 30 ; /usr/local/bin/afrakala-pricing-worker.sh
#
# Logs: /var/log/afrakala/pricing-worker.log (rotate via logrotate).

set -u

ENV_FILE="${AFRAKALA_ENV_FILE:-/etc/afrakala/app.env}"
LOG_DIR="${AFRAKALA_LOG_DIR:-/var/log/afrakala}"
LOG_FILE="${AFRAKALA_PRICING_LOG:-$LOG_DIR/pricing-worker.log}"
ENDPOINT="${AFRAKALA_PRICING_WORKER_URL:-https://app.afrakala.ir/api/public/hooks/process-pricing-queue}"
BATCH_SIZE="${AFRAKALA_PRICING_BATCH_SIZE:-50}"
TIMEOUT="${AFRAKALA_PRICING_TIMEOUT:-20}"

mkdir -p "$LOG_DIR" 2>/dev/null || true

# shellcheck disable=SC1090
if [ ! -r "$ENV_FILE" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR env file not readable: $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi
set -a
. "$ENV_FILE"
set +a

if [ -z "${PRICING_WORKER_TOKEN:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR PRICING_WORKER_TOKEN missing in $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

TS="$(date -u +%FT%TZ)"
# Pass token via header file to avoid leaking it on the process command line.
HDR_FILE="$(mktemp)"
trap 'rm -f "$HDR_FILE"' EXIT
{
  echo "Authorization: Bearer ${PRICING_WORKER_TOKEN}"
  echo "Content-Type: application/json"
} > "$HDR_FILE"

RESP="$(
  curl -sS --max-time "$TIMEOUT" \
    -o - -w '\nHTTP_STATUS=%{http_code} TIME=%{time_total}s\n' \
    -X POST "$ENDPOINT" \
    -H @"$HDR_FILE" \
    -d "{\"batch_size\":${BATCH_SIZE}}" 2>&1
)" || true

printf '[%s] %s\n' "$TS" "$RESP" >> "$LOG_FILE"