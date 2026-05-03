#!/usr/bin/env bash
# AfraKala — backup volume Storage به‌صورت tar.gz
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

require_var BACKUP_ROOT
require_var SUPABASE_STORAGE_VOLUME_PATH

OUT_DIR="${BACKUP_ROOT}/storage/$(today)"
OUT_FILE="${OUT_DIR}/storage-$(ts).tar.gz"

log "source : ${SUPABASE_STORAGE_VOLUME_PATH}"
log "output : ${OUT_FILE}"

if [[ ! -d "${SUPABASE_STORAGE_VOLUME_PATH}" ]]; then
  log "[WARN] storage path not found: ${SUPABASE_STORAGE_VOLUME_PATH}"
  is_dry || exit 1
fi

if is_dry; then
  log "[DRY_RUN] هیچ archiveی ساخته نشد."
  exit 0
fi

ensure_dir "${OUT_DIR}"
tar -C "$(dirname "${SUPABASE_STORAGE_VOLUME_PATH}")" \
    -czf "${OUT_FILE}" "$(basename "${SUPABASE_STORAGE_VOLUME_PATH}")"
chmod 600 "${OUT_FILE}"
SIZE=$(stat -c%s "${OUT_FILE}" 2>/dev/null || stat -f%z "${OUT_FILE}")
log "[OK] storage archive size=${SIZE}b"