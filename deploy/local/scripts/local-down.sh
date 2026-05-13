#!/usr/bin/env bash
# AfraKala — local self-host: stop stack (volume‌ها حفظ می‌شوند)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
docker compose --env-file .env.local -f docker-compose.yml down
echo "[local-down] stack خاموش شد. داده‌ها در volumeها (local-db-data, local-storage-data) حفظ شدند."
echo "             برای حذف کامل داده‌ها: bash scripts/local-reset-db.sh"