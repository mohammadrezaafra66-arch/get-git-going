#!/usr/bin/env bash
# AfraKala — backup Postgres self-host (pg_dump -Fc داخل کانتینر)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

require_var BACKUP_ROOT
require_var POSTGRES_CONTAINER_NAME
require_var POSTGRES_DB
require_var POSTGRES_USER
require_var POSTGRES_PASSWORD

OUT_DIR="${BACKUP_ROOT}/pg/$(today)"
OUT_FILE="${OUT_DIR}/postgres-$(ts).dump"

log "container : ${POSTGRES_CONTAINER_NAME}"
log "database  : ${POSTGRES_DB}"
log "output    : ${OUT_FILE}"

if is_dry; then
  log "[DRY_RUN] هیچ backupی گرفته نشد. برای اجرای واقعی DRY_RUN=false."
  exit 0
fi

ensure_dir "${OUT_DIR}"

# password از طریق متغیر محیطی به docker exec پاس می‌شود — هرگز در args echo نمی‌شود
if ! docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER_NAME}" \
      pg_dump -Fc -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > "${OUT_FILE}"; then
  log "[FAIL] pg_dump failed"
  rm -f "${OUT_FILE}"
  exit 1
fi

chmod 600 "${OUT_FILE}"
SIZE=$(stat -c%s "${OUT_FILE}" 2>/dev/null || stat -f%z "${OUT_FILE}")
log "[OK] dump size=${SIZE}b"