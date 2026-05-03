#!/usr/bin/env bash
# AfraKala — اجرای ترتیبی همه backupها + cleanup
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"
load_env

log "=== backup-postgres ==="
bash "${SCRIPT_DIR}/backup-postgres.sh"

log "=== backup-storage ==="
bash "${SCRIPT_DIR}/backup-storage.sh"

log "=== backup-env-secrets ==="
bash "${SCRIPT_DIR}/backup-env-secrets.sh"

log "=== cleanup-old-backups ==="
bash "${SCRIPT_DIR}/cleanup-old-backups.sh"

log "[OK] backup-all finished (DRY_RUN=${DRY_RUN:-true})."