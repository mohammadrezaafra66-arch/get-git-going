#!/usr/bin/env bash
# AfraKala — حذف backupهای قدیمی‌تر از RETENTION_DAYS_LOCAL
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

require_var BACKUP_ROOT
require_var RETENTION_DAYS_LOCAL

# safety
case "${BACKUP_ROOT}" in /|""|"/ ") echo "[ERROR] unsafe BACKUP_ROOT" >&2; exit 1 ;; esac
if [[ ! -d "${BACKUP_ROOT}" ]]; then
  log "[WARN] BACKUP_ROOT not present: ${BACKUP_ROOT}"; exit 0
fi

log "root      : ${BACKUP_ROOT}"
log "retention : ${RETENTION_DAYS_LOCAL} days"

# فقط زیرپوشه‌های شناخته‌شده را پاک می‌کنیم
for sub in pg storage env storage-safety; do
  D="${BACKUP_ROOT}/${sub}"
  [[ -d "${D}" ]] || continue
  while IFS= read -r f; do
    safe_under "${BACKUP_ROOT}" "${f}"
    if is_dry; then
      log "[DRY_RUN] would remove: ${f}"
    else
      rm -f "${f}" && log "removed: ${f}"
    fi
  done < <(find "${D}" -type f -mtime "+${RETENTION_DAYS_LOCAL}")
  # پوشه‌های روزانه خالی را پاک کن
  if ! is_dry; then
    find "${D}" -mindepth 1 -type d -empty -delete 2>/dev/null || true
  fi
done
log "[OK] cleanup done."