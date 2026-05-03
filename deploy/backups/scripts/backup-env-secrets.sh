#!/usr/bin/env bash
# AfraKala — backup رمزشده از فایل‌های .env و secrets با age
# خروجی: env-secrets-<ts>.tar.gz.age (فایل خام نگه‌داری نمی‌شود)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

require_var BACKUP_ROOT
require_var ENV_FILES_TO_BACKUP
require_var AGE_RECIPIENT

OUT_DIR="${BACKUP_ROOT}/env/$(today)"
OUT_FILE="${OUT_DIR}/env-secrets-$(ts).tar.gz.age"

log "files     : ${ENV_FILES_TO_BACKUP}"
log "recipient : <hidden>"
log "output    : ${OUT_FILE}"

if ! command -v age >/dev/null 2>&1; then
  log "[ERROR] 'age' دستی نصب نیست. نصب کنید: apt install age یا brew install age"
  is_dry || exit 1
fi

# لیست فایل‌های موجود را بساز
EXISTING=()
for f in ${ENV_FILES_TO_BACKUP}; do
  if [[ -f "$f" ]]; then EXISTING+=("$f"); else log "[WARN] missing: $f"; fi
done
if [[ ${#EXISTING[@]} -eq 0 ]]; then
  log "[ERROR] هیچ فایل env معتبری برای backup نیست."
  is_dry || exit 1
fi

if is_dry; then
  log "[DRY_RUN] فایل‌ها رمز/ذخیره نشدند. تعداد=${#EXISTING[@]}"
  exit 0
fi

ensure_dir "${OUT_DIR}"
# tar را مستقیم به age pipe می‌کنیم — هیچ فایل خامی روی دیسک باقی نمی‌ماند
tar -czf - "${EXISTING[@]}" 2>/dev/null | age -r "${AGE_RECIPIENT}" -o "${OUT_FILE}"
chmod 600 "${OUT_FILE}"
log "[OK] encrypted env backup written."