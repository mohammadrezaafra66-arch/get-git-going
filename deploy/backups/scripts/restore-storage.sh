#!/usr/bin/env bash
# AfraKala — restore storage از tar.gz روی volume
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" ]]; then echo "Usage: $0 <archive.tar.gz>" >&2; exit 1; fi
if [[ ! -f "${ARCHIVE}" ]]; then echo "[ERROR] not found: ${ARCHIVE}" >&2; exit 1; fi

require_var BACKUP_ROOT
require_var SUPABASE_STORAGE_VOLUME_PATH

SAFETY_DIR="${BACKUP_ROOT}/storage-safety/$(today)"
SAFETY_FILE="${SAFETY_DIR}/pre-restore-$(ts).tar.gz"

log "archive : ${ARCHIVE}"
log "target  : ${SUPABASE_STORAGE_VOLUME_PATH}"
log "safety  : ${SAFETY_FILE}"
log "⚠️  قبل از restore یک snapshot ایمنی از مسیر فعلی گرفته می‌شود."

if is_dry; then
  log "[DRY_RUN] restore و safety snapshot انجام نشد."
  exit 0
fi
if [[ "${CONFIRM_RESTORE:-false}" != "true" ]]; then
  log "[ABORT] CONFIRM_RESTORE=true لازم است."
  exit 1
fi
read -r -p "تایپ کنید APPLY: " a1; [[ "${a1}" == "APPLY" ]] || { log "لغو"; exit 1; }
read -r -p "بار دوم — تایپ کنید RESTORE: " a2; [[ "${a2}" == "RESTORE" ]] || { log "لغو"; exit 1; }

# safety snapshot
if [[ -d "${SUPABASE_STORAGE_VOLUME_PATH}" ]]; then
  ensure_dir "${SAFETY_DIR}"
  tar -C "$(dirname "${SUPABASE_STORAGE_VOLUME_PATH}")" \
      -czf "${SAFETY_FILE}" "$(basename "${SUPABASE_STORAGE_VOLUME_PATH}")"
  chmod 600 "${SAFETY_FILE}"
  log "[OK] safety snapshot saved."
fi

# restore
mkdir -p "${SUPABASE_STORAGE_VOLUME_PATH}"
tar -C "$(dirname "${SUPABASE_STORAGE_VOLUME_PATH}")" -xzf "${ARCHIVE}"
log "[OK] storage restore done."