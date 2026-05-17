#!/usr/bin/env bash
# AfraKala — local self-host: اجرای migrationهای supabase/migrations روی DB local
#
# قواعد:
#  - فقط روی DB local (127.0.0.1:54322) کار می‌کند.
#  - migrationها به ترتیب نام فایل اجرا می‌شوند.
#  - DRY_RUN=true → فقط لیست بدون اجرا.
#  - secret echo نمی‌شود.
#  - روی هر خطا متوقف می‌شود.
#
# استفاده:
#   bash deploy/local/scripts/local-apply-migrations.sh
#   DRY_RUN=true bash deploy/local/scripts/local-apply-migrations.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"
ENV_FILE="$HERE/.env.local"
DRY_RUN="${DRY_RUN:-false}"

if [ ! -d "$MIG_DIR" ]; then
  echo "[apply-migrations] خطا: $MIG_DIR پیدا نشد." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[apply-migrations] خطا: $ENV_FILE پیدا نشد." >&2
  exit 1
fi

set -a; . "$ENV_FILE"; set +a

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD در .env.local خالی است}"
: "${POSTGRES_DB:=postgres}"

mapfile -t FILES < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "[apply-migrations] هیچ migration در $MIG_DIR پیدا نشد."
  exit 0
fi

echo "[apply-migrations] هدف: postgres@127.0.0.1:54322/$POSTGRES_DB (LOCAL ONLY)"
echo "[apply-migrations] تعداد migration: ${#FILES[@]}"
for f in "${FILES[@]}"; do
  echo "  - $(basename "$f")"
done

if [ "$DRY_RUN" = "true" ]; then
  echo "[apply-migrations] DRY_RUN=true — اجرا نشد."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[apply-migrations] خطا: psql نصب نیست. (apt install postgresql-client)" >&2
  exit 1
fi

echo "[apply-migrations] برای ادامه ENTER بزنید (Ctrl+C برای لغو)..."
read -r _

export PGPASSWORD="$POSTGRES_PASSWORD"
# اطمینان از client encoding برای جلوگیری از خراب شدن متن فارسی (UTF-8)
export PGCLIENTENCODING="UTF8"
for f in "${FILES[@]}"; do
  echo "[apply-migrations] اجرای: $(basename "$f")"
  psql -v ON_ERROR_STOP=1 \
       --host 127.0.0.1 --port 54322 \
       --username postgres --dbname "$POSTGRES_DB" \
       --no-psqlrc \
       -v client_encoding=UTF8 \
       -f "$f"
done
unset PGPASSWORD

echo "[apply-migrations] همهٔ migrationها با موفقیت اجرا شدند."