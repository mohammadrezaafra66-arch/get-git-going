#!/usr/bin/env bash
# AfraKala — local self-host: حذف کامل volumeها (DESTRUCTIVE — فقط local!)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

cat <<'WARN'
!!! هشدار !!!
این عملیات تمام دادهٔ Postgres و Storage محلی را پاک می‌کند.
فقط برای محیط local/laptop استفاده کنید — هرگز روی production.
WARN

read -rp "برای ادامه YES تایپ کنید: " ans
if [ "$ans" != "YES" ]; then
  echo "[local-reset-db] لغو شد."
  exit 0
fi

docker compose --env-file .env.local -f docker-compose.yml down -v
echo "[local-reset-db] volume‌های local پاک شدند. دفعهٔ بعد local-up.sh دیتابیس را تازه می‌سازد."