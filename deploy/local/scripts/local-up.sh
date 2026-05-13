#!/usr/bin/env bash
# AfraKala — local self-host: bring stack up
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

if [ ! -f .env.local ]; then
  echo "[local-up] خطا: deploy/local/.env.local پیدا نشد." >&2
  echo "          ابتدا: cp deploy/local/.env.local.example deploy/local/.env.local" >&2
  echo "          و مقادیر واقعی را پر کنید." >&2
  exit 1
fi

# kong.yml را از نمونه supabase کپی کن (اگر هنوز ساخته نشده)
if [ ! -f kong.yml ]; then
  if [ -f ../supabase/kong.yml.example ]; then
    cp ../supabase/kong.yml.example kong.yml
    echo "[local-up] kong.yml از kong.yml.example ساخته شد."
  else
    echo "[local-up] خطا: deploy/supabase/kong.yml.example پیدا نشد." >&2
    exit 1
  fi
fi

echo "[local-up] در حال build و start کردن stack محلی..."
docker compose --env-file .env.local -f docker-compose.yml up -d --build

echo "[local-up] انجام شد. وضعیت:"
docker compose -f docker-compose.yml ps

cat <<EOF

آدرس‌های local:
  - Web:    http://localhost:3000
  - API:    http://localhost:8000
  - Studio: http://localhost:3001
  - Postgres (psql): postgresql://postgres@127.0.0.1:54322/postgres

لاگ‌ها: docker compose -f deploy/local/docker-compose.yml logs -f
EOF