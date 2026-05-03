#!/usr/bin/env bash
# AfraKala — verify backup files (non-destructive)
# هیچ عملیات destructive روی production انجام نمی‌دهد.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

require_var BACKUP_ROOT

latest() { find "$1" -type f -name "$2" 2>/dev/null | sort | tail -n1; }

PG=$(latest "${BACKUP_ROOT}/pg" "*.dump" || true)
ST=$(latest "${BACKUP_ROOT}/storage" "*.tar.gz" || true)
EN=$(latest "${BACKUP_ROOT}/env" "*.tar.gz.age" || true)

log "latest pg      : ${PG:-<none>}"
log "latest storage : ${ST:-<none>}"
log "latest env enc : ${EN:-<none>}"

if is_dry; then
  log "[DRY_RUN] only listing, no integrity test."
  exit 0
fi

RC=0
if [[ -n "${PG}" ]]; then
  if pg_restore --list "${PG}" >/dev/null 2>&1; then
    log "[OK] pg dump readable: $(basename "${PG}")"
  else
    log "[FAIL] pg dump unreadable"; RC=2
  fi
else
  log "[WARN] no pg dump found"
fi

if [[ -n "${ST}" ]]; then
  if tar -tzf "${ST}" >/dev/null 2>&1; then
    log "[OK] storage archive readable: $(basename "${ST}")"
  else
    log "[FAIL] storage archive unreadable"; RC=2
  fi
fi

if [[ -n "${EN}" ]]; then
  if [[ -s "${EN}" ]]; then
    log "[OK] encrypted env backup present: $(basename "${EN}")"
  else
    log "[FAIL] encrypted env backup empty"; RC=2
  fi
fi

# اختیاری: اگر اسکریپت migration در دسترس بود، count tables را گزارش کن
MIG="${SCRIPT_DIR}/../../migration/scripts/verify-db-counts.sh"
if [[ -x "${MIG}" ]]; then
  log "(optional) برای مقایسه count جدول‌ها در staging: ${MIG}"
fi

exit "${RC}"