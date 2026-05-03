#!/usr/bin/env bash
# AfraKala — نمونه sync بکاپ‌ها به مقصد offsite (داخل ایران ترجیحاً)
# این فقط نمونه است. ابزار rclone یا rsync باید روی سرور نصب و config شوند.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

if [[ "${OFFSITE_ENABLED:-false}" != "true" ]]; then
  log "offsite sync غیرفعال است (OFFSITE_ENABLED=false). خارج می‌شویم."
  exit 0
fi

require_var BACKUP_ROOT
require_var OFFSITE_REMOTE_NAME
require_var OFFSITE_REMOTE_PATH

log "source : ${BACKUP_ROOT}"
log "remote : ${OFFSITE_REMOTE_NAME}:${OFFSITE_REMOTE_PATH}"

if is_dry; then
  log "[DRY_RUN] هیچ syncی انجام نشد."
  exit 0
fi

# نمونه با rclone (نیاز به config رمزگذاری‌شده روی سرور):
#   rclone config  # یک بار
if command -v rclone >/dev/null 2>&1; then
  rclone sync "${BACKUP_ROOT}" "${OFFSITE_REMOTE_NAME}:${OFFSITE_REMOTE_PATH}" \
    --transfers=4 --checkers=8 --retries=3 --low-level-retries=10
# جایگزین با rsync روی SSH (مثلاً سرور دوم در DC داخلی):
# elif command -v rsync >/dev/null 2>&1; then
#   rsync -aH --delete -e "ssh -i /root/.ssh/offsite_id" \
#     "${BACKUP_ROOT}/" "${OFFSITE_REMOTE_NAME}:${OFFSITE_REMOTE_PATH}/"
else
  log "[ERROR] rclone نصب نیست."
  exit 1
fi
log "[OK] offsite sync done."