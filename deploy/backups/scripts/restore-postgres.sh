#!/usr/bin/env bash
# AfraKala — restore Postgres از dump (داخل کانتینر)
# نیازمند CONFIRM_RESTORE=true و دو تایید دستی است.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

DUMP_PATH="${1:-}"
if [[ -z "${DUMP_PATH}" ]]; then echo "Usage: $0 <dump>" >&2; exit 1; fi
if [[ ! -f "${DUMP_PATH}" ]]; then echo "[ERROR] not found: ${DUMP_PATH}" >&2; exit 1; fi

require_var POSTGRES_CONTAINER_NAME
require_var POSTGRES_DB
require_var POSTGRES_USER
require_var POSTGRES_PASSWORD

log "container : ${POSTGRES_CONTAINER_NAME}"
log "database  : ${POSTGRES_DB}"
log "dump      : ${DUMP_PATH}"
log "⚠️  قبل از restore حتماً backup جدید بگیرید (backup-postgres.sh)."

if is_dry; then
  log "[DRY_RUN] restore انجام نشد. command:"
  log "  docker exec -i ${POSTGRES_CONTAINER_NAME} pg_restore --clean --if-exists --no-owner --no-acl -U ${POSTGRES_USER} -d ${POSTGRES_DB}"
  exit 0
fi
if [[ "${CONFIRM_RESTORE:-false}" != "true" ]]; then
  log "[ABORT] CONFIRM_RESTORE=true لازم است."
  exit 1
fi
read -r -p "تایپ کنید APPLY: " a1; [[ "${a1}" == "APPLY" ]] || { log "لغو"; exit 1; }
read -r -p "بار دوم — تایپ کنید RESTORE: " a2; [[ "${a2}" == "RESTORE" ]] || { log "لغو"; exit 1; }

docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER_NAME}" \
  pg_restore --clean --if-exists --no-owner --no-acl \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${DUMP_PATH}"
log "[OK] restore done."