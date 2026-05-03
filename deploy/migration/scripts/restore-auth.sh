#!/usr/bin/env bash
# AfraKala — restore auth dump روی target self-host
# اجرای واقعی نیازمند CONFIRM_PRODUCTION=true و تایپ دستی APPLY است.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"

DUMP_PATH="${1:-}"
if [[ -z "${DUMP_PATH}" ]]; then
  echo "Usage: $0 <path-to-auth.dump>" >&2; exit 1
fi
if [[ ! -f "${DUMP_PATH}" ]]; then
  echo "[ERROR] dump not found: ${DUMP_PATH}" >&2; exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2; exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${TARGET_DB_HOST:?TARGET_DB_HOST required}"
: "${TARGET_DB_PORT:?TARGET_DB_PORT required}"
: "${TARGET_DB_NAME:?TARGET_DB_NAME required}"
: "${TARGET_DB_USER:?TARGET_DB_USER required}"
: "${TARGET_DB_PASSWORD:?TARGET_DB_PASSWORD required}"
DRY_RUN="${DRY_RUN:-true}"
CONFIRM_PRODUCTION="${CONFIRM_PRODUCTION:-false}"

CMD=(pg_restore --no-owner --no-acl --clean --if-exists
     -h "${TARGET_DB_HOST}" -p "${TARGET_DB_PORT}"
     -U "${TARGET_DB_USER}" -d "${TARGET_DB_NAME}"
     "${DUMP_PATH}")

echo "Target  : ${TARGET_DB_USER}@${TARGET_DB_HOST}:${TARGET_DB_PORT}/${TARGET_DB_NAME}"
echo "Dump    : ${DUMP_PATH}"
echo "Command : ${CMD[*]}"
echo "⚠️  قبل از restore حتماً backup target گرفته شده باشد (SH.8)."

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[DRY_RUN] restore واقعی انجام نشد."
  exit 0
fi
if [[ "${CONFIRM_PRODUCTION}" != "true" ]]; then
  echo "[ABORT] CONFIRM_PRODUCTION=true لازم است."
  exit 1
fi
read -r -p "تایپ کنید APPLY برای restore واقعی: " a1
[[ "${a1}" == "APPLY" ]] || { echo "لغو شد."; exit 1; }
read -r -p "بار دوم تایید — تایپ کنید RESTORE: " a2
[[ "${a2}" == "RESTORE" ]] || { echo "لغو شد."; exit 1; }

export PGPASSWORD="${TARGET_DB_PASSWORD}"
"${CMD[@]}"
unset PGPASSWORD
echo "[OK] restore done."