#!/usr/bin/env bash
# AfraKala — اجرای ترتیبی migrationهای پروژه روی DB self-host (target)
# این اسکریپت در فاز SH.7 فقط آماده شده است؛ اجرای واقعی باید توسط devops انجام شود.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${ROOT_DIR}/../supabase/migrations}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${TARGET_DB_HOST:?TARGET_DB_HOST required}"
: "${TARGET_DB_PORT:?TARGET_DB_PORT required}"
: "${TARGET_DB_NAME:?TARGET_DB_NAME required}"
: "${TARGET_DB_USER:?TARGET_DB_USER required}"
: "${TARGET_DB_PASSWORD:?TARGET_DB_PASSWORD required}"
DRY_RUN="${DRY_RUN:-true}"

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "[ERROR] migrations dir not found: ${MIGRATIONS_DIR}" >&2
  exit 1
fi

mapfile -t FILES < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '*.sql' | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "[WARN] no .sql migrations found in ${MIGRATIONS_DIR}"
  exit 0
fi

echo "Target : ${TARGET_DB_USER}@${TARGET_DB_HOST}:${TARGET_DB_PORT}/${TARGET_DB_NAME}"
echo "Files  : ${#FILES[@]} migration(s)"
for f in "${FILES[@]}"; do echo "  - $(basename "$f")"; done

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[DRY_RUN] هیچ migrationی اجرا نشد. برای اجرای واقعی DRY_RUN=false کنید."
  exit 0
fi

read -r -p "آیا مطمئن هستید روی target اجرا شود؟ تایپ کنید APPLY: " ans
[[ "${ans}" == "APPLY" ]] || { echo "لغو شد."; exit 1; }

export PGPASSWORD="${TARGET_DB_PASSWORD}"
# اطمینان از client encoding برای جلوگیری از خراب شدن متن فارسی (UTF-8)
export PGCLIENTENCODING="UTF8"
for f in "${FILES[@]}"; do
  echo ">>> running $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -h "${TARGET_DB_HOST}" -p "${TARGET_DB_PORT}" \
       -U "${TARGET_DB_USER}" -d "${TARGET_DB_NAME}" \
       -v client_encoding=UTF8 \
       -f "$f"
done
unset PGPASSWORD
echo "[OK] all migrations applied."