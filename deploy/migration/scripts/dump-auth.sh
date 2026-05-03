#!/usr/bin/env bash
# AfraKala — dump جدول‌های auth از source (Lovable/Supabase Cloud)
# هشدار: این dump شامل اطلاعات حساس کاربران است. هرگز در ریپو commit نکنید.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"
DUMP_DIR="${DUMP_DIR:-${SCRIPT_DIR}/../dumps}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${SOURCE_DB_HOST:?SOURCE_DB_HOST required}"
: "${SOURCE_DB_PORT:?SOURCE_DB_PORT required}"
: "${SOURCE_DB_NAME:?SOURCE_DB_NAME required}"
: "${SOURCE_DB_USER:?SOURCE_DB_USER required}"
: "${SOURCE_DB_PASSWORD:?SOURCE_DB_PASSWORD required}"
DRY_RUN="${DRY_RUN:-true}"

TABLES=(auth.users auth.identities auth.sessions auth.refresh_tokens)
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="${DUMP_DIR}/auth-${TS}.dump"

mkdir -p "${DUMP_DIR}"
chmod 700 "${DUMP_DIR}" || true

CMD=(pg_dump --format=custom --no-owner --no-acl
     -h "${SOURCE_DB_HOST}" -p "${SOURCE_DB_PORT}"
     -U "${SOURCE_DB_USER}" -d "${SOURCE_DB_NAME}"
     -f "${OUT}")
for t in "${TABLES[@]}"; do CMD+=(-t "${t}"); done

echo "Source  : ${SOURCE_DB_USER}@${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME}"
echo "Tables  : ${TABLES[*]}"
echo "Output  : ${OUT}"
echo "Command : ${CMD[*]}"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[DRY_RUN] هیچ dumpی گرفته نشد."
  exit 0
fi

echo "⚠️  این dump شامل اطلاعات حساس است. مکان امن و رمزگذاری نگه دارید."
export PGPASSWORD="${SOURCE_DB_PASSWORD}"
"${CMD[@]}"
unset PGPASSWORD
chmod 600 "${OUT}"
echo "[OK] dump saved: ${OUT}"